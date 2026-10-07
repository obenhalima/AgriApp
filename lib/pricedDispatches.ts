export function pricedDispatch(lot: any, allocations: any[]) {
  const linked = allocations.filter(a => a.harvest_lot_id === lot.id)
  const valid = linked.filter(a => a.station_settlement_lines?.station_settlements?.status === 'valide')
  // Allocations are authoritative: never add the mirrored lot CA a second time.
  const qty = linked.length ? valid.reduce((s, a) => s + Number(a.qty_allocated_kg), 0)
    : Number(lot.qty_priced_kg) > 0 ? Number(lot.qty_priced_kg)
    : lot.tri_status === 'priced' ? Number(lot.qty_acceptee_kg || 0) : 0
  const amount = linked.length ? valid.reduce((s, a) => s + Number(a.amount_allocated), 0)
    : lot.ca_amount == null ? null : Number(lot.ca_amount)
  if (!(qty > 0) || !Number.isFinite(qty) || amount == null || !Number.isFinite(amount) || amount < 0) return null
  return { qty, amount, price: amount / qty, partial: qty + 0.01 < Number(lot.qty_acceptee_kg || 0), allocations: valid }
}
