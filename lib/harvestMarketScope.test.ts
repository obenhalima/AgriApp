import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
const source=readFileSync('app/recoltes/page.tsx','utf8')
it('filters active market choices by the selected tenant',()=>{
 expect(source).toContain(".select('id, domain_id, code, name, currency, type').eq('domain_id',activeDomain.domain_id).eq('is_active', true)")
 expect(source).toContain('markets.filter(m=>m.domain_id===activeDomain?.domain_id)')
})
it('resets the composer on tenant changes and only opens on current loaded data',()=>{
 expect(source).toContain('setModalCompose(false);setMarkets([])')
 expect(source).toContain('historyDomain===activeDomain.domain_id')
 expect(source).toContain('key={activeDomain?.domain_id} domainId=')
})
it('rechecks the selected market before creating an explicitly scoped dispatch',()=>{
 const compose=source.slice(source.indexOf('function ComposeModal('),source.indexOf('function TriModal('))
 expect(compose).toContain(".eq('id',marketId).eq('domain_id',domainId).eq('is_active',true).maybeSingle()")
 expect(compose.indexOf(".from('markets')")).toBeLessThan(compose.indexOf(".from('harvest_lots').insert"))
 expect(compose).toContain('domain_id:domainId')
 expect(compose).toContain('?.domain_id!==domainId')
})
