// Authorization, locking, transition and history are one database transaction.
// @ts-ignore -- Deno runtime
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
// @ts-ignore -- Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return respond({ error: 'Méthode non autorisée' }, 405)
  const authorization = req.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return respond({ error: 'Non authentifié' }, 401)
  try {
    // Caller JWT only: never use service_role for this endpoint.
    // @ts-ignore -- Deno runtime
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
    })
    const { data: identity, error: authError } = await client.auth.getUser(authorization.slice(7))
    if (authError || !identity?.user) return respond({ error: 'Session invalide' }, 401)
    const body = await req.json()
    const { data, error } = await client.rpc('apply_authorized_workflow_transition', {
      p_entity_type: body.entityType, p_entity_id: body.entityId,
      p_transition_id: body.transitionId, p_comment: body.comment ?? null,
    })
    if (error) return respond({ error: error.message }, error.code === '42501' ? 403 : 400)
    return respond(data)
  } catch {
    return respond({ error: 'Requête invalide ou service indisponible' }, 400)
  }
})
