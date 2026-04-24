// Edge Function : admin-create-user
// Seul un admin peut créer un nouvel utilisateur.
// Input : { email, password, full_name?, role_id? }
// Output : { id, email }

// @ts-ignore
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Méthode non autorisée' }, 405)

  try {
    // @ts-ignore
    const url = Deno.env.get('SUPABASE_URL')!
    // @ts-ignore
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Vérifie que l'appelant est admin via son JWT
    const auth = req.headers.get('Authorization') ?? ''
    if (!auth.startsWith('Bearer ')) return jsonResponse({ error: 'Non authentifié' }, 401)
    const token = auth.slice(7)

    const admin = createClient(url, serviceKey)
    const { data: userData, error: ue } = await admin.auth.getUser(token)
    if (ue || !userData?.user) return jsonResponse({ error: 'Session invalide' }, 401)

    // L'appelant doit avoir un rôle is_admin=TRUE
    const { data: prof } = await admin
      .from('profiles')
      .select('id, role_id, roles(is_admin)')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (!(prof as any)?.roles?.is_admin) return jsonResponse({ error: 'Accès refusé — admin requis' }, 403)

    const { email, password, full_name, role_id } = await req.json()
    if (!email || !password) return jsonResponse({ error: 'email et password requis' }, 400)
    if (String(password).length < 8) return jsonResponse({ error: 'Mot de passe trop court (min 8 caractères)' }, 400)

    // Crée l'utilisateur via admin API (auto-confirm email)
    const { data: created, error: ce } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: full_name ? { full_name } : undefined,
    })
    if (ce || !created?.user) {
      return jsonResponse({ error: ce?.message ?? 'Impossible de créer l\'utilisateur' }, 400)
    }

    // Met à jour le profil créé par le trigger
    const patch: any = {}
    if (full_name) patch.full_name = full_name
    if (role_id) patch.role_id = role_id
    if (Object.keys(patch).length > 0) {
      await admin.from('profiles').update(patch).eq('id', created.user.id)
    }

    return jsonResponse({ id: created.user.id, email: created.user.email })
  } catch (e: any) {
    console.error('[admin-create-user] exception:', e?.message)
    return jsonResponse({ error: e?.message ?? 'Erreur serveur' }, 500)
  }
})
