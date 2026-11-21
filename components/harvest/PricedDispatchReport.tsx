'use client'

import { FilterableTable } from '@/components/ui/FilterableTable'
import {useLanguage, TranslatedText} from '@/lib/i18n'

import { useEffect, useMemo, useState } from 'react'
import {dispatchTrayTypes} from '@/lib/dispatchTrayTypes'
import { readHarvestRevenue } from '@/lib/harvestRevenueApi'
import { linkedDispatchInvoices } from '@/lib/dispatchInvoices'
import { createWorkbook, downloadWorkbook } from '@/lib/exportExcel'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const plantingSelect = 'id,campaign_id,campaigns(name),greenhouse_id,greenhouses(code,farm_id,farms(name)),variety_id,varieties!campaign_plantings_variety_id_fkey(commercial_name)'
const invoiceSelect = 'invoices!invoice_id(id,invoice_number,invoice_type,currency,total_amount,paid_amount,status,due_date)'
export function PricedDispatchReport({ domainId }: { domainId: string }) {
 const {t:_ui,text:_uiNode}=useLanguage()

  const [data, setData] = useState<any>(null), [error, setError] = useState(''), [reload, setReload] = useState(0), [exporting, setExporting] = useState(false)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [detail, setDetail] = useState<string | null>(null)
  useEffect(() => {
    let stale = false
    setData(null); setError(''); setDetail(null)
    readHarvestRevenue(domainId, {plantingSelect,includeTrays:true,
      marketSelect: 'name,type,currency,client_id,clients!client_id(name,type)',
      lotExtras: `lot_number,station_ref,market_id,variety_id,varieties!harvest_lots_variety_id_fkey(commercial_name),${invoiceSelect}`,
      settlementExtras: `id,code,${invoiceSelect}`,
    }).then(result => { if (!stale) setData(result) }).catch(e => { if (!stale) setError(e.message) })
    return () => { stale = true }
  }, [domainId, reload])
  const rows = useMemo(() => (data?.entries || []).map((entry: any) => {
    const lot = entry.lot, market = lot.markets
    const destination = market?.type === 'local' ? 'Local' : market?.clients?.type === 'station' || market?.type === 'export' ? 'Station / export' : 'Non renseignée'
    return {...lot, ...entry.pricing, ...entry, harvest_date: entry.recognition_date,
      tray_types: dispatchTrayTypes(lot,data.sources,data.trayLines||[]),
      plantings: entry.planting ? [entry.planting] : [],
      variety_id: entry.planting?.variety_id, varieties: entry.planting?.varieties,
      sources: data.sources.filter((source: any) => source.harvest_lot_id === lot.id),
      destination, currency: market?.currency || 'Non renseignée'}
  }).sort((a: any, b: any) => (b.harvest_date || '').localeCompare(a.harvest_date || '')), [data])
  const dimensions: Record<string, (r: any) => [string, string][]> = {
    tray: r => r.tray_types.map((type:any)=>[type.code,type.label]),
    campaign: r => r.plantings.map((p: any) => [p.campaign_id, p.campaigns?.name || p.campaign_id]),
    farm: r => r.plantings.map((p: any) => [p.greenhouses?.farm_id, p.greenhouses?.farms?.name]),
    greenhouse: r => r.plantings.map((p: any) => [p.greenhouse_id, p.greenhouses?.code]),
    variety: r => [[r.variety_id, r.varieties?.commercial_name], ...r.plantings.map((p: any) => [p.variety_id, p.varieties?.commercial_name])],
    client: r => [[r.markets?.client_id, r.markets?.clients?.name]],
    destination: r => [[r.destination, r.destination]],
  }
  const filtered = rows.filter((r: any) => (!filters.from || r.harvest_date && r.harvest_date >= filters.from) && (!filters.to || r.harvest_date && r.harvest_date <= filters.to) && Object.entries(dimensions).every(([key, get]) => !filters[key] || get(r).some(([id]) => id === filters[key])))
  const totals = new Map<string, { qty: number; amount: number; undated: number }>()
  const invoices = linkedDispatchInvoices(filtered)
  for (const r of filtered) { const t = totals.get(r.currency) || { qty: 0, amount: 0, undated: 0 }; if (r.harvest_date) {t.qty += r.qty; t.amount += r.amount} else t.undated += r.amount; totals.set(r.currency, t) }
  const set = (key: string, value: string) => setFilters(f => ({ ...f, [key]: value }))
  const labels: Record<string, string> = { tray: 'Types de plateau', campaign: 'Campagne', farm: 'Ferme', greenhouse: 'Serre', variety: 'Variété', client: 'Client', destination: 'Destination' }
  const exportRows = async () => {
    setExporting(true)
    try {
      const wb = await createWorkbook(), sheet = wb.addWorksheet('Envois tarifés')
      sheet.addRow(['Date récolte / CA', 'Date envoi', 'Récolte source', 'Types de plateau', 'Lot', 'Destination', 'Marché', 'Client', 'Variété', 'Kg tarifés', 'Prix moyen/kg', 'CA réalisé', 'Devise', 'État'])
      for (const r of filtered) sheet.addRow([r.harvest_date || 'À compléter', r.dispatch_date, r.harvest?.lot_number || '', r.tray_types.map((type:any)=>type.label).join(' · '), r.lot_number, r.destination, r.markets?.name || '', r.markets?.clients?.name || '', r.varieties?.commercial_name || '', r.qty, r.price, r.amount, r.currency, r.issue ? 'Récolte à compléter' : r.partial ? 'Tarifé partiellement' : 'Tarifé'])
      sheet.addRow([])
      for (const [currency, t] of totals) sheet.addRow(['TOTAL DATÉ', '', '', '', '', '', '', '', '', t.qty, t.qty ? t.amount / t.qty : 0, t.amount, currency])
      for (const [currency, t] of totals) if(t.undated>0) sheet.addRow(['CA À DATER', '', '', '', '', '', '', '', '', '', '', t.undated, currency, 'Exclu des totaux datés'])
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
    <div className="itrix-toolbar"><div><h2 className="text-xl font-bold">{_ui("Récapitulatif des envois tarifés")}</h2><p className="text-sm text-fg-secondary">{_ui("Tout l’historique · CA tarifé à la date de récolte, pas encaissements.")}</p></div><div className="itrix-actions"><Button variant="secondary" onClick={() => setReload(x => x + 1)}>{_ui("Actualiser")}</Button><Button disabled={!filtered.length || exporting} onClick={exportRows}>{_ui("Exporter Excel")}</Button></div></div>
    <Card className="itrix-filters">
      <label>{_ui("Du")}<Input type="date" value={filters.from || ''} onChange={e => set('from', e.target.value)}/></label><label>{_ui("Au")}<Input type="date" value={filters.to || ''} onChange={e => set('to', e.target.value)}/></label>
      {Object.entries(dimensions).map(([key, get]) => <label key={key} htmlFor={`priced-filter-${key}`}>{_uiNode(labels[key])}<Select id={`priced-filter-${key}`} aria-label={labels[key]} value={filters[key] || ''} onChange={e => set(key, e.target.value)}><option value="">{_ui("Tous")}</option>{Array.from(new Map<string, string>(rows.flatMap(get).filter(([id, name]: any) => id && name))).sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></label>)}
      <Button variant="ghost" onClick={() => setFilters({})}>{_ui("Réinitialiser")}</Button>
    </Card>
    <p className="text-sm text-fg-secondary">{_ui("Le CA de chaque envoi est réparti entre les récoltes sources au prorata des kilos contribués. Les filtres sélectionnent ces parts. Les montants sans date de récolte sont affichés à compléter et exclus du CA daté.")}</p>
    {rows.some((row:any)=>row.issue)&&<p role="alert" className="itrix-notice text-amber-700">{_ui("Des envois tarifés sont sans récolte source datée : contrôlez le récapitulatif des envois avant d’interpréter le CA.")}</p>}
    {error && <p role="alert" className="itrix-notice text-danger">{_uiNode(error)}</p>}
    {!data && !error && <p role="status">{_ui("Chargement des envois et des tarifs…")}</p>}
    {data && <><p className="font-semibold">{new Set(filtered.map((r: any) => r.dispatch_id)).size} {" "}{_ui("envoi(s) ·")} {filtered.length} {_ui("parts de récolte ·")}{" "}{fmt(filtered.reduce((s: number, r: any) => s + r.qty, 0))} {" "}{_ui("kg tarifés")}</p><div className="itrix-kpis">{Array.from(totals).map(([currency, t]) => <Card key={currency}><p>{_ui("CA réalisé ·")}{" "}{currency}</p><strong className="text-xl text-brand">{fmt(t.amount)}</strong><p>{fmt(t.qty)} {" "}{_ui("kg · Prix moyen pondéré :")}{" "}{fmt(t.qty ? t.amount / t.qty : 0)} {currency}/kg</p>{t.undated > 0 && <p role="alert" className="text-amber-700">{_ui("CA à dater :")} {fmt(t.undated)} {currency}</p>}</Card>)}</div>
    <div className="itrix-table"><FilterableTable className="w-full text-sm"><thead><tr>{['Date récolte / CA', 'Date envoi', 'Récolte source', 'Types de plateau', 'Lot', 'Destination / marché', 'Client', 'Variété', 'Kg tarifés', 'Prix moyen/kg', 'CA réalisé', 'État', 'Détail'].map(h => <th key={h} className="text-left whitespace-nowrap"><TranslatedText text={h}/></th>)}</tr></thead><tbody>{filtered.map((r: any) => <tr key={r.id}><td className="whitespace-nowrap">{r.harvest_date || <span className="text-amber-700">{_ui('À compléter')}</span>}</td><td>{r.dispatch_date || '—'}</td><td>{r.harvest?.lot_number || '—'}</td><td>{r.tray_types.map((type:any)=>type.label).join(' · ')||_ui('Non renseigné')}</td><td>{r.lot_number}</td><td>{r.destination}<br/>{r.markets?.name || '—'}</td><td>{r.markets?.clients?.name || '—'}</td><td>{r.varieties?.commercial_name || '—'}</td><td>{fmt(r.qty)}</td><td>{fmt(r.price)} {r.currency}</td><td>{fmt(r.amount)} {r.currency}</td><td>{r.issue ? _ui("Récolte à compléter") : r.partial ? _ui("Tarifé partiellement") : _ui("Tarifé")}</td><td><Button variant="ghost" onClick={() => setDetail(detail === r.id ? null : r.id)} aria-expanded={detail === r.id}>{_ui("Voir détail")}</Button></td></tr>)}</tbody></FilterableTable>{!filtered.length && <p className="p-5">{_ui("Aucun envoi tarifé avec un montant enregistré sur ce périmètre.")}</p>}</div>
    {filtered.filter((r: any) => r.id === detail).map((r: any) => <Card key={r.id}><h3 className="font-bold">{_ui("Détail ·")}{" "}{r.lot_number}</h3><p className="text-blue-700">{_ui("Part de cette récolte :")} {fmt(r.share * 100)} % · {fmt(r.amount)} {r.currency}. {_ui("Les bordereaux ci-dessous concernent l’envoi entier.")}</p><p>{_ui("Quantité acceptée de l’envoi :")}{" "}{fmt(Number(r.qty_acceptee_kg || 0))} {" "}{_ui("kg · Tarifée :")}{" "}{fmt(r.qty)} kg</p><p>{_ui("Référence Station :")}{" "}{r.station_ref || '—'}</p>{r.allocations.length ? r.allocations.map((a: any) => <p key={a.id}>{a.station_settlement_lines.station_settlements.code} · {fmt(Number(a.qty_allocated_kg))} {" "}{_ui("kg ×")}{" "}{fmt(Number(a.price_per_kg))} = {fmt(Number(a.amount_allocated))} {r.currency}</p>) : <p>{_ui("Tarification directe enregistrée sur le lot.")}</p>}{r.sources.map((s: any) => <p key={s.id}>{_ui("Récolte")}{" "}{s.harvests?.lot_number || '—'} · {fmt(Number(s.qty_contributed_kg))} {" "}{_ui("kg contribués")}</p>)}</Card>)}
    <Card><h3 className="font-bold">{_ui("Factures et encaissements liés")}</h3>
      <p className="text-sm text-fg-secondary my-2">{_ui("Factures explicitement liées aux envois sélectionnés ou à leurs bordereaux, comptées une seule fois. Les montants sont ceux de la facture entière, sans ventilation entre lots. Certains anciens bordereaux ne référencent que leur première facture : aucun reste à facturer n’est déduit de cette liste.")}</p>
      <div className="itrix-table"><FilterableTable className="w-full text-sm"><thead><tr>{['Facture', 'Devise', 'Facturé', 'Encaissé enregistré', 'Solde à recevoir', 'État'].map(t => <th key={t}><TranslatedText text={t}/></th>)}</tr></thead><tbody>{invoices.map(i => <tr key={i.id}><td>{i.invoice_number || i.id}</td><td>{i.currency || _ui("Non renseignée")}</td><td>{i.total == null ? _ui("À vérifier") : fmt(i.total)}</td><td>{i.paid == null ? _ui("À vérifier") : fmt(i.paid)}</td><td>{i.balance == null ? _ui("À vérifier") : i.balance < 0 ? _ui("Trop-perçu : {v0}",{v0:String(fmt(-i.balance))}) : fmt(i.balance)}</td><td>{i.status || '—'}</td></tr>)}</tbody></FilterableTable></div>
      {!invoices.length && <p className="py-3">{_ui("Aucune facture liée accessible. Cela ne prouve pas l’absence de facturation.")}</p>}
      <a className="text-brand underline" href="/factures">{_ui("Ouvrir les factures et encaissements")}</a>
    </Card></>}
  </section>
}
