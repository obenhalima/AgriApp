import {describe,it,expect} from 'vitest'
import {auditArgs,auditCsv,auditDate,auditError,auditRange,type AuditEvent} from './auditReport'
const d='11111111-1111-4111-8111-111111111111'
const filter={from:'2026-10-01',to:'2026-10-15',category:'',action:'',actor:'',table:''}
describe('audit report boundaries',()=>{
 it('uses exclusive UTC upper bound and rejects invalid dates or excessive windows',()=>{
  expect(auditRange(filter.from,filter.to)).toEqual({from:'2026-10-01T00:00:00.000Z',to:'2026-10-16T00:00:00.000Z'})
  for(const [a,b] of [['2026-02-30','2026-03-02'],['2026-10-15','2026-10-01'],['2026-01-01','2026-12-31'],['bad','2026-10-01']])expect(()=>auditRange(a,b)).toThrow()
 })
 it('requires explicit client and keys pagination by time AND id',()=>{
  expect(()=>auditArgs('',filter)).toThrow();expect(()=>auditArgs(d,{...filter,actor:'fake'})).toThrow()
  expect(auditArgs(d,filter,{event_id:'tx:2',occurred_at:'2026-10-01T12:00:00Z'} as AuditEvent)).toMatchObject({p_domain:d,p_limit:100,p_before:'2026-10-01T12:00:00Z',p_before_id:'tx:2'})
 })
 it('escapes CSV formula injection, quotes and embedded newlines',()=>{
  const event={actor_label:' =HYPERLINK("bad")',changed_fields:[],before_values:null,after_values:{name:'<script>'}} as unknown as AuditEvent
  const csv=auditCsv([event],'@SUM(1)')
  expect(csv).toContain('"\'@SUM(1)"');expect(csv).toContain('"\' =HYPERLINK(""bad"")"')
 })
 it('formats Casablanca time and distinguishes missing migration from forbidden',()=>{
  expect(auditDate('2026-10-15T12:00:00Z')).toContain('13:00:00')
  expect(auditError({code:'PGRST202'})).toContain('non activée')
  expect(auditError({code:'42501'})).toContain('administrateurs')
  expect(auditError({message:'SECRET'})).not.toContain('SECRET')
 })
})
