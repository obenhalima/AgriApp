'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Package, Plus, Trash2, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  PurchaseOrder, PurchaseOrderLine,
  getPurchaseOrderLines, addPurchaseOrderLine, updatePurchaseOrderLine, deletePurchaseOrderLine,
  receivePurchaseOrder,
} from '@/lib/purchase'
import { StockItemCreateModal } from '@/components/stock/StockItemCreateModal'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect, Textarea, Field } from '@/components/ui/Input'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'
import { MoneyDisplay } from '@/components/display'
import { useAuth } from '@/lib/auth'

type StockItem = { id: string; code: string; name: string; unit: string | null }
type NewLine = { itemDescription: string; unit: string; quantity: string; unitPrice: string; stockItemId: string }
const EMPTY_NEW_LINE: NewLine = { itemDescription: '', unit: '', quantity: '', unitPrice: '', stockItemId: '' }

export default function PurchaseOrderDetailPage() {
  const { activeDomain } = useAuth()
  const params = useParams<{ id: string }>()
  const poId = params?.id as string

  const [po, setPo] = useState<(PurchaseOrder & { suppliers?: any; campaigns?: any; greenhouses?: any }) | null>(null)
  const [lines, setLines] = useState<PurchaseOrderLine[]>([])
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [newLine, setNewLine] = useState<NewLine>({ ...EMPTY_NEW_LINE })
  const [savingLine, setSavingLine] = useState(false)

  const [stockModalTarget, setStockModalTarget] = useState<null | { kind: 'new' } | { kind: 'existing'; lineId: string }>(null)

  const [receiving, setReceiving] = useState(false)
  const [receptionQtys, setReceptionQtys] = useState<Record<string, string>>({})
  const [receptionDate, setReceptionDate] = useState(new Date().toISOString().slice(0, 10))
  const [receptionNotes, setReceptionNotes] = useState('')
  const [receptionRef, setReceptionRef] = useState('')

  const load = async () => {
    if (!activeDomain) { setPo(null); setLines([]); setStockItems([]); setLoading(false); return }
    try {
      setLoading(true)
      const [p, l, s] = await Promise.all([
        supabase.from('purchase_orders').select('*, suppliers(name,category), campaigns(name), greenhouses(code,name)').eq('domain_id', activeDomain.domain_id).eq('id', poId).maybeSingle(),
        getPurchaseOrderLines(poId, activeDomain.domain_id),
        supabase.from('stock_items').select('id,code,name,unit').eq('domain_id', activeDomain.domain_id).eq('is_active', true).order('name'),
      ])
      if (p.error) throw p.error
      setPo(p.data as any)
      setLines(l)
      setStockItems((s.data ?? []) as StockItem[])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { if (poId) load() }, [poId, activeDomain?.domain_id])

  const editable = po?.status === 'brouillon'
  const canReceive = po?.status === 'envoye' || po?.status === 'partiellement_recu'
  // Une facture peut être générée dès qu'on a au moins partiellement reçu
  const canInvoice = po?.status === 'recu' || po?.status === 'partiellement_recu' || po?.status === 'facture' || po?.status === 'paye'

  const stockById = useMemo(() => Object.fromEntries(stockItems.map(s => [s.id, s])), [stockItems])
  const totalOrdered = useMemo(() => lines.reduce((s, l) => s + Number(l.quantity || 0), 0), [lines])
  const totalReceived = useMemo(() => lines.reduce((s, l) => s + Number(l.received_qty || 0), 0), [lines])
  const totalAmount = useMemo(() => lines.reduce((s, l) => s + Number(l.line_total || 0), 0), [lines])

  const selectNewStockItem = (stockId: string) => {
    const it = stockItems.find(x => x.id === stockId)
    setNewLine(n => ({ ...n, stockItemId: stockId, itemDescription: it ? it.name : n.itemDescription, unit: it?.unit ?? n.unit }))
  }

  const submitNewLine = async () => {
    if (!newLine.stockItemId) { toast.error('Sélectionne ou crée un article de stock'); return }
    if (!newLine.quantity || Number(newLine.quantity) <= 0) { toast.error('Quantité > 0 requise'); return }
    setSavingLine(true)
    try {
      const created = await addPurchaseOrderLine(poId, {
        itemDescription: newLine.itemDescription || (stockById[newLine.stockItemId]?.name ?? ''),
        unit: newLine.unit || undefined, quantity: Number(newLine.quantity),
        unitPrice: Number(newLine.unitPrice || 0), stockItemId: newLine.stockItemId,
      })
      setLines(prev => [...prev, created])
      setNewLine({ ...EMPTY_NEW_LINE })
      const { data: p } = await supabase.from('purchase_orders').select('*, suppliers(name,category), campaigns(name), greenhouses(code,name)').eq('domain_id', activeDomain!.domain_id).eq('id', poId).maybeSingle()
      if (p) setPo(p as any)
      toast.success('Ligne ajoutée')
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
    finally { setSavingLine(false) }
  }

  const handleStockCreated = async (item: { id: string; name: string; unit: string; category: string; code: string }) => {
    if (!activeDomain) return
    const { data } = await supabase.from('stock_items').select('id,code,name,unit').eq('domain_id', activeDomain.domain_id).eq('is_active', true).order('name')
    setStockItems((data ?? []) as StockItem[])
    if (stockModalTarget?.kind === 'new') {
      setNewLine(n => ({ ...n, stockItemId: item.id, itemDescription: n.itemDescription || item.name, unit: n.unit || item.unit }))
    } else if (stockModalTarget?.kind === 'existing') {
      await changeLine({ ...(lines.find(l => l.id === stockModalTarget.lineId) as PurchaseOrderLine) }, { stockItemId: item.id })
    }
    setStockModalTarget(null)
  }

  const changeLine = async (line: PurchaseOrderLine, patch: Partial<{ itemDescription: string; unit: string; quantity: number; unitPrice: number; stockItemId: string | null }>) => {
    try {
      const updated = await updatePurchaseOrderLine(line.id, patch)
      setLines(prev => prev.map(l => l.id === line.id ? updated : l))
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
  }

  const removeLine = async (line: PurchaseOrderLine) => {
    if (!confirm(`Supprimer la ligne "${line.item_description}" ?`)) return
    try {
      await deletePurchaseOrderLine(line.id)
      setLines(prev => prev.filter(l => l.id !== line.id))
      toast.success('Ligne supprimée')
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
  }

  const openReception = () => {
    setReceiving(true)
    const qtys: Record<string, string> = {}
    lines.forEach(l => {
      const remaining = Number(l.quantity || 0) - Number(l.received_qty || 0)
      qtys[l.id] = remaining > 0 ? String(remaining) : ''
    })
    setReceptionQtys(qtys)
  }
  const closeReception = () => { setReceiving(false); setReceptionQtys({}); setReceptionNotes(''); setReceptionRef('') }

  const submitReception = async () => {
    const linesInput = Object.entries(receptionQtys)
      .map(([lineId, qty]) => ({ lineId, qtyReceived: Number(qty) }))
      .filter(l => Number.isFinite(l.qtyReceived) && l.qtyReceived > 0)
    if (linesInput.length === 0) { toast.error('Aucune quantité à réceptionner'); return }
    try {
      const res = await receivePurchaseOrder({ poId, receptionDate, reference: receptionRef || undefined, notes: receptionNotes || undefined, lines: linesInput })
      toast.success(`Réception OK · état ${res.new_status} · ${res.movements_created} mvts stock${res.warnings?.length ? ` ⚠ ${res.warnings.length} alerte(s)` : ''}`)
      closeReception()
      await load()
    } catch (e: any) { toast.error('Erreur réception : ' + e.message) }
  }

  if (loading) {
    return (
      <div className="space-y-md">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (error) {
    return <div className="rounded-md border border-danger/30 bg-danger/10 p-md text-danger flex items-center gap-2"><AlertCircle size={14} /> {error}</div>
  }
  if (!po) return <div className="p-xl text-center text-fg-tertiary">Bon d'achat introuvable.</div>

  return (
    <div>
      <Link href="/achats" className="inline-flex items-center gap-1 text-caption text-fg-tertiary hover:text-fg-primary mb-2 transition-colors">
        <ArrowLeft size={12} /> Retour aux bons d'achat
      </Link>

      <PageHeader
        title={po.po_number} subtitle="Détail bon d'achat" icon={Package} iconColor="#eab308"
        description={
          <span className="flex items-center gap-2 flex-wrap">
            <strong>{(po as any).suppliers?.name ?? '—'}</strong>
            <span className="opacity-50">·</span>
            <span>{po.cost_category ?? '—'}</span>
            <span className="opacity-50">·</span>
            <span>{po.order_date}</span>
            <StatusBadge status={po.status} size="sm" />
          </span>
        }
        actions={canReceive ? (
          <Button onClick={openReception} variant="primary"><Package size={14} strokeWidth={2.5} /> Réceptionner</Button>
        ) : undefined}
        stats={[
          { label: 'Lignes', value: String(lines.length), icon: Package, color: '#10b981' },
          { label: 'Commandé', value: totalOrdered.toLocaleString('fr'), icon: Package, color: '#3b82f6' },
          { label: 'Reçu', value: totalReceived.toLocaleString('fr'), icon: Package, color: '#f59e0b' },
          { label: 'Montant', value: <MoneyDisplay value={totalAmount} compact="auto" showCurrency={false} className="!text-current" />, icon: Package, color: '#a855f7' },
        ]}
      />

      {/* Ajout ligne */}
      {editable && (
        <Card animate delay={0.15} className="mb-md">
          <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary mb-md">
            Ajouter une ligne
          </div>
          <div className="grid grid-cols-[2fr_0.6fr_0.7fr_0.8fr_auto] gap-sm items-end">
            <div>
              <div className="flex justify-between mb-1">
                <span className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary">Article stock *</span>
                <button onClick={() => setStockModalTarget({ kind: 'new' })} className="text-caption text-brand hover:underline">+ nouveau</button>
              </div>
              <TSelect value={newLine.stockItemId} onChange={(e) => selectNewStockItem(e.target.value)}>
                <option value="">— sélectionner —</option>
                {stockItems.map(si => <option key={si.id} value={si.id}>{si.name} ({si.unit})</option>)}
              </TSelect>
            </div>
            <Field label="Unité"><TInput value={newLine.unit} readOnly className="bg-surface-sunk text-fg-tertiary" /></Field>
            <Field label="Qté *"><TInput type="number" value={newLine.quantity} onChange={(e) => setNewLine({ ...newLine, quantity: e.target.value })} /></Field>
            <Field label="Prix unit."><TInput type="number" value={newLine.unitPrice} onChange={(e) => setNewLine({ ...newLine, unitPrice: e.target.value })} /></Field>
            <Button onClick={submitNewLine} loading={savingLine} disabled={!newLine.stockItemId || !newLine.quantity} variant="primary">
              <Plus size={14} strokeWidth={2.5} /> Ajouter
            </Button>
          </div>
        </Card>
      )}

      <StockItemCreateModal
        open={stockModalTarget !== null} onClose={() => setStockModalTarget(null)} onCreated={handleStockCreated}
        initialName={stockModalTarget?.kind === 'new' ? newLine.itemDescription : ''}
        initialUnit={stockModalTarget?.kind === 'new' ? newLine.unit : ''}
      />

      {/* Lignes table */}
      <Card animate delay={0.25} padding="none" className="overflow-hidden">
        <DataTable minWidth={1100}>
          <THead>
            <TR><TH>Libellé</TH><TH>Article stock</TH><TH>Unité</TH><TH right>Commandé</TH><TH right>Reçu</TH><TH right>Prix unit.</TH><TH right>Total</TH>{editable && <TH right>Actions</TH>}</TR>
          </THead>
          <tbody>
            {lines.length === 0 ? (
              <TR><TD className="text-center text-fg-tertiary py-xl" colSpan={editable ? 8 : 7}>Aucune ligne — ajoute-en ci-dessus.</TD></TR>
            ) : lines.map((l, i) => (
              <TR key={l.id} animate delay={0.05 + i * 0.02}>
                <TD>
                  {editable ? (
                    <input
                      defaultValue={l.item_description}
                      onBlur={(e) => e.target.value !== l.item_description && changeLine(l, { itemDescription: e.target.value })}
                      className="w-full bg-transparent border-none outline-none text-body-sm focus:bg-surface-hover px-1"
                    />
                  ) : <strong className="text-fg-primary">{l.item_description}</strong>}
                </TD>
                <TD className="text-caption">{l.stock_item_id ? (stockById[l.stock_item_id]?.name ?? '—') : <span className="text-fg-tertiary italic">libre</span>}</TD>
                <TD mono className="text-caption text-fg-tertiary">{l.unit ?? '—'}</TD>
                <TD right mono className="text-info">{Number(l.quantity).toLocaleString('fr')}</TD>
                <TD right mono className={Number(l.received_qty) >= Number(l.quantity) ? 'text-success font-bold' : 'text-warning'}>
                  {Number(l.received_qty || 0).toLocaleString('fr')}
                </TD>
                <TD right mono className="text-caption">{Number(l.unit_price || 0).toLocaleString('fr')}</TD>
                <TD right mono className="text-brand font-bold"><MoneyDisplay value={Number(l.line_total || 0)} compact="auto" showCurrency={false} /></TD>
                {editable && (
                  <TD right>
                    <Button onClick={() => removeLine(l)} variant="ghost" size="icon-sm" className="hover:text-danger"><Trash2 size={12} strokeWidth={2.2} /></Button>
                  </TD>
                )}
              </TR>
            ))}
          </tbody>
        </DataTable>
      </Card>

      {!editable && (
        <Card variant="ghost" className="mt-md text-caption text-fg-tertiary">
          Les lignes sont en lecture seule : le bon n'est plus en brouillon.
        </Card>
      )}

      {/* Modal réception */}
      {receiving && (
        <Modal title={`RÉCEPTIONNER — ${po.po_number}`} onClose={closeReception} size="lg">
          <div className="space-y-md">
            <div className="grid grid-cols-2 gap-md">
              <Field label="Date *"><TInput type="date" value={receptionDate} onChange={(e) => setReceptionDate(e.target.value)} /></Field>
              <Field label="Référence (BL...)"><TInput value={receptionRef} onChange={(e) => setReceptionRef(e.target.value)} /></Field>
            </div>
            <DataTable>
              <THead>
                <TR><TH>Libellé</TH><TH right>Commandé</TH><TH right>Déjà reçu</TH><TH right>Restant</TH><TH right>Qté reçue maintenant</TH></TR>
              </THead>
              <tbody>
                {lines.map(l => {
                  const remaining = Number(l.quantity || 0) - Number(l.received_qty || 0)
                  return (
                    <TR key={l.id}>
                      <TD>
                        <strong className="text-fg-primary">{l.item_description}</strong>
                        {l.stock_item_id && <Badge variant="info" size="xs" className="ml-2">↔ stock</Badge>}
                      </TD>
                      <TD right mono className="text-info">{Number(l.quantity).toLocaleString('fr')} {l.unit ?? ''}</TD>
                      <TD right mono className="text-warning">{Number(l.received_qty || 0).toLocaleString('fr')}</TD>
                      <TD right mono className={remaining > 0 ? 'text-success font-bold' : 'text-fg-tertiary'}>{remaining.toLocaleString('fr')}</TD>
                      <TD right>
                        <TInput type="number" value={receptionQtys[l.id] ?? ''} onChange={(e) => setReceptionQtys({ ...receptionQtys, [l.id]: e.target.value })} className="w-24 ml-auto" />
                      </TD>
                    </TR>
                  )
                })}
              </tbody>
            </DataTable>
            <Field label="Notes"><Textarea rows={2} value={receptionNotes} onChange={(e) => setReceptionNotes(e.target.value)} /></Field>
            <ModalFooter onCancel={closeReception} onSave={submitReception} saveLabel="VALIDER LA RÉCEPTION" />
          </div>
        </Modal>
      )}
    </div>
  )
}
