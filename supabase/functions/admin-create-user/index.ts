// Edge Function : admin-create-user
// Seul un admin peut créer un nouvel utilisateur.
// Input : { email, password, full_name?, role_id?, memberships[] }
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

    // Un super-admin gère toutes les sociétés. Un admin de société ne gère
    // que les sociétés dans lesquelles son appartenance porte un rôle admin.
    const { data: prof } = await admin
      .from('profiles')
      .select('id, role_id, is_platform_admin, roles(is_admin)')
      .eq('id', userData.user.id)
      .maybeSingle()

    const { email, password, full_name, role_id, memberships = [] } = await req.json()
    if (!email || !password) return jsonResponse({ error: 'email et password requis' }, 400)
    if (String(password).length < 8) return jsonResponse({ error: 'Mot de passe trop court (min 8 caractères)' }, 400)
    if (!Array.isArray(memberships) || memberships.length === 0) return jsonResponse({ error: 'Au moins une société est obligatoire' }, 400)

    const isPlatformAdmin = Boolean((prof as any)?.is_platform_admin)
    const { data: managedRows } = await admin.from('domain_memberships')
      .select('domain_id,roles!inner(is_admin)')
      .eq('user_id',userData.user.id).eq('is_active',true).eq('roles.is_admin',true)
    const managedIds = new Set((managedRows ?? []).map((row:any)=>row.domain_id))
    if (!isPlatformAdmin && managedIds.size === 0) return jsonResponse({ error: 'Accès refusé — administrateur de société requis' }, 403)
    for (const membership of memberships) {
      if (!membership?.domain_id || !membership?.role_id) return jsonResponse({ error: 'Société et rôle obligatoires' }, 400)
      if (!isPlatformAdmin && !managedIds.has(membership.domain_id)) return jsonResponse({ error: 'Affectation interdite à une société non administrée' }, 403)
    }

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
    if (role_id && isPlatformAdmin) patch.role_id = role_id
    if (!isPlatformAdmin) patch.role_id = memberships[0].role_id
    if (Object.keys(patch).length > 0) {
      const { error: pe } = await admin.from('profiles').update(patch).eq('id', created.user.id)
      if (pe) { await admin.auth.admin.deleteUser(created.user.id); return jsonResponse({ error: pe.message }, 400) }
    }

    const { error: me } = await admin.from('domain_memberships').insert(memberships.map((m:any,index:number)=>({
      domain_id:m.domain_id,user_id:created.user.id,role_id:m.role_id,is_active:true,
      is_default:Boolean(m.is_default)||(!memberships.some((x:any)=>x.is_default)&&index===0),activated_at:new Date().toISOString(),
    })))
    if (me) { await admin.auth.admin.deleteUser(created.user.id); return jsonResponse({ error: me.message }, 400) }

    return jsonResponse({ id: created.user.id, email: created.user.email })
  } catch (e: any) {
    console.error('[admin-create-user] exception:', e?.message)
    return jsonResponse({ error: e?.message ?? 'Erreur serveur' }, 500)
  }
})
