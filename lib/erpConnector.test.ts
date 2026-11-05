import { expect, it } from 'vitest'
import { defaultErpConfig, queueFixture, deliverFixture, simulatedAdapter, type FixtureInvoice } from './erpConnector'
import { docIndexRequest } from './erpTransport.server'
const config = () => ({ ...defaultErpConfig('tenant-A','recipient-A'), enabled: true })
const invoice: FixtureInvoice = { id:'fixture-1',domainId:'tenant-A',recipientId:'recipient-A',number:'DEMO-001',fictitious:true,origin:'manual' }
const pdf = new TextEncoder().encode('%PDF-1.4\nfixture')
it('is off by default and requires explicit manual validation', () => {
 expect(queueFixture(defaultErpConfig('tenant-A','recipient-A'),invoice,'actor',true,[])).toBeNull()
 expect(queueFixture(config(),invoice,'actor',false,[])).toBeNull()
 expect(queueFixture(config(),{...invoice,origin:'validated_settlement'},'actor',false,[])).not.toBeNull()
 expect(queueFixture(config(),{...invoice,origin:'history'},'actor',true,[])).toBeNull()
})
it('isolates tenants and recipients and rejects real data', () => {
 expect(()=>queueFixture(config(),{...invoice,domainId:'tenant-B'},'actor',true,[])).toThrow()
 expect(()=>queueFixture(config(),{...invoice,recipientId:'recipient-B'},'actor',true,[])).toThrow()
 expect(()=>queueFixture(config(),{...invoice,fictitious:false} as never,'actor',true,[])).toThrow()
})
it('is idempotent and preserves validation provenance on manual resend', async () => {
 const job=queueFixture(config(),invoice,'validator',true,[])!
 expect(queueFixture(config(),invoice,'other',true,[job])).toBe(job)
 const sent=await deliverFixture(config(),job,'worker',pdf,simulatedAdapter())
 const resent=await deliverFixture(config(),sent,'operator',pdf,simulatedAdapter(),true)
 expect(resent.key).toBe(job.key);expect(resent.remoteId).toBe(sent.remoteId)
 expect(resent.validatedBy).toBe('validator');expect(resent.attempts).toBe(2)
 expect(resent.events.some(e=>e.actor==='operator')).toBe(true)
 expect(await deliverFixture(config(),resent,'worker',pdf,simulatedAdapter())).toBe(resent)
})
it('bounds automatic retries and blocks changed destinations', async () => {
 const job=queueFixture(config(),invoice,'validator',true,[])!
 const failed=await deliverFixture(config(),job,'worker',pdf,simulatedAdapter(true))
 expect(failed.state).toBe('failed');expect(failed.nextAttemptAt).toBeTruthy()
 expect(await deliverFixture(config(),failed,'worker',pdf,simulatedAdapter())).toBe(failed)
 expect(await deliverFixture(config(),{...failed,attempts:3},'worker',pdf,simulatedAdapter(),false,'2099-01-01T00:00:00Z')).toMatchObject({attempts:3})
 await expect(deliverFixture({...config(),credentialRef:'NEW_KEY'},job,'worker',pdf,simulatedAdapter(),true)).rejects.toThrow('configuration a changé')
})
it('prepares the raw PDF contract server-side without any network call', () => {
 const req=docIndexRequest({key:'tenant:recipient:invoice',filename:'démo.pdf',pdf},'fixture-secret')
 expect(req.body).toBe(pdf);expect(req.headers['Idempotency-Key']).toBe('tenant:recipient:invoice')
 expect(req.headers['X-Filename']).toBe('d%C3%A9mo.pdf');expect(req.redirect).toBe('error')
 expect(()=>docIndexRequest({key:'x',filename:'x.pdf',pdf:new Uint8Array(4_000_001)},'fixture')).toThrow()
})
it('allows a different ERP adapter without coupling its statuses to DocIndex', async () => {
 const c={...config(),adapter:'erp' as const,endpoint:'https://erp.example.test/invoices'}
 const job=queueFixture(c,invoice,'validator',true,[])!
 const result=await deliverFixture(c,job,'worker',pdf,{send:async request=>{
  expect(request.recipientId).toBe(invoice.recipientId)
  return {id:'erp-id',status:'posted',duplicate:false}
 }})
 expect(result.remoteStatus).toBe('posted')
})
