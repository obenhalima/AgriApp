import {expect,it} from 'vitest'
import * as XLSX from 'xlsx'
import {readEmployeeRecovery,missingEmployeeInformation,employeeEditError} from './employeeRecovery'
import {buildEmployeeRecoveryTemplate} from './employeeRecoveryTemplate'
import ExcelJS from 'exceljs'

function workbook(rows:any[][]) {
  const sheet=XLSX.utils.aoa_to_sheet([[],[],[],['N°','Nom (comme dans le pointage)','Nom sur l’émargement','Taux normal (DH/h)','Équivalent DH/jour','Taux h. sup (DH/h)','Ancienneté %','Statut','Remarque'],...rows])
  const book=XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book,sheet,'Employés')
  return XLSX.write(book,{type:'array',bookType:'xlsx'}) as ArrayBuffer
}
it('reads available values and preserves missing data, inactive employees and zero seniority',()=>{
  const rows=readEmployeeRecovery(workbook([[1,'NOM COMPLET','ALIAS',11.9345625,95.4765,11.375,0,'Inactif','À confirmer'],[null,'AUTRE NOM']]))
  expect(rows).toHaveLength(2)
  expect(rows[0]).toMatchObject({normal_hourly_rate:11.9345625,daily_rate:95.4765,seniority_rate:0,is_active:false,payment_name:'ALIAS'})
  expect(rows[1]).toMatchObject({source_number:null,normal_hourly_rate:null,seniority_rate:null,is_active:null})
})
it('reads numeric cached formula results and excludes the total row',()=>{
  const book=XLSX.read(workbook([[1,'TEST',null,12,96,15,0,'Actif']]),{type:'array'})
  book.Sheets['Employés']['E5']={t:'n',v:96,f:'D5*8'}
  const rows=readEmployeeRecovery(XLSX.write(book,{type:'array',bookType:'xlsx'}))
  expect(rows[0].daily_rate).toBe(96)
})
it('rejects duplicate identities and malformed rates without inventing data',()=>{
  expect(()=>readEmployeeRecovery(workbook([[1,'Nom Test'],[2,' nom  test ']]))).toThrow('plusieurs fois')
  expect(()=>readEmployeeRecovery(workbook([[1,'Nom',null,'prix inconnu']]))).toThrow('nombre invalide')
})
it('shows missing fields but treats known zero values as complete',()=>{
  const missing=missingEmployeeInformation({first_name:'',last_name:'SOURCE',seniority_rate:0,dependents:0})
  expect(missing).not.toContain('Prénom')
  expect(missing).toContain('CIN')
  expect(missing).not.toContain('Taux ancienneté')
  expect(missing).not.toContain('Personnes à charge')
})
it('restores normal form controls on any modification of an incomplete record',()=>{
  expect(employeeEditError({first_name:' ',last_name:''},['farm'])).toBe('Le nom est requis')
  expect(employeeEditError({first_name:'',last_name:'NOM COMPLET'},['farm'])).toBeNull()
  expect(employeeEditError({first_name:'Prénom',last_name:'Nom',farm_id:'foreign'},['farm'])).toContain('inaccessible')
  expect(employeeEditError({first_name:'Prénom',last_name:'Nom',farm_id:'farm',normal_hourly_rate:-1},['farm'])).toContain('invalide')
  expect(employeeEditError({first_name:'Prénom',last_name:'Nom',farm_id:'farm',cin:null},['farm'])).toBeNull()
})

it('exports a tenant-bound model and reimports a filled employee with known profile fields',async()=>{
  const context={domain:'client-a',farm:'farm-a'}
  const blob=await buildEmployeeRecoveryTemplate({domain:context.domain,domainCode:'CLIENT-A',domainName:'Client A',farm:{id:context.farm,code:'F01',name:'Ferme A'},workers:[{matricule:'EMP-1',first_name:'Ancien',last_name:'Salarié'}]})
  const book=new ExcelJS.Workbook()
  await book.xlsx.load(await blob.arrayBuffer())
  expect(book.getWorksheet('Ref_Employes')?.getCell('A2').value).toBe('EMP-1')
  expect(book.getWorksheet('_Contexte')?.state).toBe('hidden')
  const sheet=book.getWorksheet('Employes_Import')!
  sheet.getCell('C2').value='Prénom'
  sheet.getCell('B2').value='Nom'
  sheet.getCell('J2').value='AB001'
  sheet.getCell('P2').value='Oui'
  sheet.getCell('D2').value=12.34567
  sheet.getCell('G2').value=0
  sheet.getCell('H2').value='Actif'
  sheet.getCell('N2').value=new Date('2026-07-01T00:00:00Z')
  expect(sheet.getRow(1).values).not.toContain('Nom complet source')
  expect(sheet.getRow(1).values).not.toContain('Nom sur émargement')
  const bytes=await book.xlsx.writeBuffer()
  const rows=readEmployeeRecovery(bytes as ArrayBuffer,context)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({source_name:'Nom Prénom',normal_hourly_rate:12.34567,seniority_rate:0,profile:{first_name:'Prénom',last_name:'Nom',cin:'AB001',start_date:'2026-07-01',is_declared:'true'}})
  expect(()=>readEmployeeRecovery(bytes as ArrayBuffer,{domain:'client-b',farm:'farm-a'})).toThrow('autre client')
  expect(()=>readEmployeeRecovery(bytes as ArrayBuffer,{domain:'client-a',farm:'farm-b'})).toThrow('autre client')
})
