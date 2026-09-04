'use client'
import { createContext, useContext, useEffect, useState, useCallback, ReactNode, createElement } from 'react'
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

// ============================================================
// Types
// ============================================================
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'admin'

export type Role = {
  id: string
  code: string
  name: string
  description: string | null
  is_system: boolean
  is_admin: boolean
  is_active: boolean
}

export type Profile = {
  id: string
  email: string
  full_name: string | null
  role_id: string | null
  phone: string | null
  is_active: boolean
  invited_at: string | null
  activated_at: string | null
  last_login_at: string | null
  is_platform_admin: boolean
}

export type Permission = {
  code: string               // ex: "couts.view"
  module_code: string
  action: PermissionAction
}

export type DomainAccess = {
  domain_id: string
  domain_code: string
  domain_name: string
  role_id: string
  role_name: string
  is_default: boolean
}

export type AuthState = {
  user: User | null
  profile: Profile | null
  role: Role | null
  permissions: Set<string>    // ensemble des codes de permission (module_code.action)
  isAdmin: boolean
  isPlatformAdmin: boolean
  domains: DomainAccess[]
  activeDomain: DomainAccess | null
  loading: boolean
}

export type AuthContextValue = AuthState & {
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  hasPermission: (moduleCode: string, action?: PermissionAction) => boolean
  canAccessModule: (moduleCode: string) => boolean
  switchDomain: (domainId: string) => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// ============================================================
// Charge profil + rôle + permissions pour un user_id
// ============================================================
async function loadAuthData(userId: string, preferredDomainId?: string | null): Promise<{
  profile: Profile | null
  role: Role | null
  permissions: Set<string>
  isAdmin: boolean
  isPlatformAdmin: boolean
  domains: DomainAccess[]
  activeDomain: DomainAccess | null
}> {
  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', userId).maybeSingle()

  if (!profile) {
    return { profile: null, role: null, permissions: new Set(), isAdmin: false, isPlatformAdmin: false, domains: [], activeDomain: null }
  }

  const isPlatformAdmin = Boolean(profile.is_platform_admin)
  const { data: membershipRows } = await supabase
    .from('domain_memberships')
    .select('domain_id, role_id, is_default, domains(code, name), roles(name)')
    .eq('user_id', userId)
    .eq('is_active', true)

  let domains: DomainAccess[] = (membershipRows ?? []).map((row: any) => ({
    domain_id: row.domain_id,
    domain_code: row.domains?.code ?? '',
    domain_name: row.domains?.name ?? '',
    role_id: row.role_id,
    role_name: row.roles?.name ?? '',
    is_default: row.is_default,
  }))

  // Le super administrateur voit également les domaines sans affectation explicite.
  if (isPlatformAdmin) {
    const { data: allDomains } = await supabase.from('domains').select('id, code, name').eq('is_active', true).order('name')
    const fallbackRoleId = profile.role_id ?? domains[0]?.role_id ?? ''
    for (const domain of allDomains ?? []) {
      if (!domains.some(item => item.domain_id === domain.id)) {
        domains.push({ domain_id: domain.id, domain_code: domain.code, domain_name: domain.name, role_id: fallbackRoleId, role_name: 'Super administrateur', is_default: false })
      }
    }
  }

  const activeDomain = domains.find(item => item.domain_id === preferredDomainId)
    ?? domains.find(item => item.is_default)
    ?? domains[0]
    ?? null

  let role: Role | null = null
  let permissionCodes: string[] = []
  let isAdmin = false

  const effectiveRoleId = isPlatformAdmin ? profile.role_id : activeDomain?.role_id
  if (effectiveRoleId) {
    const { data: roleData } = await supabase
      .from('roles').select('*').eq('id', effectiveRoleId).maybeSingle()
    role = roleData as Role | null
    isAdmin = Boolean(role?.is_admin)

    // Si pas admin, on charge les permissions du rôle
    if (!isAdmin) {
      const { data: perms } = await supabase
        .from('role_permissions')
        .select('granted, permissions(code)')
        .eq('role_id', effectiveRoleId)
        .eq('granted', true)
      permissionCodes = (perms ?? [])
        .map((r: any) => r.permissions?.code)
        .filter(Boolean)
    }
  }

  return {
    profile: profile as Profile,
    role,
    permissions: new Set(permissionCodes),
    isAdmin,
    isPlatformAdmin,
    domains,
    activeDomain,
  }
}

// ============================================================
// Provider
// ============================================================
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    role: null,
    permissions: new Set(),
    isAdmin: false,
    isPlatformAdmin: false,
    domains: [],
    activeDomain: null,
    loading: true,
  })

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setState({ user: null, profile: null, role: null, permissions: new Set(), isAdmin: false, isPlatformAdmin: false, domains: [], activeDomain: null, loading: false })
      return
    }
    const preferred = localStorage.getItem(`farmpilot_active_domain_${user.id}`)
    const data = await loadAuthData(user.id, preferred)
    setState({ user, ...data, loading: false })
  }, [])

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        setState(s => ({ ...s, loading: false }))
        return
      }
      const preferred = localStorage.getItem(`farmpilot_active_domain_${session.user.id}`)
      const data = await loadAuthData(session.user.id, preferred)
      setState({ user: session.user, ...data, loading: false })
      // MAJ last_login_at (best-effort)
      supabase.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', session.user.id).then()
    })()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        setState({ user: null, profile: null, role: null, permissions: new Set(), isAdmin: false, isPlatformAdmin: false, domains: [], activeDomain: null, loading: false })
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const preferred = localStorage.getItem(`farmpilot_active_domain_${session.user.id}`)
        const data = await loadAuthData(session.user.id, preferred)
        setState({ user: session.user, ...data, loading: false })
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    // Le onAuthStateChange va recharger automatiquement
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const switchDomain = useCallback(async (domainId: string) => {
    if (!state.user || !state.domains.some(domain => domain.domain_id === domainId)) return
    localStorage.setItem(`farmpilot_active_domain_${state.user.id}`, domainId)
    const data = await loadAuthData(state.user.id, domainId)
    setState({ user: state.user, ...data, loading: false })
    window.dispatchEvent(new CustomEvent('app:domain-changed', { detail: { domainId } }))
  }, [state.user, state.domains])

  const hasPermission = useCallback((moduleCode: string, action: PermissionAction = 'view'): boolean => {
    if (state.isAdmin) return true
    return state.permissions.has(`${moduleCode}.${action}`)
  }, [state.isAdmin, state.permissions])

  const canAccessModule = useCallback((moduleCode: string): boolean => {
    if (state.isAdmin) return true
    // Peut accéder au module s'il a au moins la permission 'view'
    return state.permissions.has(`${moduleCode}.view`)
  }, [state.isAdmin, state.permissions])

  const value: AuthContextValue = {
    ...state,
    signIn,
    signOut,
    hasPermission,
    canAccessModule,
    switchDomain,
    refresh,
  }

  return createElement(AuthContext.Provider, { value }, children)
}

// ============================================================
// Hook
// ============================================================
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé à l\'intérieur de <AuthProvider>')
  return ctx
}
