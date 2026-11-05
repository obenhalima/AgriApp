import {it,expect} from 'vitest'
import ExcelJS from 'exceljs'
import {harvestMigrationWorkbook,readHarvestMigration} from './harvestMigrationWorkbook'
import {resolveSimpleHarvests,SIMPLE_HARVEST_HEADERS} from './harvestSimpleWorkbook'
import {harvestImportPayload} from './harvestMigrationImport'
import type {MigrationCatalog} from './harvestMigration'
const catalog:MigrationCatalog={domainId:'d',domainName:'Test',fetchedAt:'2026-10-13',plantings:[{id:'p',label:'Plantation',farm:'F1 — Ferme',greenhouse:'S1 — Serre',campaign:'C1',variety:'V1 — Variété',start:'2026-09-01',end:'2027-05-01'}],trays:[{code:'P10',label:'Plateau 10 kg',weight:10}],markets:[],destinations:[],existing:[]}
it('protects kilos and keeps the human workflow in the requested column order',async()=>{
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(await (await harvestMigrationWorkbook(catalog,'harvests')).arrayBuffer())
 const s=wb.getWorksheet('Recoltes')!
 expect((s.getRow(1).values as ExcelJS.CellValue[]).slice(1)).toEqual(SIMPLE_HARVEST_HEADERS)
 // XLSX omits the default locked=true style; absence means locked in Excel.
 expect(s.getCell('G2').protection?.locked ?? true).toBe(true)
 expect(s.getCell('A2').protection?.locked).toBe(false)
 expect(s.getCell('G2').formula).toContain('F2*VLOOKUP')
 expect(s.getCell('D2').formula).toContain('COUNTIFS')
 expect(s.getCell('C2').dataValidation.formulae?.[0]).toContain('INDIRECT')
 expect(s.getCell('D2').dataValidation.formulae?.[0]).toContain('Ref_Serres')
 expect(s.getColumn(11).hidden).toBe(true)
})
it('infers the unique variety and recalculates kilograms even when Excel output is tampered with',async()=>{
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(await (await harvestMigrationWorkbook(catalog,'harvests')).arrayBuffer())
 const s=wb.getWorksheet('Recoltes')!
 s.getCell('A2').value=new Date('2026-10-10');s.getCell('B2').value=catalog.plantings[0].farm;s.getCell('C2').value=catalog.plantings[0].greenhouse
 s.getCell('E2').value='Plateau 10 kg [P10]';s.getCell('F2').value=14;s.getCell('G2').value=9999
 const parsed=await readHarvestMigration(await wb.xlsx.writeBuffer() as ArrayBuffer,'d','harvests',catalog)
 const payload=harvestImportPayload(parsed,catalog)
 expect(payload).toHaveLength(1)
 expect(payload[0]).toMatchObject({planting_id:'p',kg:140,people:null,hours:null,full_day:false})
})
it('requires a variety choice when ambiguous and never guesses among two plantations',()=>{
 const c={...catalog,plantings:[...catalog.plantings,{...catalog.plantings[0],id:'p2',label:'Plantation 2',variety:'V2 — Deuxième variété'}]}
 const row={__row:2,ref:'R1',date:'2026-10-10',farm:catalog.plantings[0].farm,greenhouse:catalog.plantings[0].greenhouse,tray:'Plateau 10 kg [P10]',count:3}
 expect(()=>resolveSimpleHarvests([row],c)).toThrow('choisir une variété')
 expect(resolveSimpleHarvests([{...row,variety:'V2 — Deuxième variété'}],c).Recoltes[0].planting).toBe('Plantation 2')
 const same={...c,plantings:c.plantings.map(p=>({...p,variety:catalog.plantings[0].variety}))}
 expect(()=>resolveSimpleHarvests([row],same)).toThrow('plusieurs plantations')
})
