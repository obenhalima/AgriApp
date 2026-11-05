import {expect,it,vi,beforeEach} from 'vitest'
import {readFileSync} from 'node:fs'
const mock=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}))
vi.mock('./supabase',()=>({supabase:mock}))
import {createSettlement,getUnpricedLotsSummary} from './stationSettlements'
beforeEach(()=>{
 vi.stubEnv('NEXT_PUBLIC_CLIENT_REFERENCE_ISOLATION','true')
 mock.rpc.mockResolvedValue({data:true,error:null});mock.from.mockReset()
})
it('refuse un marché hors client avant toute insertion',async()=>{
 const q:any={select:vi.fn(()=>q),eq:vi.fn(()=>q),maybeSingle:vi.fn(async()=>({data:null,error:null}))}
 mock.from.mockReturnValue(q)
 await expect(createSettlement({domain_id:'11111111-1111-4111-8111-111111111111',market_id:'foreign',period_start:'2026-10-19',period_end:'2026-10-25'})).rejects.toThrow('ce client')
 expect(mock.from).toHaveBeenCalledTimes(1)
 expect(mock.from).toHaveBeenCalledWith('markets')
 expect(q.eq).toHaveBeenCalledWith('domain_id','11111111-1111-4111-8111-111111111111')
})
it('utilise des jointures explicites et filtre le sélecteur par client',()=>{
 const helper=readFileSync(new URL('./stationSettlements.ts',import.meta.url),'utf8')
 const ui=readFileSync(new URL('../app/factures/BordereauxSection.tsx',import.meta.url),'utf8')
 expect(helper.match(/markets!station_settlements_market_id_fkey\(/g)).toHaveLength(3)
 expect(helper).not.toContain(".select('*, markets(")
 expect(ui).toContain(".eq('domain_id',activeDomain.domain_id).eq('is_active', true)")
 expect(helper).toContain('if (existingError) throw existingError')
})
it('filtre le stock par client et désambiguïse toutes ses références',async()=>{
 const q:any={select:vi.fn(()=>q),eq:vi.fn(()=>q),then:(resolve:any)=>Promise.resolve({data:[],error:null}).then(resolve)}
 mock.from.mockReturnValue(q)
 expect(await getUnpricedLotsSummary('market','11111111-1111-4111-8111-111111111111')).toEqual([])
 expect(q.eq).toHaveBeenCalledWith('domain_id','11111111-1111-4111-8111-111111111111')
 expect(q.eq).toHaveBeenCalledWith('market_id','market')
 const select=q.select.mock.calls[0][0]
 expect(select).toContain('markets!harvest_lots_market_id_fkey')
 expect(select).toContain('varieties!harvest_lots_variety_id_fkey')
 expect(select).toContain('greenhouses!harvest_lots_greenhouse_id_fkey')
})
it('ne charge aucun stock sans client sélectionné',async()=>{
 await expect(getUnpricedLotsSummary('market')).rejects.toThrow()
 expect(mock.from).not.toHaveBeenCalled()
})
