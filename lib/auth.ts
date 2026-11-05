'use client'
import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode, createElement } from 'react'
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'
import { withAuthCancellation } from './authInitialization'

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
  must_change_password: boolean
  password_changed_at: string | null
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
  initializationError: boolean
  initializationBusy: boolean
  retryInitialization: () => Promise<void>
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
async function loadAuthData(userId: string, preferredDomainId?: string | null, signal?:AbortSignal): Promise<{
  profile: Profile | null
  role: Role | null
  permissions: Set<string>
  isAdmin: boolean
  isPlatformAdmin: boolean
  domains: DomainAccess[]
  activeDomain: DomainAccess | null
}> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('*').eq('id', userId).abortSignal(signal||new AbortController().signal).maybeSingle()
  if (profileError) throw profileError

  if (!profile?.is_active) {
    return { profile: null, role: null, permissions: new Set(), isAdmin: false, isPlatformAdmin: false, domains: [], activeDomain: null }
  }

  const isPlatformAdmin = Boolean(profile.is_platform_admin)
  const { data: membershipRows, error: membershipError } = await supabase
    .from('domain_memberships')
    .select('domain_id, role_id, is_default, domains!inner(code, name, is_active), roles!inner(name, is_active)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('domains.is_active', true)
    .eq('roles.is_active', true)
    .abortSignal(signal||new AbortController().signal)
  if (membershipError) throw membershipError

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
    const { data: allDomains, error: domainsError } = await supabase.from('domains').select('id, code, name').eq('is_active', true).order('name').abortSignal(signal||new AbortController().signal)
    if (domainsError) throw domainsError
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
    const { data: roleData, error: roleError } = await supabase
      .from('roles').select('*').eq('id', effectiveRoleId).abortSignal(signal||new AbortController().signal).maybeSingle()
    if (roleError) throw roleError
    role = roleData as Role | null
    isAdmin = Boolean(role?.is_active && role?.is_admin)

    // Si pas admin, on charge les permissions du rôle
    if (!isAdmin && role?.is_active) {
      const { data: perms, error: permissionError } = await supabase
        .from('role_permissions')
        .select('granted, permissions(code)')
        .eq('role_id', effectiveRoleId)
        .eq('granted', true)
        .abortSignal(signal||new AbortController().signal)
      if (permissionError) throw permissionError
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
  const authVersion = useRef(0)
  const pending = useRef(false)
  const attemptController=useRef<AbortController|null>(null)
  // A refresh-token operation can outlive the UI deadline inside the SDK.
  // Retries share that identity read instead of queueing new getUser calls.
  const identityRequest=useRef<ReturnType<typeof supabase.auth.getUser>|null>(null)
  const failedAttempt=useRef(false)
  const [initializationBusy,setInitializationBusy]=useState(false)
  const initialLoginStamp = useRef(true)
  const [initializationError, setInitializationError] = useState(false)
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
    if (pending.current) return
    pending.current = true
    setInitializationBusy(true)
    const controller=new AbortController();attemptController.current=controller
    const version = ++authVersion.current
    // Initial/retry state stays blocked; background checks do not remount pages.
    try {
      const result = await withAuthCancellation(async signal => {
        if(!identityRequest.current)identityRequest.current=supabase.auth.getUser().finally(()=>{identityRequest.current=null})
        const { data: { user }, error } = await identityRequest.current
        signal.throwIfAborted()
        if (error && error.name !== 'AuthSessionMissingError') throw error
        if (!user) return { user: null, profile: null, role: null, permissions: new Set<string>(), isAdmin: false, isPlatformAdmin: false, domains: [], activeDomain: null, loading: false }
        const preferred = localStorage.getItem(`farmpilot_active_domain_${user.id}`)
        const data = await loadAuthData(user.id, preferred,signal)
        return { user, ...data, loading: false }
      },controller)
      if (version === authVersion.current) {
        failedAttempt.current=false;setInitializationError(false)
        setState(result)
        if (initialLoginStamp.current && result.user && result.profile?.is_active) {
          void supabase.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', result.user.id).then(() => {})
        }
        initialLoginStamp.current = false
      }
    } catch {
      if (version === authVersion.current) {
        setInitializationError(true)
        failedAttempt.current=true
        // Fail closed in memory, without signOut/localStorage.clear/removeItem.
        setState({ user: null, profile: null, role: null, permissions: new Set(), isAdmin: false, isPlatformAdmin: false, domains: [], activeDomain: null, loading: true })
      }
    } finally {
      if (version === authVersion.current) {pending.current = false;setInitializationBusy(false)}
    }
  }, [])

  useEffect(() => {
    let disposed = false
    void refresh()

    // Never await Supabase calls inside its auth notification. Token refresh
    // waits for subscribers; those calls in turn wait for the same refresh.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return // Initial getUser() performs server validation.
      if (event === 'SIGNED_OUT' || !session?.user) {
        attemptController.current?.abort();failedAttempt.current=false;setInitializationBusy(false)
        authVersion.current++
        pending.current = false
        setInitializationError(false)
        setState({ user: null, profile: null, role: null, permissions: new Set(), isAdmin: false, isPlatformAdmin: false, domains: [], activeDomain: null, loading: false })
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setTimeout(() => {
          if (!disposed&&!failedAttempt.current) void refresh()
        }, 0)
      }
    })
    return () => { disposed = true; attemptController.current?.abort();authVersion.current++; pending.current = false; subscription.unsubscribe() }
  }, [refresh])

  // Recheck suspension/permissions in open tabs, including when returning from background.
  useEffect(() => {
    const check = () => { if (!failedAttempt.current&&document.visibilityState === 'visible') void refresh().catch(() => {
      setState({ user: null, profile: null, role: null, permissions: new Set(), isAdmin: false, isPlatformAdmin: false, domains: [], activeDomain: null, loading: false })
    }) }
    const timer = window.setInterval(check, 60000)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => { clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check) }
  }, [refresh])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    // Le onAuthStateChange va recharger automatiquement
  }, [])

  const signOut = useCallback(async () => {
    // Shared phones: unsubscribe locally even if the server is temporarily unavailable.
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration('/')
        const subscription = await registration?.pushManager?.getSubscription()
        if (subscription) {
          await subscription.unsubscribe()
          await supabase.from('mobile_push_subscriptions').delete().eq('endpoint', subscription.endpoint).abortSignal(AbortSignal.timeout(5000))
        }
      } catch { /* Signing out must not be blocked by the notification service. */ }
    }
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
    if (!state.user || !state.profile?.is_active) return false
    if (state.isPlatformAdmin || state.isAdmin) return true
    return state.permissions.has(`${moduleCode}.${action}`)
  }, [state.user, state.profile, state.isPlatformAdmin, state.isAdmin, state.permissions])

  const canAccessModule = useCallback((moduleCode: string): boolean => {
    if (!state.user || !state.profile?.is_active) return false
    if (state.isPlatformAdmin || state.isAdmin) return true
    // Peut accéder au module s'il a au moins la permission 'view'
    return state.permissions.has(`${moduleCode}.view`)
  }, [state.user, state.profile, state.isPlatformAdmin, state.isAdmin, state.permissions])

  const value: AuthContextValue = {
    ...state,
    initializationError,
    initializationBusy,
    retryInitialization: refresh,
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
