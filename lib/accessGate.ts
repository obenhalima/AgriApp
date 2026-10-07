export type AccessGate = 'loading' | 'public' | 'login' | 'inactive' | 'password' | 'denied' | 'allowed'
export function getAccessGate(input: {
  loading: boolean; hasUser: boolean; activeProfile: boolean; mustChangePassword: boolean;
  pathname: string; moduleAllowed: boolean;
}): AccessGate {
  if (input.loading) return 'loading'
  const publicPage = ['/login', '/forgot-password', '/reset-password', '/change-password'].includes(input.pathname)
  if (!input.hasUser) return publicPage ? 'public' : 'login'
  if (!input.activeProfile) return 'inactive'
  if (input.mustChangePassword && input.pathname !== '/change-password') return 'password'
  if (publicPage) return 'public'
  if (!input.moduleAllowed) return 'denied'
  return 'allowed'
}
