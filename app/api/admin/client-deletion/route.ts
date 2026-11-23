import {NextResponse} from 'next/server'
import {createClient} from '@supabase/supabase-js'
import {inspectClientLocalData, clearClientLocalData} from '@/lib/clientDeletionLocal.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const json = (body: unknown, status = 200) => NextResponse.json(body, {status, headers: {'Cache-Control': 'no-store'}})
const migrationMessage = 'Appliquez la migration client_complete_deletion pour activer la suppression complète.'
function check(error: {code?: string; message: string} | null) {
  if (!error) return
  throw Error(['PGRST202', '42883', '42P01'].includes(error.code || '') ? migrationMessage : error.message)
}
async function access(req: Request) {
  const authorization = req.headers.get('authorization') || ''
  if (!/^Bearer [^\s]+$/.test(authorization)) throw Error('Connexion requise')
  if (req.method === 'POST' && req.headers.get('origin') !== new URL(req.url).origin) throw Error('Accès refusé')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: {headers: {Authorization: authorization}}, auth: {persistSession: false, autoRefreshToken: false},
  })
  const identity = await db.auth.getUser(authorization.slice(7))
  if (identity.error || !identity.data.user) throw Error('Connexion requise')
  const profile = await db.from('profiles').select('is_active,is_platform_admin').eq('id', identity.data.user.id).maybeSingle()
  if (profile.error || !profile.data?.is_active || !profile.data.is_platform_admin) throw Error('Accès réservé au super-administrateur plateforme')
  return db
}
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : 'Suppression impossible'
  return json({error: message}, message === 'Connexion requise' ? 401 : message.startsWith('Accès') ? 403 : 400)
}
export async function GET(req: Request) {
  try {
    const db = await access(req), domain = new URL(req.url).searchParams.get('domain') || ''
    if (new URL(req.url).searchParams.get('action') === 'pending') {
      const result = await db.rpc('pending_client_deletions')
      check(result.error)
      return json(result.data)
    }
    if (!uuid.test(domain)) throw Error('Client invalide')
    const result = await db.rpc('preview_client_deletion', {p_domain: domain})
    check(result.error)
    return json({...result.data, local: await inspectClientLocalData(domain)})
  } catch (error) {return failure(error)}
}
export async function POST(req: Request) {
  try {
    const db = await access(req)
    const raw = await req.text()
    if (raw.length > 3000) throw Error('Confirmation invalide')
    const input = JSON.parse(raw)
    if (!uuid.test(input.domain || '') || !uuid.test(input.request || '') || typeof input.code !== 'string'
      || !/^[a-f0-9]{32}$/.test(input.fingerprint || '')) throw Error('Confirmation invalide')
    const previous = await db.rpc('client_deletion_cleanup', {p_request: input.request, p_done: false})
    if (previous.error && previous.error.message !== 'Suppression introuvable') check(previous.error)
    if (!previous.data) {
      if (!/^[a-f0-9]{64}$/.test(input.localFingerprint || '')) throw Error('Confirmation invalide')
      const local = await inspectClientLocalData(input.domain)
      if (local.fingerprint !== input.localFingerprint) throw Error('Les documents locaux ont changé. Rechargez l’aperçu.')
    }
    const removed = await db.rpc('delete_client_completely', {p_domain: input.domain, p_code: input.code, p_fingerprint: input.fingerprint, p_request: input.request})
    check(removed.error)
    const pending = await db.rpc('client_deletion_cleanup', {p_request: input.request, p_done: false})
    check(pending.error)
    if (pending.data.status === 'complete') return json(removed.data)
    try {
      const files = pending.data.files as {bucket: string; path: string}[]
      for (const bucket of [...new Set(files.map(file => file.bucket))]) {
        const paths = files.filter(file => file.bucket === bucket).map(file => file.path)
        for (let offset = 0; offset < paths.length; offset += 100) {
          const result = await db.storage.from(bucket).remove(paths.slice(offset, offset + 100))
          if (result.error) throw result.error
        }
      }
      await clearClientLocalData(input.domain)
      const complete = await db.rpc('client_deletion_cleanup', {p_request: input.request, p_done: true})
      check(complete.error)
      if (complete.data.status !== 'complete') throw Error('Nettoyage à poursuivre')
      return json({...removed.data, status: 'complete'})
    } catch {
      return json({...removed.data, status: 'files_pending', message: 'Données supprimées en base. Le nettoyage des fichiers reste à terminer. Réessayez pour reprendre le nettoyage.'})
    }
  } catch (error) {return failure(error)}
}
