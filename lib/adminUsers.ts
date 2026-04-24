import { supabase } from './supabase'

export type UserProfile = {
  id: string
  email: string
  full_name: string | null
  role_id: string | null
  phone: string | null
  is_active: boolean
  last_login_at: string | null
  created_at: string
  // Joined
  role_name?: string | null
  role_code?: string | null
  is_admin?: boolean
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

  const res = await fetch(`${url}/functions/v1/admin-create-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${bearer}`,
    },
    body: JSON.stringify(input),
  })

  const raw = await res.text()
  let parsed: any
  try { parsed = JSON.parse(raw) } catch { parsed = { error: raw } }
  if (!res.ok) throw new Error(parsed.error ?? `Erreur ${res.status}`)
  if (parsed.error) throw new Error(parsed.error)
  return parsed
}
