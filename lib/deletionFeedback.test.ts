import {it,expect,vi} from 'vitest'
import {deletionBlockedMessage,withDeletionFeedback} from './deletionFeedback'

it('explains the referencing table, without exposing identifiers or SQL',()=>{
 const message=deletionBlockedMessage({code:'23503',message:'update or delete on table "greenhouses" violates foreign key constraint "private_fk" on table "campaign_plantings"',details:'Key (id)=(private-id) is still referenced'})
 expect(message).toContain('des plantations')
 expect(message).not.toMatch(/private|constraint|greenhouses/)
})
it('supports the farm trigger and unknown dependencies, without guessing',()=>{
 expect(deletionBlockedMessage({code:'23503',message:'données liées (serres)'})).toContain('des serres')
 expect(deletionBlockedMessage({code:'23503',message:'unknown'})).toContain('des données liées')
 expect(deletionBlockedMessage({code:'42501',message:'permission denied'})).toBeNull()
})
it.each([['DELETE','/rest/v1/greenhouses'],['POST','/rest/v1/rpc/admin_delete_campaign']])('reports %s %s and preserves its response',async(method,url)=>{
 const response=new Response(JSON.stringify({code:'23503',message:'linked'}),{status:409})
 const notify=vi.fn(),fetcher=vi.fn().mockResolvedValue(response)
 const result=await withDeletionFeedback(fetcher,notify)(`https://example.test${url}`,{method})
 expect(notify).toHaveBeenCalledOnce()
 expect(result).toBe(response)
 expect((await result.json()).code).toBe('23503')
 expect(fetcher).toHaveBeenCalledOnce()
})
it('leaves the farm-specific error panel as the only notification',async()=>{
 const notify=vi.fn(),response=new Response(JSON.stringify({code:'23503'}),{status:409})
 await withDeletionFeedback(vi.fn().mockResolvedValue(response),notify)('https://example.test/rest/v1/rpc/delete_empty_farm',{method:'POST'})
 expect(notify).not.toHaveBeenCalled()
 expect(response.bodyUsed).toBe(false)
})
it('does not mislabel failed writes or successful deletes',async()=>{
 const notify=vi.fn()
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({code:'23503'}),{status:409})).mockResolvedValueOnce(new Response(null,{status:204}))
 const wrapped=withDeletionFeedback(fetcher,notify)
 await wrapped('https://example.test/rest/v1/harvests',{method:'POST'})
 await wrapped('https://example.test/rest/v1/harvests',{method:'DELETE'})
 expect(notify).not.toHaveBeenCalled()
})
