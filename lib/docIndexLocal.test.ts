import {afterEach,expect,it,vi} from 'vitest'
import {mkdirSync,writeFileSync} from 'node:fs'
import {docIndexFixturePdf,fixtureReference,protectLocal,sendDocIndexFixture,publicConnection,docIndexFailureMessage,newDocIndexFixture,type LocalConnection} from './docIndexLocal.server'
const connection=():LocalConnection=>({domain:'tenant-fixture',recipient:'recipient-fixture',space:'Fictitious space',enabled:true,apiKey:'dik_fixture_only_123456',generation:'generation-1',events:[]})
afterEach(()=>vi.restoreAllMocks())
it('builds a fixed fictional PDF and a stable resend reference',()=>{
 const c=connection(),key=fixtureReference(c),pdf=docIndexFixturePdf(key),text=new TextDecoder().decode(pdf)
 expect(text.startsWith('%PDF-1.4')).toBe(true);expect(text).toContain('FACTURE FICTIVE')
 if(process.env.WRITE_DOCINDEX_PDF_FIXTURE==='1'){mkdirSync('tmp/pdfs',{recursive:true});writeFileSync('tmp/pdfs/docindex-fictional-test.pdf',pdf)}
 expect(text).not.toContain(c.apiKey);expect(text).not.toContain(c.space)
 expect(fixtureReference({...c})).toBe(key)
 expect(fixtureReference({...c,recipient:'other'})).not.toBe(key)
 expect(fixtureReference({...c,generation:'rotated'})).not.toBe(key)
 expect(()=>docIndexFixturePdf('arbitrary invoice input')).toThrow()
})
it('never returns the secret in public configuration or logs',()=>{
 const view=JSON.stringify(publicConnection(connection()))
 expect(view).not.toContain('dik_');expect(view).not.toContain('apiKey');expect(view).toContain('hasKey')
})
it('sends the fixed PDF to the pinned DocIndex URL with stable idempotency (mock transport)',async()=>{
 const transport=vi.fn(async()=>new Response(JSON.stringify({id:'fixture-receipt',status:'to_review'}),{status:201}))
 const c=connection();await expect(sendDocIndexFixture(c,transport as typeof fetch)).resolves.toEqual({id:'fixture-receipt',status:'to_review'})
 const [url,init]=transport.mock.calls[0] as unknown as [string,RequestInit]
 expect(url).toBe('https://docindex-phi.vercel.app/api/v1/documents')
 expect(init.redirect).toBe('error');expect((init.headers as Record<string,string>)['Idempotency-Key']).toBe(fixtureReference(c))
 expect(new TextDecoder().decode(init.body as Uint8Array)).toContain('FACTURE FICTIVE')
})
it('does not return remote errors that could contain credentials',async()=>{
 const transport=vi.fn(async()=>new Response('secret reflected by remote', {status:401}))
 await expect(sendDocIndexFixture(connection(),transport as typeof fetch)).rejects.toThrow('DOCINDEX_HTTP_401')
})
it.each([undefined,'queued'])('accepts a receipt without requiring a processing status (%s)',async status=>{
 const transport=vi.fn(async()=>new Response(JSON.stringify({id:'fixture-id',status}),{status:201}))
 await expect(sendDocIndexFixture(connection(),transport as typeof fetch)).resolves.toEqual({id:'fixture-id',status:'received'})
 expect(transport).toHaveBeenCalledTimes(1)
})
it('distinguishes unreadable positive receipts and never exposes arbitrary remote errors',async()=>{
 const transport=vi.fn(async()=>new Response('{}',{status:200}))
 await expect(sendDocIndexFixture(connection(),transport as typeof fetch)).rejects.toThrow('RECEIPT_UNREADABLE')
 expect(docIndexFailureMessage(new Error('RECEIPT_UNREADABLE'))).toContain('répondu positivement')
 expect(docIndexFailureMessage(new Error('secret reflected'))).not.toContain('secret reflected')
})
it('reads stage rather than requiring the legacy status field',async()=>{
 const transport=vi.fn(async()=>new Response(JSON.stringify({id:'fixture-id',stage:'reading'}),{status:200}))
 await expect(sendDocIndexFixture(connection(),transport as typeof fetch)).resolves.toEqual({id:'fixture-id',status:'reading'})
 expect(docIndexFailureMessage(new Error('DOCINDEX_HTTP_409'))).toContain('autre fichier')
})
it('creates distinct numbered PDFs and preserves exactly the same bytes and key on resend',async()=>{
 const first=newDocIndexFixture(connection(),'fixture-actor'),second=newDocIndexFixture(first,'fixture-actor')
 expect(first.fixtureNumber).not.toBe(second.fixtureNumber)
 expect(fixtureReference(first)).not.toBe(fixtureReference(second))
 expect(first.fixturePdf).not.toBe(second.fixturePdf)
 expect(new TextDecoder().decode(Buffer.from(first.fixturePdf!,'base64'))).toContain(first.fixtureNumber)
 const transport=vi.fn(async()=>new Response(JSON.stringify({id:'fixture-receipt'}),{status:200}))
 await sendDocIndexFixture(first,transport as typeof fetch);await sendDocIndexFixture(first,transport as typeof fetch)
 const calls=transport.mock.calls as unknown as [string,RequestInit][]
 expect(calls[0][1].headers).toEqual(calls[1][1].headers)
 expect(Buffer.compare(calls[0][1].body as Buffer,calls[1][1].body as Buffer)).toBe(0)
 expect(second.remoteId).toBeUndefined()
})
it('encrypts and decrypts a fixture secret with Windows DPAPI, never plaintext on disk',async()=>{
 if(process.platform!=='win32')return
 const plain='fixture-secret-not-a-real-api-key — espace é العربية'
 const encrypted=await protectLocal(plain)
 expect(encrypted).not.toContain(plain)
 expect(await protectLocal(encrypted,true)).toBe(plain)
},20000)
