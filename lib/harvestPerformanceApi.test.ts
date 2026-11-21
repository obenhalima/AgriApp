import {expect,it,vi} from 'vitest'
const fixture=vi.hoisted(()=>({data:{} as any,read:vi.fn(),rpc:vi.fn()}))
vi.mock('./supabase',()=>({supabase:{rpc:fixture.rpc}}))
vi.mock('./harvestRevenueApi',()=>({readHarvestRevenue:fixture.read}))
import {readHarvestPerformance} from './harvestPerformanceApi'
import {allocateHarvestRevenue} from './harvestRevenue'
it('filters real revenue by original harvest date instead of the RPC dispatch dates',async()=>{
 const p={id:'p',campaign_id:'campaign'}
 const h={id:'h',domain_id:'domain',harvest_date:'2026-09-30',campaign_plantings:p}
 const lot={id:'l',domain_id:'domain',harvest_date:'2026-10-02',harvest_id:'h',harvests:h,tri_status:'priced',qty_acceptee_kg:100,ca_amount:1000}
 fixture.data={plantings:[p],revenue_available:true,station_lots:[{date:'2026-10-02',amount:9999}]}
 fixture.rpc.mockReturnValue({abortSignal:async()=>({data:fixture.data,error:null})})
 fixture.read.mockResolvedValue({lots:[lot],sources:[],entries:allocateHarvestRevenue(lot,[],[])})
 const september=await readHarvestPerformance('domain','campaign','2026-09-01','2026-09-30',new AbortController().signal)
 expect(september.station_lots).toEqual([{id:'l:h',planting_id:'p',date:'2026-09-30',amount:1000,priced_kg:100,accepted_kg:100}])
 const october=await readHarvestPerformance('domain','campaign','2026-10-01','2026-10-31',new AbortController().signal)
 expect(october.station_lots).toEqual([])
})
it('does not read revenue tables when the authorized RPC withholds revenue',async()=>{
 fixture.read.mockClear()
 fixture.rpc.mockReturnValue({abortSignal:async()=>({data:{revenue_available:false},error:null})})
 await readHarvestPerformance('domain',null,null,null,new AbortController().signal)
 expect(fixture.read).not.toHaveBeenCalled()
})
