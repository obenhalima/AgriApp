import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const sql=readFileSync(new URL('../supabase/migrations/152_approved_client_reference_plan.sql',import.meta.url),'utf8')
describe('approved reference plan source contract (not PostgreSQL execution)',()=>{
  it('records only the approved five variety destinations and three crop destinations',()=>{
    expect(sql.match(/\('varieties',/g)).toHaveLength(5)
    expect(sql.match(/\('crops',/g)).toHaveLength(3)
    expect(sql).toContain("code='STALSON'")
    expect(sql).toContain("code='DOM-BENHALIMA'")
    expect(sql).toContain("code='DOMBEN501'")
    expect(sql).toContain("'MARQ'")
  })
  it('keeps business data untouched and refuses stale or existing plans',()=>{
    expect(sql).not.toMatch(/\b(?:UPDATE|DELETE FROM|TRUNCATE|DROP TABLE)\s+public\.(?:varieties|crops|campaign_plantings|harvest_lots|cost_entries)\b/i)
    expect(sql).toContain('LOCK TABLE public.domains, public.crops, public.varieties IN SHARE MODE')
    expect(sql).toContain('IF EXISTS(SELECT 1 FROM public.client_reference_migration_plan)')
    expect(sql).toContain('supplier_id IS NULL')
    expect(sql).toContain('is_active=false')
    expect(sql).toContain('BEGIN;')
    expect(sql).toContain('COMMIT;')
  })
  it('keeps the approved source-to-client mappings and active Tomate links',()=>{
    const rows=sql.split('\n').map(line=>line.trim()).filter(line=>line.startsWith("('varieties',"))
    const expected=[
      "'806f845e-9e81-489a-9341-7ace21dcccda',stalson,gen_random_uuid()",
      "'806f845e-9e81-489a-9341-7ace21dcccda',ben,'806f845e-9e81-489a-9341-7ace21dcccda'",
      "'8d67b5d6-a0c9-4939-94a1-ed090d3899ba',ben,'8d67b5d6-a0c9-4939-94a1-ed090d3899ba'",
      "'37caf3ef-fbab-4a25-94a3-9fe35402432b',ben501,'37caf3ef-fbab-4a25-94a3-9fe35402432b'",
      "'ec26adb4-a819-4750-afe9-6b3594eb0796',ben501,'ec26adb4-a819-4750-afe9-6b3594eb0796'",
    ]
    expected.forEach((mapping,index)=>{
      expect(rows[index]).toContain(mapping)
      expect(rows[index]).toContain('true,tomato)')
    })
  })
})
