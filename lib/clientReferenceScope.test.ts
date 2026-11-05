import { describe, expect, it, vi } from 'vitest'
import { requireReferenceDomain, requireClientReferenceWrite } from './clientReferenceScope'

describe('client-owned references', () => {
  it('freezes writes unless cutover is explicitly enabled', () => {
    for (const value of [undefined, '', 'false', '1']) {
      vi.stubEnv('NEXT_PUBLIC_CLIENT_REFERENCE_ISOLATION', value)
      expect(() => requireClientReferenceWrite('11111111-1111-4111-8111-111111111111')).toThrow('lecture seule')
    }
    vi.unstubAllEnvs()
  })
  it('requires explicit valid client selection, without global fallback', () => {
    for (const value of ['', 'all', 'undefined', null, undefined, {}]) {
      expect(() => requireReferenceDomain(value as string)).toThrow('client valide')
    }
  })
  it('keeps clients distinct', () => {
    const a='11111111-1111-4111-8111-111111111111'
    const b='22222222-2222-4222-8222-222222222222'
    expect(requireReferenceDomain(a)).toBe(a)
    expect(requireReferenceDomain(b)).toBe(b)
    expect(requireReferenceDomain(a)).not.toBe(requireReferenceDomain(b))
  })
})
