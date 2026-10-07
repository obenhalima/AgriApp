import {it,expect} from 'vitest'
import {harvestImportPayload,harvestWorkflowImportPayload} from './harvestMigrationImport'
import type {MigrationCatalog,MigrationData} from './harvestMigration'
const catalog:MigrationCatalog={domainId:'d',domainName:'Client',fetchedAt:'2026-10-06',plantings:[{id:'p',label:'P',farm:'F',campaign:'C',greenhouse:'S',variety:'V'}],trays:[{code:'plateau_10',label:'10 kg',weight:10}],markets:[],destinations:[],existing:[]}
const fixture=():MigrationData=>({Recoltes:[{ref:'HIST-1',planting:'P',date:'2026-09-25',tray:'plateau_10',count:14,notes:'Source export'}]})
it('builds a stable crates-only payload and never invents labor or dispatches',()=>{
 const rows=harvestImportPayload(fixture(),catalog)
 expect(rows[0]).toMatchObject({ref:'HIST-1',planting_id:'p',kg:140,people:null,hours:null,full_day:false,trays:[{code:'plateau_10',count:14,unit_kg:10}]})
 expect(harvestImportPayload(fixture(),catalog)).toEqual(rows)
})
it('rejects later workflow stages, unknown trays and mismatched measured weights',()=>{
 const d=fixture();d.Envois=[{ref:'E'}];expect(()=>harvestImportPayload(d,catalog)).toThrow('uniquement')
 delete d.Envois;d.Recoltes[0].tray='unknown';expect(()=>harvestImportPayload(d,catalog)).toThrow('erreurs')
 d.Recoltes[0].tray='plateau_10';d.Recoltes[0].kg=150;d.Recoltes[0].weight='Mesuré';expect(()=>harvestImportPayload(d,catalog)).toThrow('diffère')
})
it('does not import kilograms without the required tray detail',()=>{
 const d=fixture();delete d.Recoltes[0].tray;delete d.Recoltes[0].count;Object.assign(d.Recoltes[0],{kg:140,weight:'Estimé'})
 expect(()=>harvestImportPayload(d,catalog)).toThrow('exige des caisses')
})
it('links a dispatch to stable harvest references and a referenced market, leaving pricing absent',()=>{
 const d=fixture();d.Envois=[{ref:'E1',market:'Export Salad',date:'2026-09-25',kg:140,notes:'Reconstitué sur hypothèse'}];d.Sources=[{dispatch:'E1',harvest:'HIST-1',kg:140}]
 const c={...catalog,markets:[{id:'m',label:'Export Salad',client:'Salad Time',currency:'MAD',type:'export'}]}
 const p=harvestWorkflowImportPayload(d,c)
 expect(p.harvests).toEqual(harvestImportPayload(fixture(),catalog))
 expect(p.dispatches).toEqual([{ref:'E1',market_id:'m',date:'2026-09-25',kg:140,notes:'Reconstitué sur hypothèse',sources:[{harvest_ref:'HIST-1',kg:140}]}])
 d.Sources[0].kg=150;expect(()=>harvestWorkflowImportPayload(d,c)).toThrow('erreurs')
})
it('blocks unsupported pricing and orphan sources',()=>{
 const d=fixture();d.Prix=[{ref:'P'}];expect(()=>harvestWorkflowImportPayload(d,catalog)).toThrow('pas encore')
 delete d.Prix;d.Sources=[{dispatch:'missing',harvest:'HIST-1',kg:140}];expect(()=>harvestWorkflowImportPayload(d,catalog)).toThrow()
})
