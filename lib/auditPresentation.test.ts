import {it,expect} from 'vitest'
import {auditChanges,auditEntityLabel,auditTablesForPath,auditValue} from './auditPresentation'
import type {AuditEvent} from './auditReport'
const event={category:'transaction',table_name:'greenhouses',action:'create',before_values:null,after_values:{code:'S06',name:'S1',status:'active',total_area:5000,farm_id:'f1',created_at:'2026-10-15'},changed_fields:['code','name','status','total_area','farm_id','created_at'],reference_labels:{f1:'Ferme Nord'}} as unknown as AuditEvent
it('presents the user screenshot as business labels and units without UUIDs or timestamps noise',()=>{
 expect(auditEntityLabel(event)).toBe('S06 — S1')
 expect(auditChanges(event)).toEqual(expect.arrayContaining([expect.objectContaining({label:'Surface totale',after:'5 000 m²'}),expect.objectContaining({label:'Ferme',after:'Ferme Nord'})]))
 expect(auditChanges(event).some(x=>x.field==='created_at')).toBe(false)
})
it('does not invent a currency, relation or field values',()=>{
 expect(auditValue(event,'amount',120,{})).toContain('devise non précisée')
 expect(auditValue(event,'amount',120,{currency:'MAD'})).toBe('120 MAD')
 expect(auditValue(event,'farm_id','unknown',{})).toBe('Référence non disponible')
 expect(auditValue(event,'name','<script>',{})).toBe('<script>') // React renders text, not HTML.
})
it('retains snapshot relation names over current names and uses module-specific routes',()=>{
 expect(auditValue(event,'farm_id','f1',{_labels:{f1:'Ancien nom'}})).toBe('Ancien nom')
 expect(auditTablesForPath('/agronomie/traitements')).toContain('treatment_requests')
 expect(auditTablesForPath('/login')).toEqual([])
})
