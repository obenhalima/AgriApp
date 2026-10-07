import { describe, expect, it } from 'vitest'
import { getAccessGate } from './accessGate'
const valid = { loading: false, hasUser: true, activeProfile: true, mustChangePassword: false, pathname: '/achats/123', moduleAllowed: true }
describe('direct module access', () => {
  it('never mounts a module without a session', () => expect(getAccessGate({ ...valid, hasUser: false })).toBe('login'))
  it('waits for identity validation', () => expect(getAccessGate({ ...valid, loading: true })).toBe('loading'))
  it('blocks inactive or missing profile despite a stored session', () => expect(getAccessGate({ ...valid, activeProfile: false })).toBe('inactive'))
  it('blocks a missing module permission', () => expect(getAccessGate({ ...valid, moduleAllowed: false })).toBe('denied'))
  it('requires password change before mounting a module', () => expect(getAccessGate({ ...valid, mustChangePassword: true })).toBe('password'))
  it('preserves valid sessions and direct links', () => expect(getAccessGate(valid)).toBe('allowed'))
  it('allows the login form without a session', () => expect(getAccessGate({ ...valid, hasUser: false, pathname: '/login' })).toBe('public'))
  it('permits the required password screen', () => expect(getAccessGate({ ...valid, mustChangePassword: true, pathname: '/change-password' })).toBe('public'))
})
