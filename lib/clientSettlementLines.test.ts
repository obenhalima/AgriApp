import {beforeEach,expect,it,vi} from 'vitest'
const mock=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}))
vi.mock('./supabase',()=>({supabase:mock}))
import {saveSettlementLines} from './stationSettlements'
const domain='11111111-1111-4111-8111-111111111111'
beforeEach(()=>{
 vi.stubEnv('NEXT_PUBLIC_CLIENT_REFERENCE_ISOLATION','true')
 mock.rpc.mockReset();mock.from.mockReset()
 mock.rpc.mockImplementation(async(name)=>name==='client_reference_isolation_ready'?{data:true,error:null}:{data:null,error:null})
})
it('sends the verified client and all rows to one atomic replacement, never deletes directly',async()=>{
 const lines=[{farm_id:null,market_id:'m',variety_id:'v',qty_kg:10,price_per_kg:2}]
 await saveSettlementLines('s',lines,domain)
 expect(mock.rpc).toHaveBeenLastCalledWith('replace_client_settlement_lines',{p_domain:domain,p_settlement:'s',p_lines:lines})
 expect(mock.from).not.toHaveBeenCalled()
})
it('fails before mutation with missing client or failed server readiness',async()=>{
 await expect(saveSettlementLines('s',[],'')).rejects.toThrow('client valide')
 mock.rpc.mockResolvedValue({data:false,error:null})
 await expect(saveSettlementLines('s',[],domain)).rejects.toThrow('serveur')
 expect(mock.rpc.mock.calls.every(([name])=>name==='client_reference_isolation_ready')).toBe(true)
 expect(mock.from).not.toHaveBeenCalled()
})
it('reports an atomic replacement failure without a follow-up insert/delete',async()=>{
 mock.rpc.mockImplementation(async(name)=>name==='client_reference_isolation_ready'?{data:true,error:null}:{data:null,error:new Error('Cross-client reference')})
 await expect(saveSettlementLines('s',[],domain)).rejects.toThrow('Cross-client')
 expect(mock.rpc).toHaveBeenCalledTimes(2)
 expect(mock.from).not.toHaveBeenCalled()
})
