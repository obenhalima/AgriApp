export type PurchaseSubstitution = {
 id:string; domain_id:string; po_id:string; line_id:string; warehouse_id:string;
 original_stock_item_id:string; replacement_stock_item_id:string; positive_entry_id:string;
 ordered_qty:number; delivered_qty:number; unit_price:number; reason:string;
 status:'en_attente'|'approuve'|'rejete'|'receptionne'|'annule'; requested_by:string; requested_at:string;
 reviewed_by:string|null; reviewed_at:string|null; review_reason:string|null; receipt_id:string|null;
 snapshot:{ordered:{unit:string;unit_price:number;currency:string};replacement:{name:string;unit:string};target:string;use?:{dose_min?:number;dose_max?:number;dose_unit?:string;phi_days?:number;rei_hours?:number}}
}
export function substitutionNumber(value:string):number {
 const clean=value.replace(/[\s\u00a0\u202f]/g,'').replace(',','.')
 return /^\d+(\.\d+)?$/.test(clean)?Number(clean):NaN
}
export function validateSubstitutionAmounts(ordered:string,delivered:string,price:string,reason:string,remaining:number) {
 const q=substitutionNumber(ordered),d=substitutionNumber(delivered),p=substitutionNumber(price)
 if(!Number.isFinite(q)||q<=0||q>remaining)return 'La quantité du bon remplacée doit être positive et ne pas dépasser le restant.'
 if(Math.abs(q*100-Math.round(q*100))>1e-7)return 'La quantité du bon remplacée accepte deux décimales maximum.'
 if(!Number.isFinite(d)||d<=0||Math.abs(d*100-Math.round(d*100))>1e-7)return 'La quantité réellement livrée doit être positive, avec deux décimales maximum.'
 if(!Number.isFinite(p)||p<0)return 'Renseignez un prix unitaire valide, dans la devise du bon.'
 if(reason.trim().length<5)return 'Le motif doit contenir au moins 5 caractères.'
 return null
}
