// One-time bootstrap: credentials remain in memory and a short-lived, ignored temp file.
// Never rotate VAPID keys on an installed service: existing phones depend on them.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import dotenv from 'dotenv'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

if (!process.argv.includes('--bootstrap')) throw Error('Explicit --bootstrap required')
const env = dotenv.parse(fs.readFileSync('.env.local'))
const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/mobile-dispatch`
const existing = await fetch(url, { signal: AbortSignal.timeout(15000) })
if (existing.ok && (await existing.json()).publicKey) throw Error('Already configured; keys left unchanged')
const keys = webpush.generateVAPIDKeys(), secret = randomBytes(48).toString('hex')
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'farmpilot-mobile-'))
const temporary = path.join(directory, 'dispatch.env')
try {
 fs.writeFileSync(temporary, `VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nMOBILE_DISPATCH_SECRET=${secret}\nAPP_PUBLIC_URL=https://agri-app-orpin.vercel.app\n`, { mode: 0o600 })
 const result = spawnSync(process.platform === 'win32' ? 'supabase.exe' : 'supabase', ['secrets', 'set', '--env-file', temporary], { encoding: 'utf8' })
 if (result.status !== 0) throw Error('Setting Edge secrets failed (output suppressed)')
} finally {
 fs.unlinkSync(temporary)
 fs.rmdirSync(directory)
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const configured = await db.rpc('mobile_configure_dispatch', { p_url: url, p_secret: secret })
if (configured.error) throw Error('Vault configuration failed; do not rotate keys. Reconcile Edge/Vault before enabling delivery.')
console.log('Edge secrets and Vault configured; no credentials printed.')
const check = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(55000) })
console.log('Dispatcher HTTP:', check.status)
if (check.ok) console.log(await check.json())
else throw Error('Dispatcher unavailable; inspect safe server diagnostics')
