import { supabase } from './supabase'
import type { Role, PermissionAction } from './auth'

export type Module = {
  id: string
  code: string
  label: string
  parent_id: string | null
  icon: string | null
  color: string | null
  path: string | null
  section: string | null
  display_order: number
  is_active: boolean
}

export type Permission = {
  id: string
  module_id: string
  action: PermissionAction
  code: string
}

export async function listRoles(): Promise<Role[]> {
  const { data, error } = await supabase.from('roles').select('*').order('is_admin', { ascending: false }).order('name')
  if (error) throw error
  return (data ?? []) as Role[]
}

export async function createRole(input: { code: string; name: string; description?: string }): Promise<Role> {
  const { data, error } = await supabase.from('roles').insert({
    code: input.code.toLowerCase().replace(/\s+/g, '_'),
    name: input.name,
    description: input.description ?? null,
    is_system: false,
    is_admin: false,
    is_active: true,
  }).select().single()
  if (error) throw error
  return data as Role
}

export async function updateRole(id: string, patch: Partial<{ name: string; description: string | null; is_active: boolean }>): Promise<Role> {
  const { data, error } = await supabase.from('roles').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return data as Role
}

export async function deleteRole(id: string): Promise<void> {
  const { data: role } = await supabase.from('roles').select('is_system').eq('id', id).maybeSingle()
  if ((role as any)?.is_system) throw new Error('Impossible de supprimer un rôle système')
  const { error } = await supabase.from('roles').delete().eq('id', id)
  if (error) throw error
}

export async function listModulesAndPermissions(): Promise<{ modules: Module[]; permissions: Permission[] }> {
  const [m, p] = await Promise.all([
    supabase.from('modules').select('*').eq('is_active', true).order('section').order('display_order'),
    supabase.from('permissions').select('*'),
  ])
  if (m.error) throw m.error
  if (p.error) throw p.error
  return { modules: (m.data ?? []) as Module[], permissions: (p.data ?? []) as Permission[] }
}

export async function listRolePermissions(roleId: string): Promise<Set<string>> {
  // Renvoie les codes de permissions accordées (ex: "couts.view")
  const { data, error } = await supabase
    .from('role_permissions')
    .select('granted, permissions(code)')
    .eq('role_id', roleId)
    .eq('granted', true)
  if (error) throw error
  return new Set((data ?? []).map((r: any) => r.permissions?.code).filter(Boolean))
}

/** Sauvegarde en masse : remplace toutes les permissions d'un rôle par l'ensemble fourni. */
export async function saveRolePermissions(roleId: string, grantedCodes: Set<string>): Promise<void> {
  // Récupère les IDs des permissions demandées
  const allCodes = Array.from(grantedCodes)
  let idsToGrant: string[] = []
  if (allCodes.length > 0) {
    const { data } = await supabase.from('permissions').select('id, code').in('code', allCodes)
    idsToGrant = (data ?? []).map((r: any) => r.id)
  }

  // Supprime toutes les permissions actuelles
  await supabase.from('role_permissions').delete().eq('role_id', roleId)

  // Insère les nouvelles
  if (idsToGrant.length > 0) {
    const rows = idsToGrant.map(pid => ({ role_id: roleId, permission_id: pid, granted: true }))
    const { error } = await supabase.from('role_permissions').insert(rows)
    if (error) throw error
  }
}
