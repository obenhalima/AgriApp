import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../scripts/inventory-client-reference-cutover.sql', import.meta.url), 'utf8')
const executable = sql.replace(/--[^\n]*/g, '')

describe('reference cutover preflight source contract (not SQL execution)', () => {
  it('is read-only and usable before the private plan exists', () => {
    expect(executable).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|CALL|DO)\b/i)
    expect(executable).not.toMatch(/\bFROM\s+public\.client_reference_migration_plan\b/i)
    expect(sql).toContain("to_regclass('public.client_reference_migration_plan')")
  })
  it('covers incoming keys for every target, including non-variety references', () => {
    for (const table of ['varieties', 'crops', 'seed_suppliers', 'crop_variety_catalog']) {
      expect(sql).toContain(`('${table}')`)
      expect(sql).toContain(`FROM public.${table}`)
    }
    expect(sql).toContain('k.confrelid IN (SELECT oid FROM relevant_relations)')
    expect(sql).toContain('pg_get_indexdef')
    expect(sql).toContain('pg_get_triggerdef')
    expect(sql).toContain('pg_policies')
  })
  it('lists known non-FK representations without exporting credentials or contacts', () => {
    expect(sql).toContain('clients.preferred_variety_ids')
    expect(sql).toContain('cultural_consumptions.allocations[*].variety_id')
    expect(sql).toContain('initialization_drafts.payload.rows.varieties[*].existing_id')
    expect(executable).not.toMatch(/\b(?:contact_email|contact_phone|password|access_token|refresh_token)\b/i)
  })
})
