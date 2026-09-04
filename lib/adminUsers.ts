import { supabase } from './supabase'

export type UserProfile = {
  id: string
  email: string
  full_name: string | null
  role_id: string | null
  phone: string | null
  is_active: boolean
  is_platform_admin: boolean
  last_login_at: string | null
  created_at: string
  // Joined
  role_name?: string | null
  role_code?: string | null
  is_admin?: boolean
}

export type UserDomainMembership = {
  domain_id: string
  role_id: string
  is_active: boolean
  is_default: boolean
}

export async function listUserDomainMemberships(userIds?: string[]): Promise<Record<string, UserDomainMembership[]>> {
  let query = supabase.from('domain_memberships').select('user_id, domain_id, role_id, is_active, is_default')
  if (userIds?.length) query = query.in('user_id', userIds)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).reduce((result: Record<string, UserDomainMembership[]>, row: any) => {
    ;(result[row.user_id] ??= []).push({
      domain_id: row.domain_id, role_id: row.role_id,
      is_active: row.is_active, is_default: row.is_default,
    })
    return result
  }, {})
}

export async function replaceUserDomainMemberships(userId: string, memberships: UserDomainMembership[]): Promise<void> {
  const { error } = await supabase.rpc('set_user_domain_memberships', {
    p_user_id: userId,
    p_memberships: memberships,
  })
  if (error) throw error
}

export async function listUserProfiles(): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, roles(code, name, is_admin)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    ...r,
    role_name: r.roles?.name ?? null,
    role_code: r.roles?.code ?? null,
    is_admin:  Boolean(r.roles?.is_admin),
  }))
}

export async function updateProfileRole(userId: string, roleId: string | null): Promise<void> {
  const { error } = await supabase.from('profiles').update({ role_id: roleId, updated_at: new Date().toISOString() }).eq('id', userId)
  if (error) throw error
}

export async function updateProfileActive(userId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ is_active: isActive, updated_at: new Date().toISOString() }).eq('id', userId)
  if (error) throw error
}

export async function updateProfileInfo(userId: string, patch: { full_name?: string; phone?: string }): Promise<void> {
  const { error } = await supabase.from('profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', userId)
  if (error) throw error
}

export async function updateProfilePlatformAdmin(userId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ is_platform_admin: enabled, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw error
}

export async function updateUserProfile(userId: string, patch: {
  full_name: string
  phone: string
  role_id: string | null
  is_active: boolean
  is_platform_admin?: boolean
}): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw error
}

/**
 * Crée un nouvel utilisateur via l'Edge Function (nécessite service_role côté serveur).
 */
export async function createUser(input: {
  email: string
  password: string
  full_name?: string
  role_id?: string
}): Promise<{ id: string; email: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // Récupère le JWT de session pour que l'Edge Function vérifie que l'appelant est admin
  const { data: { session } } = await supabase.auth.getSession()
  const bearer = session?.access_token ?? key

  let res: Response
  try {
    res = await fetch(`${url}/functions/v1/admin-create-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${bearer}`,
      },
      body: JSON.stringify(input),
    })
  } catch (networkErr: any) {
    // Échec réseau pur : fonction non déployée, CORS, ou pas de connexion
    console.error('[createUser] network error:', networkErr)
    throw new Error(
      "Impossible de joindre la fonction admin-create-user. " +
      "Vérifie qu'elle est déployée sur Supabase (Dashboard → Edge Functions → admin-create-user). " +
      `Détail : ${networkErr?.message ?? networkErr}`
    )
  }

  const raw = await res.text()
  let parsed: any
  try { parsed = JSON.parse(raw) } catch { parsed = { error: raw } }

  if (res.status === 404) {
    throw new Error(
      "Fonction admin-create-user introuvable (404). Elle n'est pas déployée. " +
      "Déploie-la via : supabase functions deploy admin-create-user"
    )
  }
  if (!res.ok) {
    const detail = parsed.error ?? `Erreur ${res.status}`
    console.error('[createUser] HTTP error', res.status, parsed)
    throw new Error(detail)
  }
  if (parsed.error) throw new Error(parsed.error)
  return parsed
}
