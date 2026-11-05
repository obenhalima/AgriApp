'use client'

import { FilterableTable } from '@/components/ui/FilterableTable'
import {useLanguage} from '@/lib/i18n'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { pricedDispatch } from '@/lib/pricedDispatches'
import { linkedDispatchInvoices } from '@/lib/dispatchInvoices'
import { createWorkbook, downloadWorkbook } from '@/lib/exportExcel'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const plantingSelect = 'id,campaign_id,campaigns(name),greenhouse_id,greenhouses(code,farm_id,farms(name)),variety_id,varieties!campaign_plantings_variety_id_fkey(commercial_name)'
const invoiceSelect = 'invoices!invoice_id(id,invoice_number,invoice_type,currency,total_amount,paid_amount,status,due_date)'
async function pages(make: () => any) {
  const rows: any[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await make().order('id').range(offset, offset + 499)
    if (error) throw error
    rows.push(...data || [])
    if (!data || data.length < 500) return rows
  }
}
export function PricedDispatchReport({ domainId }: { domainId: string }) {
 const {t:_ui,text:_uiNode}=useLanguage()

  const [data, setData] = useState<any>(null), [error, setError] = useState(''), [reload, setReload] = useState(0), [exporting, setExporting] = useState(false)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [detail, setDetail] = useState<string | null>(null)
  useEffect(() => {
    let stale = false
    setData(null); setError(''); setDetail(null)
    Promise.all([
      pages(() => supabase.from('harvest_lots').select(`id,lot_number,harvest_date,tri_status,qty_priced_kg,qty_acceptee_kg,ca_amount,station_ref,market_id,markets!harvest_lots_market_id_fkey(name,type,currency,client_id,clients!client_id(name,type)),variety_id,varieties!harvest_lots_variety_id_fkey(commercial_name),campaign_plantings(${plantingSelect}),${invoiceSelect}`).eq('domain_id', domainId).eq('category', 'station_dispatch')),
      pages(() => supabase.from('station_settlement_allocations').select(`id,harvest_lot_id,qty_allocated_kg,amount_allocated,price_per_kg,harvest_lots!inner(domain_id),station_settlement_lines(station_settlements!station_settlement_lines_settlement_id_fkey(id,code,status,${invoiceSelect}))`).eq('harvest_lots.domain_id', domainId)),
      pages(() => supabase.from('harvest_lot_sources').select(`id,harvest_lot_id,qty_contributed_kg,harvests!inner(domain_id,lot_number,campaign_plantings(${plantingSelect}))`).eq('harvests.domain_id', domainId)),
    ]).then(([lots, allocations, sources]) => { if (!stale) setData({ lots, allocations, sources }) }).catch(e => { if (!stale) setError(e.message) })
    return () => { stale = true }
  }, [domainId, reload])
  const rows = useMemo(() => (data?.lots || []).flatMap((lot: any) => {
    const pricing = pricedDispatch(lot, data.allocations)
    if (!pricing) return []
    const sources = data.sources.filter((s: any) => s.harvest_lot_id === lot.id)
    const plantings = [lot.campaign_plantings, ...sources.map((s: any) => s.harvests?.campaign_plantings)].filter(Boolean)
    const market = lot.markets
    const destination = market?.type === 'local' ? 'Local' : market?.clients?.type === 'station' || market?.type === 'export' ? 'Station / export' : 'Non renseignée'
    return [{ ...lot, ...pricing, sources, plantings, destination, currency: market?.currency || 'Non renseignée' }]
  }).sort((a: any, b: any) => b.harvest_date.localeCompare(a.harvest_date)), [data])
  const dimensions: Record<string, (r: any) => [string, string][]> = {
    campaign: r => r.plantings.map((p: any) => [p.campaign_id, p.campaigns?.name || p.campaign_id]),
    farm: r => r.plantings.map((p: any) => [p.greenhouses?.farm_id, p.greenhouses?.farms?.name]),
    greenhouse: r => r.plantings.map((p: any) => [p.greenhouse_id, p.greenhouses?.code]),
    variety: r => [[r.variety_id, r.varieties?.commercial_name], ...r.plantings.map((p: any) => [p.variety_id, p.varieties?.commercial_name])],
    client: r => [[r.markets?.client_id, r.markets?.clients?.name]],
    destination: r => [[r.destination, r.destination]],
  }
  const filtered = rows.filter((r: any) => (!filters.from || r.harvest_date >= filters.from) && (!filters.to || r.harvest_date <= filters.to) && Object.entries(dimensions).every(([key, get]) => !filters[key] || get(r).some(([id]) => id === filters[key])))
  const totals = new Map<string, { qty: number; amount: number }>()
  const invoices = linkedDispatchInvoices(filtered)
  for (const r of filtered) { const t = totals.get(r.currency) || { qty: 0, amount: 0 }; t.qty += r.qty; t.amount += r.amount; totals.set(r.currency, t) }
  const set = (key: string, value: string) => setFilters(f => ({ ...f, [key]: value }))
  const labels: Record<string, string> = { campaign: 'Campagne', farm: 'Ferme', greenhouse: 'Serre', variety: 'Variété', client: 'Client', destination: 'Destination' }
  const exportRows = async () => {
    setExporting(true)
    try {
      const wb = await createWorkbook(), sheet = wb.addWorksheet('Envois tarifés')
      sheet.addRow(['Date envoi', 'Lot', 'Destination', 'Marché', 'Client', 'Variété', 'Kg tarifés', 'Prix moyen/kg', 'CA réalisé', 'Devise', 'État'])
      for (const r of filtered) sheet.addRow([r.harvest_date, r.lot_number, r.destination, r.markets?.name || '', r.markets?.clients?.name || '', r.varieties?.commercial_name || '', r.qty, r.price, r.amount, r.currency, r.partial ? 'Tarifé partiellement' : 'Tarifé'])
      sheet.addRow([])
      for (const [currency, t] of totals) sheet.addRow(['TOTAL', '', '', '', '', '', t.qty, t.amount / t.qty, t.amount, currency])
      sheet.getRow(1).font = { bold: true }; sheet.columns.forEach(c => { c.width = 22 })
      const invoiceSheet = wb.addWorksheet('Factures liées')
      invoiceSheet.addRow(['Montants entiers des factures liées, dédoublonnées. Pas une ventilation par envoi. Liste potentiellement incomplète pour les anciens bordereaux.'])
      invoiceSheet.addRow(['Facture', 'Devise', 'Facturé', 'Encaissé enregistré', 'Solde', 'Statut'])
      for (const i of invoices) invoiceSheet.addRow([i.invoice_number || i.id, i.currency || 'Non renseignée', i.total, i.paid, i.balance, i.status || ''])
      invoiceSheet.columns.forEach(c => { c.width = 24 })
      await downloadWorkbook(wb, 'ItriX-envois-tarifes.xlsx')
    } catch (e: any) { setError('Export impossible : ' + e.message) } finally { setExporting(false) }
  }
  return <section className="space-y-4" aria-label={_ui("Récapitulatif des envois tarifés")}>
    <div className="itrix-toolbar"><div><h2 className="text-xl font-bold">{_ui("Récapitulatif des envois tarifés")}</h2><p className="text-sm text-fg-secondary">{_ui("Tout l’historique · Date du lot d’envoi · CA tarifé, pas encaissements.")}</p></div><div className="itrix-actions"><Button variant="secondary" onClick={() => setReload(x => x + 1)}>{_ui("Actualiser")}</Button><Button disabled={!filtered.length || exporting} onClick={exportRows}>{_ui("Exporter Excel")}</Button></div></div>
    <Card className="itrix-filters">
      <label>{_ui("Du")}<Input type="date" value={filters.from || ''} onChange={e => set('from', e.target.value)}/></label><label>{_ui("Au")}<Input type="date" value={filters.to || ''} onChange={e => set('to', e.target.value)}/></label>
      {Object.entries(dimensions).map(([key, get]) => <label key={key} htmlFor={`priced-filter-${key}`}>{_uiNode(labels[key])}<Select id={`priced-filter-${key}`} aria-label={labels[key]} value={filters[key] || ''} onChange={e => set(key, e.target.value)}><option value="">{_ui("Tous")}</option>{Array.from(new Map<string, string>(rows.flatMap(get).filter(([id, name]: any) => id && name))).sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></label>)}
      <Button variant="ghost" onClick={() => setFilters({})}>{_ui("Réinitialiser")}</Button>
    </Card>
    <p className="text-sm text-fg-secondary">{_ui("Filtres propres à ce récapitulatif. Les filtres de production retrouvent les lots contenant la sélection : les montants restent ceux du lot entier, sans ventilation entre serres. Les marchés export sont regroupés sous « Station / export ».")}</p>
    {error && <p role="alert" className="itrix-notice text-danger">{_uiNode(error)}</p>}
    {!data && !error && <p role="status">{_ui("Chargement des envois et des tarifs…")}</p>}
    {data && <><p className="font-semibold">{filtered.length} {" "}{_ui("envoi(s) ·")}{" "}{fmt(filtered.reduce((s: number, r: any) => s + r.qty, 0))} {" "}{_ui("kg tarifés")}</p><div className="itrix-kpis">{Array.from(totals).map(([currency, t]) => <Card key={currency}><p>{_ui("CA réalisé ·")}{" "}{currency}</p><strong className="text-xl text-brand">{fmt(t.amount)}</strong><p>{fmt(t.qty)} {" "}{_ui("kg · Prix moyen pondéré :")}{" "}{fmt(t.amount / t.qty)} {currency}/kg</p></Card>)}</div>
    <div className="itrix-table"><FilterableTable className="w-full text-sm"><thead><tr>{['Date envoi', 'Lot', 'Destination / marché', 'Client', 'Variété', 'Kg tarifés', 'Prix moyen/kg', 'CA réalisé', 'État', 'Détail'].map(h => <th key={h} className="text-left whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{filtered.map((r: any) => <tr key={r.id}><td className="whitespace-nowrap">{r.harvest_date}</td><td>{r.lot_number}</td><td>{r.destination}<br/>{r.markets?.name || '—'}</td><td>{r.markets?.clients?.name || '—'}</td><td>{r.varieties?.commercial_name || '—'}</td><td>{fmt(r.qty)}</td><td>{fmt(r.price)} {r.currency}</td><td>{fmt(r.amount)} {r.currency}</td><td>{r.partial ? _ui("Tarifé partiellement") : _ui("Tarifé")}</td><td><Button variant="ghost" onClick={() => setDetail(detail === r.id ? null : r.id)} aria-expanded={detail === r.id}>{_ui("Voir détail")}</Button></td></tr>)}</tbody></FilterableTable>{!filtered.length && <p className="p-5">{_ui("Aucun envoi tarifé avec un montant enregistré sur ce périmètre.")}</p>}</div>
    {filtered.filter((r: any) => r.id === detail).map((r: any) => <Card key={r.id}><h3 className="font-bold">{_ui("Détail ·")}{" "}{r.lot_number}</h3><p>{_ui("Quantité acceptée :")}{" "}{fmt(Number(r.qty_acceptee_kg || 0))} {" "}{_ui("kg · Tarifée :")}{" "}{fmt(r.qty)} kg</p><p>{_ui("Référence Station :")}{" "}{r.station_ref || '—'}</p>{r.allocations.length ? r.allocations.map((a: any) => <p key={a.id}>{a.station_settlement_lines.station_settlements.code} · {fmt(Number(a.qty_allocated_kg))} {" "}{_ui("kg ×")}{" "}{fmt(Number(a.price_per_kg))} = {fmt(Number(a.amount_allocated))} {r.currency}</p>) : <p>{_ui("Tarification directe enregistrée sur le lot.")}</p>}{r.sources.map((s: any) => <p key={s.id}>{_ui("Récolte")}{" "}{s.harvests?.lot_number || '—'} · {fmt(Number(s.qty_contributed_kg))} {" "}{_ui("kg contribués")}</p>)}</Card>)}
    <Card><h3 className="font-bold">{_ui("Factures et encaissements liés")}</h3>
      <p className="text-sm text-fg-secondary my-2">{_ui("Factures explicitement liées aux envois sélectionnés ou à leurs bordereaux, comptées une seule fois. Les montants sont ceux de la facture entière, sans ventilation entre lots. Certains anciens bordereaux ne référencent que leur première facture : aucun reste à facturer n’est déduit de cette liste.")}</p>
      <div className="itrix-table"><FilterableTable className="w-full text-sm"><thead><tr>{['Facture', 'Devise', 'Facturé', 'Encaissé enregistré', 'Solde à recevoir', 'État'].map(t => <th key={t}>{t}</th>)}</tr></thead><tbody>{invoices.map(i => <tr key={i.id}><td>{i.invoice_number || i.id}</td><td>{i.currency || _ui("Non renseignée")}</td><td>{i.total == null ? _ui("À vérifier") : fmt(i.total)}</td><td>{i.paid == null ? _ui("À vérifier") : fmt(i.paid)}</td><td>{i.balance == null ? _ui("À vérifier") : i.balance < 0 ? _ui("Trop-perçu : {v0}",{v0:String(fmt(-i.balance))}) : fmt(i.balance)}</td><td>{i.status || '—'}</td></tr>)}</tbody></FilterableTable></div>
      {!invoices.length && <p className="py-3">{_ui("Aucune facture liée accessible. Cela ne prouve pas l’absence de facturation.")}</p>}
      <a className="text-brand underline" href="/factures">{_ui("Ouvrir les factures et encaissements")}</a>
    </Card></>}
  </section>
}
