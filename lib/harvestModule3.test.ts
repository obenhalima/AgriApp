import {it,expect} from 'vitest'
import ExcelJS from 'exceljs'
import {readFileSync} from 'node:fs'
import {harvestMigrationWorkbook,readHarvestMigration} from './harvestMigrationWorkbook'
import type {MigrationCatalog} from './harvestMigration'
const catalog:MigrationCatalog={domainId:'client-test',domainName:'Test',fetchedAt:'2026-10-13',plantings:[{id:'p',label:'Plantation test',farm:'F',campaign:'C',greenhouse:'S',variety:'V'}],trays:[{code:'P10',label:'Plateau 10 kg',weight:10}],markets:[],destinations:[],existing:[]}
it('exports a client-bound module 3 template with one simplified input sheet',async()=>{
 const blob=await harvestMigrationWorkbook(catalog,'harvests')
 const workbook=new ExcelJS.Workbook()
 await workbook.xlsx.load(await blob.arrayBuffer())
 expect(workbook.getWorksheet('Recoltes')).toBeTruthy()
 expect(workbook.getWorksheet('Plateaux')).toBeUndefined()
 for(const stage of ['Envois','Sources','Pesees','Tri','Prix'])expect(workbook.getWorksheet(stage)).toBeUndefined()
 const parsed=await readHarvestMigration(await blob.arrayBuffer(),catalog.domainId,'harvests',catalog)
 expect(parsed.Recoltes).toHaveLength(0)
 expect(parsed.Envois).toHaveLength(0)
})
it('preserves the existing full-workflow template',async()=>{
 const blob=await harvestMigrationWorkbook(catalog)
 const workbook=new ExcelJS.Workbook()
 await workbook.xlsx.load(await blob.arrayBuffer())
 expect(workbook.getWorksheet('Envois')).toBeTruthy()
 expect(workbook.getWorksheet('Sources')).toBeTruthy()
})
it('uses the harvest-only payload and exposes a dedicated module entry (source contract)',()=>{
 const panel=readFileSync(new URL('../components/harvest/HarvestMigration.tsx',import.meta.url),'utf8')
 expect(panel).toContain('harvestImportPayload(data,c),dispatches:[]')
 expect(panel).toContain('if(!payload.harvests.length)')
 expect(panel).toContain('scope===\'harvests\' && !c.plantings.length')
 const page=readFileSync(new URL('../app/admin/initialisation/page.tsx',import.meta.url),'utf8')
 expect(page).toContain('<HarvestMigration scope="harvests" initiallyOpen')
})
