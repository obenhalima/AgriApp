import {it,expect,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import path from 'node:path'
import React from 'react'
const require=createRequire(import.meta.url)
const cookieMocks=vi.hoisted(()=>({cookies:vi.fn(),create:vi.fn()}))
vi.mock('next/headers',()=>({cookies:cookieMocks.cookies}))
vi.mock('@supabase/ssr',()=>({createServerClient:cookieMocks.create}))
import {createSupabaseServerClient} from './supabase-server'

it('pins patched framework, aligned React and lint tooling in both manifests',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'))
 const lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'))
 expect(manifest.dependencies.next).toBe('15.5.24')
 expect(require('next/package.json').version).toBe('15.5.24')
 expect(lock.packages['node_modules/next'].version).toBe('15.5.24')
 expect(manifest.devDependencies['eslint-config-next']).toBe(manifest.dependencies.next)
 expect(manifest.dependencies.react).toBe(manifest.dependencies['react-dom'])
})

it('rejects cache path traversal while permitting an ordinary nested page key',()=>{
 const Cache=require('next/dist/server/lib/incremental-cache/file-system-cache').default
 const cache=new Cache({serverDistDir:path.resolve('synthetic-cache','server'),fs:{},flushToDisk:false})
 expect(cache.getFilePath('allowed/page.html','APP_PAGE')).toContain(path.join('app','allowed','page.html'))
 expect(()=>cache.getFilePath('../../outside.html','APP_PAGE')).toThrow('Invalid file path')
 if(process.platform==='win32')expect(()=>cache.getFilePath('..\\..\\outside.html','APP_PAGE')).toThrow('Invalid file path')
})

it('does not send AVIF input through the vulnerable image optimization decoder',async()=>{
 const {imageOptimizer}=require('next/dist/server/image-optimizer')
 const buffer=Buffer.alloc(32);buffer.write('ftypavif',4)
 const result=await imageOptimizer({buffer,etag:'synthetic',cacheControl:'max-age=60',contentType:'image/avif'},
  {href:'/synthetic.avif',width:64,quality:75,mimeType:'image/webp'},
  {images:{minimumCacheTTL:60,dangerouslyAllowSVG:false},experimental:{}},{silent:true})
 expect(result.buffer).toBe(buffer)
 expect(result.contentType).toBe('image/avif')
})

it('uses async request cookies without losing server-side authentication',async()=>{
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://example.supabase.co')
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','synthetic-public-key')
 try{
  cookieMocks.cookies.mockResolvedValue({get:(name:string)=>name==='session'?{value:'synthetic-session'}:undefined})
  cookieMocks.create.mockImplementation((_url,_key,options)=>({session:options.cookies.get('session')}))
  expect(await createSupabaseServerClient()).toEqual({session:'synthetic-session'})
 }finally{vi.unstubAllEnvs()}
})

it('recognizes React 19 elements through the exact react-is used by charts',()=>{
 const chartRequire=createRequire(require.resolve('recharts/package.json'))
 expect(chartRequire('react-is').isElement(React.createElement('span'))).toBe(true)
})

it('awaits server APIs while leaving client router hooks unchanged',()=>{
 const layout=readFileSync(new URL('../app/layout.tsx',import.meta.url),'utf8')
 expect(layout).toContain('async function RootLayout')
 expect(layout).toContain('(await cookies()).get')
 const icon=readFileSync(new URL('../app/pwa/[icon]/route.tsx',import.meta.url),'utf8')
 expect(icon).toContain('Promise<{ icon: string }>')
 expect(icon).toContain('await params')
 const core=readFileSync(new URL('./core-data.ts',import.meta.url),'utf8')
 expect(core.match(/await createSupabaseServerClient\(\)/g)).toHaveLength(3)
})
