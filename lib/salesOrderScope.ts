import {supabase} from './supabase'
import {requireReferenceDomain} from './clientReferenceScope'

export async function createClientSalesOrder(domainId:string, input:Record<string,any>, isCurrent:()=>boolean) {
  const domain=requireReferenceDomain(domainId)
  for (const [table,id] of [['clients',input.client_id],['markets',input.market_id],['campaigns',input.campaign_id]]) {
    if (!isCurrent()) throw new Error('Le client sélectionné a changé. Recommencez la saisie.')
    if (!id && table==='clients') throw new Error('Sélectionnez un client commercial.')
    if (!id) continue
    const result=await supabase.from(table).select('id').eq('domain_id',domain).eq('id',id).maybeSingle()
    if (result.error) throw result.error
    if (!result.data) throw new Error('Une référence de la commande ne correspond pas au client sélectionné.')
  }
  if (!isCurrent()) throw new Error('Le client sélectionné a changé. Recommencez la saisie.')
  const {data,error}=await supabase.from('sales_orders').insert({...input,domain_id:domain})
    .select('*, clients!sales_orders_client_id_fkey(name), markets!sales_orders_market_id_fkey(name)').single()
  if(error)throw error
  return data
}
