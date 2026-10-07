import { describe,it,expect } from 'vitest'
import { checkHarvestMigration, type MigrationCatalog, type MigrationData } from './harvestMigration'
import { harvestMigrationWorkbook, readHarvestMigration } from './harvestMigrationWorkbook'
const catalog:MigrationCatalog={domainId:'d1',domainName:'Client test',fetchedAt:'2026-10-02',plantings:[{id:'p1',label:'Ferme / Campagne / S01 / Tomate',farm:'F1',campaign:'C1',greenhouse:'S01',variety:'V1'}],markets:[{id:'m1',label:'Station test',currency:'MAD',client:'Client station',type:'export'}],trays:[{code:'P1',label:'Plateau',weight:10}],destinations:[{code:'retour_stock',label:'Retour stock'}],existing:[]}
const fixture=():MigrationData=>({Recoltes:[{ref:'R1',planting:catalog.plantings[0].label,date:'2026-09-01',kg:100,weight:'Estimé'}],Envois:[{ref:'E1',market:'Station test',date:'2026-09-02',kg:100}],Sources:[{dispatch:'E1',harvest:'R1',kg:100}],Pesees:[{dispatch:'E1',date:'2026-09-02',kg:95,document:'Ticket'}],Tri:[{dispatch:'E1',date:'2026-09-03',baseKg:95,lossKg:5,rejectKg:10,acceptedKg:80,destination:'retour_stock'}],Prix:[{ref:'PR1',dispatch:'E1',date:'2026-09-04',portion:'Accepté',kg:40,price:2,currency:'MAD',document:'B1'},{ref:'PR2',dispatch:'E1',date:'2026-09-05',portion:'Accepté',kg:40,price:3,currency:'MAD',document:'B2'}]})
describe('Historical harvest collection',()=>{
 it('warns only for the same known tray type on the same planting and date',()=>{
  const d=fixture();Object.assign(d.Recoltes[0],{kg:'',weight:'',tray:'P1',count:10,unitKg:10})
  d.Recoltes.push({...d.Recoltes[0],ref:'R2',tray:'P2',count:4,unitKg:25})
  const c={...catalog,trays:[...catalog.trays,{code:'P2',label:'Caisse 25',weight:25}]}
  expect(checkHarvestMigration(d,c).issues).toEqual([])
  d.Recoltes[1].tray='P1'
  expect(checkHarvestMigration(d,c).issues.some(i=>i.message.includes('même plantation, date'))).toBe(true)
 })
 it('accepts crates directly on the harvest and prevents double entry',()=>{
  const d=fixture();Object.assign(d.Recoltes[0],{kg:'',weight:'',tray:'P1',count:10,unitKg:10})
  expect(checkHarvestMigration(d,catalog).issues).toEqual([])
  expect(checkHarvestMigration(d,catalog).harvestKg).toBe(100)
  d.Plateaux=[{harvest:'R1',tray:'P1',count:10,unitKg:10}]
  expect(checkHarvestMigration(d,catalog).issues.some(i=>i.message.includes('pas les deux'))).toBe(true)
 })
 it('derives harvest kg from several crate types without requiring entered kg',()=>{
  const d=fixture(); d.Recoltes[0].kg=''; d.Recoltes[0].weight=''
  d.Plateaux=[{harvest:'R1',tray:'P1',count:5,unitKg:10},{harvest:'R1',tray:'P1',count:10,unitKg:5}]
  const result=checkHarvestMigration(d,catalog)
  expect(result.issues).toEqual([]);expect(result.harvestKg).toBe(100)
 })
 it('flags current-reference estimates and refuses missing weights or false measured claims',()=>{
  const d=fixture();d.Recoltes[0].kg='';d.Recoltes[0].weight=''
  d.Plateaux=[{harvest:'R1',tray:'P1',count:10,unitKg:''}]
  expect(checkHarvestMigration(d,catalog).harvestKg).toBe(100)
  expect(checkHarvestMigration(d,catalog).notes.some(i=>i.includes('estimé automatiquement'))).toBe(true)
  expect(checkHarvestMigration(d,{...catalog,trays:[{code:'P1',label:'Plateau',weight:0}]}).issues.some(i=>i.severity==='error')).toBe(true)
  d.Recoltes[0].weight='Mesuré'
  expect(checkHarvestMigration(d,catalog).issues.some(i=>i.message.includes('pas mesuré'))).toBe(true)
 })
 it('allows independent optional stages and complete partial pricing',()=>{expect(checkHarvestMigration(fixture(),catalog).issues).toEqual([]);expect(checkHarvestMigration({Recoltes:fixture().Recoltes},catalog).issues).toEqual([])})
 it('rejects foreign references, duplicates, invalid dates and negative quantities',()=>{
  const d=fixture();d.Recoltes.push({...d.Recoltes[0],planting:'other',date:'2026-02-30',kg:-1})
  const msgs=checkHarvestMigration(d,catalog).issues.map(i=>i.message).join(' ')
  expect(msgs).toContain('référentiel');expect(msgs).toContain('répétée');expect(msgs).toContain('Date invalide');expect(msgs).toContain('Nombre invalide')
 })
 it('checks source allocation, tri balance, currency and cumulative priced quantities',()=>{
  const d=fixture();d.Sources[0].kg=101;d.Tri[0].acceptedKg=79;d.Prix[0].currency='EUR'
  const msgs=checkHarvestMigration(d,catalog).issues.map(i=>i.message).join(' ')
  expect(msgs).toContain('dépassent');expect(msgs).toContain('Sources');expect(msgs).toContain('égaler');expect(msgs).toContain('Devise');expect(msgs).toContain('cumul tarifé')
 })
 it('flags likely existing harvests and preserves Excel row numbers',()=>{
  const d=fixture();d.Recoltes[0].__row=42
  expect(checkHarvestMigration(d,{...catalog,existing:[{planting:'p1',date:'2026-09-01',ref:'other'}]}).issues).toContainEqual(expect.objectContaining({row:42,severity:'warning'}))
 })
 it('exports a blank model with scoped references and reads it; refuses another tenant and input formulas',async()=>{
  const blob=await harvestMigrationWorkbook(catalog), buffer=await blob.arrayBuffer()
  const parsed=await readHarvestMigration(buffer,'d1');expect(Object.values(parsed).every(r=>!r.length)).toBe(true)
  await expect(readHarvestMigration(buffer,'d2')).rejects.toThrow('autre client')
  const ExcelJS=(await import('exceljs')).default,wb=new ExcelJS.Workbook();await wb.xlsx.load(buffer)
  expect(wb.getWorksheet('Ref_Plantations')!.getCell('A2').value).toBe(catalog.plantings[0].label)
  expect(wb.getWorksheet('Recoltes')!.getCell('A1').value).toBe('Type de caisse / plateau')
  expect(wb.getWorksheet('Recoltes')!.getCell('B1').value).toBe('Nombre de caisses / plateaux')
  expect(wb.getWorksheet('Recoltes')!.getCell('E2').dataValidation.formulae).toEqual(['Liste_Plantations'])
  wb.getWorksheet('Recoltes')!.getCell('A2').value={formula:'1+1',result:2}
  await expect(readHarvestMigration(await wb.xlsx.writeBuffer() as ArrayBuffer,'d1')).rejects.toThrow('formule')
 },30000)
})
