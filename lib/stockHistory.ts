import { initNumber } from './initialization'

export const HISTORY_COLUMNS = [
 ['external_id','Identifiant mouvement'],['date','Date mouvement'],['order','Ordre dans la journée'],
 ['type','Type mouvement'],['item','Code article'],['unit','Unité'],['warehouse','Code entrepôt'],
 ['quantity','Quantité'],['price','Prix unitaire entrée (MAD)'],['reference','Référence pièce'],
 ['supplier','Code fournisseur'],['farm','Code ferme'],['campaign','Code campagne'],
 ['plantings','Références plantations (; multiples)'],['notes','Note facultative'],
] as const
export type HistoryRow = Record<typeof HISTORY_COLUMNS[number][0],string> & { line:number }
export type HistoryBalance = {item:string;warehouse:string;quantity:number;value:number|null;verified:boolean;last_date:string|null}
export type HistoryCatalog = {
 cost_method?:'cump'|'fifo'
 items:{id:string;code:string;name:string;unit:string;category:string}[]
 warehouses:{id:string;code:string;name:string;farm_id:string;farm_code:string;farm_name:string}[]
 suppliers:{code:string;name:string}[]
 plantings:{ref:string;id:string;campaign:string;campaign_name:string;farm:string;greenhouse:string;variety:string;area:number}[]
 balances:HistoryBalance[]
 movement_count:number
}
export type HistoryResult = {
 status:'preview'|'applied'; entries:number; exits:number; skipped:number; unvalued:number
 cost_total:number; cost_lines?:number; balances:HistoryBalance[]; operation_id:string|null
}
export function historyPayload(rows:HistoryRow[]) {
 return rows.map(row=>Object.fromEntries(HISTORY_COLUMNS.map(([key])=>[key,row[key]])))
}
export function checkStockHistory(input:HistoryRow[],catalog:HistoryCatalog,today:string) {
 const rows:HistoryRow[]=[],issues:{line:number;message:string}[]=[]
 const ids=new Set<string>(),orders=new Set<string>()
 for(const raw of input){
  const row={...raw}
  for(const [key] of HISTORY_COLUMNS)row[key]=String(row[key]??'').trim()
  if(!HISTORY_COLUMNS.some(([key])=>row[key]))continue
  rows.push(row)
  const add=(message:string)=>issues.push({line:row.line,message})
  if(!row.external_id||row.external_id.length>100||ids.has(row.external_id))add('Identifiant obligatoire, unique dans le fichier, maximum 100 caractères.')
  ids.add(row.external_id)
  if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(Date.parse(row.date))||new Date(row.date).toISOString().slice(0,10)!==row.date||row.date>today)add('Date valide non future requise.')
  const order=Number(row.order),position=row.date+'/'+order
  if(!/^\d+$/.test(row.order)||!Number.isInteger(order)||order<1||order>1000000||orders.has(position))add('Ordre entier positif, unique pour chaque date.')
  orders.add(position)
  const item=catalog.items.find(item=>item.code.toUpperCase()===row.item.toUpperCase())
  if(!item||item.unit!==row.unit)add('Article actif et unité du référentiel requis.')
  const warehouse=catalog.warehouses.find(w=>w.code.toUpperCase()===row.warehouse.toUpperCase())
  if(!warehouse||warehouse.farm_code.toUpperCase()!==row.farm.toUpperCase())add('Entrepôt et ferme du référentiel requis.')
  if(!['entree','sortie'].includes(row.type))add('Type attendu : entree ou sortie.')
  const quantity=initNumber(row.quantity),price=row.price===''?null:initNumber(row.price)
  if(!row.quantity||!Number.isFinite(quantity)||quantity<=0||quantity>99999999.99||Math.abs(quantity*100-Math.round(quantity*100))>0.00001)add('Quantité positive, maximum deux décimales.')
  if(price!==null&&(!Number.isFinite(price)||price<0||price>99999999.99||Math.abs(price*1e8-Math.round(price*1e8))>0.01))add('Prix positif ou nul, maximum huit décimales.')
  if(row.reference.length>100||row.notes.length>2000)add('Référence limitée à 100 caractères et note à 2 000 caractères.')
  if(row.type==='entree'){
   if(catalog.cost_method==='fifo'&&row.price==='')add('Prix obligatoire sur chaque entrée en méthode FIFO.')
   if(row.campaign||row.plantings)add('Affectations de consommation réservées aux sorties.')
   if(row.supplier&&!catalog.suppliers.some(s=>s.code.toUpperCase()===row.supplier.toUpperCase()))add('Fournisseur actif du référentiel requis.')
  }
  if(row.type==='sortie'){
   if(row.price!==''||row.supplier)add('Prix et fournisseur à renseigner sur les entrées uniquement.')
   const refs=row.plantings.split(';').map(s=>s.trim()).filter(Boolean)
   const selected=refs.map(ref=>catalog.plantings.find(p=>p.ref===ref))
   if(!refs.length||refs.length>200||new Set(refs).size!==refs.length||selected.some(p=>!p||p.farm.toUpperCase()!==row.farm.toUpperCase()||p.campaign.toUpperCase()!==row.campaign.toUpperCase()))add('Choisissez les références de plantations de cette ferme et campagne, séparées par ;.')
  }
  if(Number.isFinite(quantity))row.quantity=quantity.toFixed(2)
  if(price!==null&&Number.isFinite(price))row.price=price.toFixed(8)
 }
 if(rows.length>1000)issues.push({line:0,message:'Maximum 1 000 mouvements par fichier.'})
 return {rows,issues}
}
