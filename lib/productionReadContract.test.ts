import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
it('disambiguates the variety relation for reads and mutation return values',()=>{
 const source=readFileSync(new URL('../app/production/page.tsx',import.meta.url),'utf8')
 expect(source.match(/varieties!campaign_plantings_variety_id_fkey\(commercial_name,type\)/g)).toHaveLength(2)
 expect(source).not.toContain('varieties(commercial_name,type)')
 expect(source).toContain(".eq('domain_id', activeDomain.domain_id)")
})
it('does not present failed loads as an empty plantation list',()=>{
 const source=readFileSync(new URL('../app/production/page.tsx',import.meta.url),'utf8')
 expect(source).toContain('find(result=>result.error)')
 expect(source).toContain(') : loadError ? (')
 expect(source).toContain('role="alert"')
})
it('disambiguates both plantation and dispatch varieties in the harvest screen',()=>{
 const source=readFileSync(new URL('../app/recoltes/page.tsx',import.meta.url),'utf8')
 expect(source.match(/varieties!campaign_plantings_variety_id_fkey\(/g)).toHaveLength(2)
 expect(source.match(/varieties!harvest_lots_variety_id_fkey\(/g)).toHaveLength(2)
 expect(source).not.toMatch(/varieties\((commercial_name|code)/)
})
