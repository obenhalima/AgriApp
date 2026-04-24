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
}

export type Permission = {
  code: string               // ex: "couts.view"
  module_code: string
  action: PermissionAction
}

export type AuthState = {
  user: User | null
  profile: Profile | null
  role: Role | null
  permissions: Set<string>    // ensemble des codes de permission (module_code.action)
  isAdmin: boolean
  loading: boolean
}

export type AuthContextValue = AuthState & {
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  hasPermission: (moduleCode: string, action?: PermissionAction) => boolean
  canAccessModule: (moduleCode: string) => boolean
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// ============================================================
// Charge profil + rôle + permissions pour un user_id
// ============================================================
async function loadAuthData(userId: string): Promise<{
  profile: Profile | null
  role: Role | null
  permissions: Set<string>
  isAdmin: boolean
}> {
  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', userId).maybeSingle()

  if (!profile) {
    return { profile: null, role: null, permissions: new Set(), isAdmin: false }
  }

  let role: Role | null = null
  let permissionCodes: string[] = []
  let isAdmin = false

  if (profile.role_id) {
    const { data: roleData } = await supabase
      .from('roles').select('*').eq('id', profile.role_id).maybeSingle()
    role = roleData as Role | null
    isAdmin = Boolean(role?.is_admin)

    // Si pas admin, on charge les permissions du rôle
    if (!isAdmin) {
      const { data: perms } = await supabase
        .from('role_permissions')
        .select('granted, permissions(code)')
        .eq('role_id', profile.role_id)
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
    loading: true,
  })

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setState({ user: null, profile: null, role: null, permissions: new Set(), isAdmin: false, loading: false })
      return
    }
    const { profile, role, permissions, isAdmin } = await loadAuthData(user.id)
    setState({ user, profile, role, permissions, isAdmin, loading: false })
  }, [])

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        setState(s => ({ ...s, loading: false }))
        return
      }
      const { profile, role, permissions, isAdmin } = await loadAuthData(session.user.id)
      setState({ user: session.user, profile, role, permissions, isAdmin, loading: false })
      // MAJ last_login_at (best-effort)
      supabase.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', session.user.id).then()
    })()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        setState({ user: null, profile: null, role: null, permissions: new Set(), isAdmin: false, loading: false })
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const { profile, role, permissions, isAdmin } = await loadAuthData(session.user.id)
        setState({ user: session.user, profile, role, permissions, isAdmin, loading: false })
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
