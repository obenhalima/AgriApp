import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const file=fileURLToPath(new URL('../scripts/ITRIX_ISOLATION_CLIENTS.sql',import.meta.url))
describe('single manual SQL source package (not PostgreSQL execution)',()=>{
 it('matches its maintained sources and applies one consolidated server-side installation',()=>{
  const expected=execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/build-client-reference-bundle.mjs',import.meta.url))],{encoding:'utf8'})
  const sql=readFileSync(file,'utf8').replace(/\r\n/g,'\n')
  expect(sql.trim()).toBe(expected.trim())
  expect(sql.match(/^BEGIN;$/gm)).toHaveLength(1)
  expect(sql.match(/^COMMIT;$/gm)).toHaveLength(1)
  expect(sql).not.toMatch(/^ROLLBACK;$/m)
  expect(sql).toContain('DO $itrix_install_v3$')
  expect(sql).toContain('EXECUTE $itrix_ddl_v3$')
  expect(sql).toContain('$itrix_checks_v3$ INTO report')
  expect(sql).toContain("RAISE EXCEPTION 'Contrôle final refusé")
  expect(sql).toContain("reference_table='varieties')<>12")
  expect(sql).toContain('126 destinations attendues')
  expect(sql).toContain('AS isolation_check;')
  expect(sql).not.toMatch(/CREATE TEMP TABLE|pg_temp\./)
  for(const table of ['client_reference_live_before','client_reference_usage_work']) {
   expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
   expect(sql).toContain(`REVOKE ALL ON public.${table} FROM PUBLIC,anon,authenticated,service_role`)
   expect(sql).toContain(`DROP TABLE public.${table};`)
  }
 })
 it('protects old clients from deleting lines before an invalid replacement',()=>{
  const sql=readFileSync(file,'utf8').replace(/\r\n/g,'\n')
  expect(sql).toContain('REVOKE INSERT,UPDATE,DELETE ON public.station_settlement_lines FROM authenticated')
  expect(sql).toContain('replace_client_settlement_lines(p_domain uuid,p_settlement uuid,p_lines jsonb)')
  const rpc=sql.slice(sql.indexOf('CREATE FUNCTION public.replace_client_settlement_lines'))
  expect(rpc.indexOf('FOR line IN SELECT')).toBeLessThan(rpc.indexOf('DELETE FROM public.station_settlement_lines'))
  expect(rpc).toContain('FOR UPDATE')
  expect(rpc).toContain('domain_id<>p_domain')
  expect(rpc).toContain('id=p_settlement AND domain_id=p_domain FOR UPDATE')
  expect(sql).toContain('settlement_line_parent_client_fk')
 })
})
