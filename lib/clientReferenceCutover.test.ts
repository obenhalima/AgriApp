import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const plan=readFileSync(new URL('../supabase/migrations/153_complete_approved_reference_plan.sql',import.meta.url),'utf8')
const cutover=readFileSync(new URL('../supabase/migrations/154_client_reference_cutover.sql',import.meta.url),'utf8')
describe('client reference migration source contracts (NOT PostgreSQL execution)',()=>{
  it('extends only the confirmed catalog while keeping a private source baseline',()=>{
    expect(plan).toContain('126 destinations attendues')
    expect(plan.match(/::uuid,'[^']+',(?:true|false)\)/g)).toHaveLength(15)
    expect(plan.match(/::uuid,'[^']+',false\)/g)).toHaveLength(7)
    expect(plan.match(/::uuid,'(?:fraise|framboise|poivron|piment_fort)','/g)).toHaveLength(23)
    expect(plan).toContain("WHERE c.code<>'tomate'")
    expect(plan).toContain('REVOKE ALL ON public.client_reference_source_snapshot FROM PUBLIC,anon,authenticated')
    expect(plan).not.toMatch(/\b(?:UPDATE|DELETE FROM)\s+public\.(?:crops|varieties|crop_variety_catalog)\b/i)
  })
  it('requires approved complete coverage and unchanged source rows before copying',()=>{
    expect(cutover).toContain('126')
    expect(cutover).toContain("reference_table='varieties')<>12")
    expect(plan).toContain("'Toutes les variétés copiées actives par client")
    expect(cutover).toContain('l.row IS DISTINCT FROM s.before_row')
    expect(cutover).toContain('cardinality(owners)<>1')
    expect(cutover).toContain('AND p.domain_id::text=u.owners[1]')
    expect(cutover).toContain('Collision d’identifiant de destination')
    expect(cutover).toContain('Vue dépendante non examinée')
    expect(cutover).toContain('BEGIN;')
    expect(cutover).toContain('COMMIT;')
  })
  it('fences direct and definer writes, identity transfers, links and view reads',()=>{
    expect(cutover).toContain('FOR p IN SELECT policyname FROM pg_policies')
    expect(cutover).toContain('ENABLE ROW LEVEL SECURITY')
    expect(cutover).toContain('OLD.domain_id IS DISTINCT FROM NEW.domain_id')
    expect(cutover).toContain('FOREIGN KEY(variety_id,domain_id) REFERENCES public.varieties(id,domain_id)')
    expect(cutover).toContain('FOREIGN KEY(crop_id,domain_id) REFERENCES public.crops(id,domain_id)')
    expect(cutover).toContain('FOREIGN KEY(supplier_id,domain_id) REFERENCES public.seed_suppliers(id,domain_id)')
    expect(cutover).toContain('BEFORE TRUNCATE')
    expect(cutover).toContain('Référence JSON hors client')
    expect(cutover).toContain('jsonb_array_elements(p.targets)')
    expect(cutover).toContain('cultural_program_variety_guard')
    expect(cutover).toContain('public.v_production_summary SET (security_invoker=true)')
    expect(cutover).toContain('public.v_planting_forecasts SET (security_invoker=true)')
  })
  it('preserves quantities, prices and parent settlements; only suspends named triggers',()=>{
    expect(cutover).not.toMatch(/DISABLE TRIGGER (?:ALL|USER)|session_replication_role/i)
    for(const trigger of ['trg_guard_generated_consumption_cost','trg_sl_recompute_totals']) {
      expect(cutover).toContain(`DISABLE TRIGGER ${trigger}`)
      expect(cutover).toContain(`ENABLE TRIGGER ${trigger}`)
    }
    expect(cutover).toContain("before_row-'variety_id'-'domain_id'")
    expect(cutover).toContain('Un bordereau a changé')
    expect(cutover).toContain("count(*) FROM public.crops WHERE NOT is_active)<>21")
    expect(cutover).toContain('client_reference_isolation_ready')
  })
})
