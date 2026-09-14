import { describe, expect, it } from 'vitest'
import { alertDefaults, buildOperationalAlerts, dayInMorocco } from './operationalAlerts'
const now = new Date('2026-09-14T12:00:00Z')
const blank = () => ({ stocks: [] as any[], balances: [] as any[], warehouses: [] as any[], requests: [] as any[], forecast: [] as any[], plantings: [] as any[], harvests: [] as any[] })
describe('Centre des alertes', () => {
  it('isole les soldes entrepôt et formate les nombres en français', () => {
    const d = blank(); d.stocks = [{ id:'s', name:'Produit', unit:'l', current_qty:5000, min_qty:0, is_active:true }]
    d.warehouses = [{id:'w',is_active:true,farm_id:'f',name:'Sud'}]
    d.balances = [{stock_item_id:'s',warehouse_id:'w',current_qty:2208,min_qty:3000}]
    const a = buildOperationalAlerts(d,alertDefaults,now)
    expect(a).toHaveLength(1); expect(a[0].farmId).toBe('f'); expect(a[0].detail.replace(/\s/g,' ')).toContain('2 208,00')
  })
  it('alerte sur un stock nul même sans seuil et ignore les articles inactifs', () => {
    const d=blank();d.stocks=[{id:'a',name:'A',unit:'kg',current_qty:0,is_active:true},{id:'b',current_qty:0,is_active:false}]
    expect(buildOperationalAlerts(d,alertDefaults,now)).toHaveLength(1)
  })
  it('respecte 15 jours et la prévision cumulée par occurrence', () => {
    const d=blank();d.requests=[1,2,3].map(i=>({id:String(i),status:'approuvee',planned_at:`2026-09-${i===3?'30':'20'}T12:00:00Z`,occurrence_number:i}))
    d.forecast=[{request_id:'1',stock_status:'disponible'},{request_id:'2',stock_status:'non_disponible',shortages:[{product:'A',missing:2,unit:'l'}]},{request_id:'3',stock_status:'non_disponible'}]
    expect(buildOperationalAlerts(d,alertDefaults,now).map(a=>a.id)).toEqual(['short:2'])
  })
  it('signale le retard sans inclure exécutés, annulés ou suspendus hors prévision', () => {
    const d=blank();d.requests=['approuvee','executee','annulee'].map((status,i)=>({id:String(i),status,planned_at:'2026-09-13T12:00:00Z'}));d.requests.push({id:'paused',status:'approuvee',planned_at:'2026-09-13'})
    d.forecast=d.requests.filter(r=>r.id!=='paused').map(r=>({request_id:r.id,stock_status:'disponible'}))
    expect(buildOperationalAlerts(d,alertDefaults,now).map(a=>a.id)).toEqual(['late:0'])
    expect(buildOperationalAlerts(d,{...alertDefaults,treatment_delay_hours:48},now)).toEqual([])
  })
  it('ne surveille que la période de récolte active', () => {
    const d=blank();d.plantings=[{id:'yes',first_harvest_date:'2026-09-01'},{id:'young',first_harvest_date:'2026-10-01'},{id:'ended',first_harvest_date:'2026-08-01',last_harvest_date:'2026-09-01'},{id:'unknown'},{id:'closed',first_harvest_date:'2026-09-01',campaigns:{status:'terminee'}}]
    expect(buildOperationalAlerts(d,alertDefaults,now).map(a=>a.id)).toEqual(['harvest:yes'])
  })
  it('une récolte récente positive lève l’alerte, pas une saisie nulle ou future', () => {
    const d=blank();d.plantings=[{id:'p',first_harvest_date:'2026-09-01'}]
    d.harvests=[{campaign_planting_id:'p',harvest_date:'2026-09-14',actual_kg:0},{campaign_planting_id:'p',harvest_date:'2026-09-15',total_qty:100}]
    expect(buildOperationalAlerts(d,alertDefaults,now)).toHaveLength(1)
    d.harvests.push({campaign_planting_id:'p',harvest_date:'2026-09-13',total_qty:100})
    expect(buildOperationalAlerts(d,alertDefaults,now)).toEqual([])
  })
  it('désactive chaque famille',()=>{const d=blank();d.stocks=[{id:'s',current_qty:0,is_active:true}];d.plantings=[{id:'p',first_harvest_date:'2026-09-01'}];expect(buildOperationalAlerts(d,{...alertDefaults,stock_enabled:false,harvest_enabled:false,treatment_enabled:false},now)).toEqual([])})
  it('utilise la date du Maroc autour de minuit',()=>{expect(dayInMorocco(new Date('2026-09-13T23:30:00Z'))).toBe('2026-09-14')})
})
