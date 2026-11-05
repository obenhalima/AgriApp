import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// Source contract only: execution against PostgreSQL must be validated separately.
const sql = readFileSync(new URL('../supabase/migrations/150_freeze_shared_business_references.sql', import.meta.url), 'utf8')
describe('emergency shared-reference containment contract', () => {
  it('covers the identified global mutable business references', () => {
    for (const table of ['varieties','crops','crop_variety_catalog','reference_lists','reference_values','seed_suppliers','app_settings','exchange_rates','account_categories','workflow_definitions','workflow_states','workflow_transitions']) {
      expect(sql).toContain(`'${table}'`)
    }
  })
  it('does not rely on permissive policies or only the interface', () => {
    expect(sql).toContain('AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false)')
    expect(sql).toContain('AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false)')
    expect(sql).toContain('AS RESTRICTIVE FOR DELETE TO authenticated USING (false)')
    expect(sql).toContain("auth.role() IN ('authenticated', 'anon')")
    expect(sql).toContain('BEFORE INSERT OR UPDATE OR DELETE')
    expect(sql).toContain('BEFORE TRUNCATE')
    expect(sql).toContain('FOR EACH STATEMENT')
  })
  it('preserves historical data and refuses already domain-scoped tables', () => {
    expect(sql).toContain("column_name='domain_id'")
    expect(sql).not.toMatch(/(?:^|;)\s*(?:TRUNCATE\s+(?:TABLE\s+)?public\.|DELETE FROM|DROP TABLE)\b/im)
  })
})
