import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assertClientReferenceIsolation } from './clientReferenceReadiness'
const domain='11111111-1111-4111-8111-111111111111'
beforeEach(()=>vi.stubEnv('NEXT_PUBLIC_CLIENT_REFERENCE_ISOLATION','true'))
describe('server cutover acknowledgement',()=>{
  it('fails closed before cutover and with an invalid client',async()=>{
    const rpc=vi.fn().mockResolvedValue({data:true,error:null})
    await expect(assertClientReferenceIsolation('',{rpc})).rejects.toThrow('client valide')
    vi.stubEnv('NEXT_PUBLIC_CLIENT_REFERENCE_ISOLATION','false')
    await expect(assertClientReferenceIsolation(domain,{rpc})).rejects.toThrow('lecture seule')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('requires a strict true response from the server, not the flag alone',async()=>{
    for(const response of [{data:false,error:null},{data:null,error:{code:'PGRST202'}},{data:'true',error:null},{data:true,error:{message:'failed'}}]){
      await expect(assertClientReferenceIsolation(domain,{rpc:vi.fn().mockResolvedValue(response)})).rejects.toThrow('serveur')
    }
    const rpc=vi.fn().mockResolvedValue({data:true,error:null})
    await expect(assertClientReferenceIsolation(domain,{rpc})).resolves.toBe(domain)
    expect(rpc).toHaveBeenCalledWith('client_reference_isolation_ready',{p_domain:domain})
  })
})
