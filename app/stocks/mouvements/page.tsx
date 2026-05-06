'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, BarChart3, ArrowUpCircle, ArrowDownCircle, Settings2, ArrowLeftRight, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect, Field } from '@/components/ui/Input'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'
import { DateDisplay } from '@/components/display'

type Movement = {
  id: string
  stock_item_id: string
  movement_type: 'entree' | 'sortie' | 'ajustement' | 'transfert'
  quantity: number
  movement_date: string
  reference: string | null
  notes: string | null
  po_id: string | null
  created_at: string
  stock_items?: { code: string; name: string; unit: string | null; category: string }
  purchase_orders?: { po_number: string }
}
type Item = { id: string; code: string; name: string; category: string; unit: string | null }

const TYPE_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  entree: 'success', sortie: 'danger', ajustement: 'warning', transfert: 'info',
}
const TYPE_LABELS: Record<string, string> = { entree: 'Entrée', sortie: 'Sortie', ajustement: 'Ajustement', transfert: 'Transfert' }
const TYPE_ICONS: Record<string, any> = { entree: ArrowUpCircle, sortie: ArrowDownCircle, ajustement: Settings2, transfert: ArrowLeftRight }

const CATEGORIES = [
  { v: '', l: 'Toutes' },
  { v: 'semences', l: 'Semences' },
  { v: 'plants', l: 'Plants' },
  { v: 'engrais', l: 'Engrais' },
  { v: 'phytosanitaires', l: 'Phytosanitaires' },
  { v: 'emballages', l: 'Emballages' },
  { v: 'consommables', l: 'Consommables' },
  { v: 'pieces_rechange', l: 'Pièces de rechange' },
  { v: 'autre', l: 'Autre' },
]

export default function MouvementsStockPage() {
  const [movements, setMovements] = useState<Movement[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [stockItemId, setStockItemId] = useState('')
  const [category, setCategory] = useState('')
  const [movementType, setMovementType] = useState<string>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [reference, setReference] = useState('')

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('stock_items').select('id, code, name, category, unit').eq('is_active', true).order('name')
      setItems((data ?? []) as Item[])
    })()
  }, [])

  const fetchMovements = async () => {
    setLoading(true); setError('')
    try {
      let q = supabase.from('stock_movements')
        .select('*, stock_items(code,name,unit,category), purchase_orders(po_number)')
        .order('movement_date', { ascending: false }).order('created_at', { ascending: false }).limit(500)
      if (stockItemId) q = q.eq('stock_item_id', stockItemId)
      if (movementType) q = q.eq('movement_type', movementType)
      if (dateFrom) q = q.gte('movement_date', dateFrom)
      if (dateTo) q = q.lte('movement_date', dateTo)
      if (reference) q = q.ilike('reference', `%${reference}%`)
      const { data, error } = await q
      if (error) throw error
      let list = (data ?? []) as Movement[]
      if (category) list = list.filter(m => m.stock_items?.category === category)
      setMovements(list)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { fetchMovements() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const resetFilters = () => { setStockItemId(''); setCategory(''); setMovementType(''); setDateFrom(''); setDateTo(''); setReference('') }

  const totals = useMemo(() => {
    const byType: Record<string, { count: number; qty: number }> = {}
    movements.forEach(m => {
      const t = m.movement_type
      byType[t] = byType[t] || { count: 0, qty: 0 }
      byType[t].count++; byType[t].qty += Number(m.quantity || 0)
    })
    return byType
  }, [movements])

  return (
    <div>
      <Link href="/stocks" className="inline-flex items-center gap-1 text-caption text-fg-tertiary hover:text-fg-primary mb-2 transition-colors">
        <ArrowLeft size={12} /> Retour aux stocks
      </Link>

      <PageHeader
        title="Mouvements de stock" subtitle="Inventaire" icon={BarChart3} iconColor="#14b8a6"
        description={`${movements.length} mouvement${movements.length > 1 ? 's' : ''} · limite 500`}
      />

      {/* KPI types */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-md mb-md">
        {(['entree', 'sortie', 'ajustement', 'transfert'] as const).map(t => {
          const Icon = TYPE_ICONS[t]
          const tot = totals[t] ?? { count: 0, qty: 0 }
          const colors: Record<string, string> = { entree: '#10b981', sortie: '#ef4444', ajustement: '#f59e0b', transfert: '#3b82f6' }
          return (
            <Card key={t} animate padding="md" className="border-l-[3px]" style={{ borderLeftColor: colors[t] } as any}>
              <div className="flex items-center gap-sm mb-1">
                <Icon size={14} strokeWidth={2.2} style={{ color: colors[t] }} />
                <span className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary font-semibold">{TYPE_LABELS[t]}</span>
              </div>
              <div className="font-display text-display-sm font-extrabold" style={{ color: colors[t] }}>{tot.count}</div>
              <div className="font-mono text-caption text-fg-tertiary mt-1">{tot.qty.toLocaleString('fr')} unités</div>
            </Card>
          )
        })}
      </div>

      {/* Filtres */}
      <Card animate delay={0.15} className="mb-md">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-md">
          <Field label="Article">
            <TSelect value={stockItemId} onChange={(e) => setStockItemId(e.target.value)}>
              <option value="">Tous les articles</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </TSelect>
          </Field>
          <Field label="Catégorie">
            <TSelect value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
            </TSelect>
          </Field>
          <Field label="Type">
            <TSelect value={movementType} onChange={(e) => setMovementType(e.target.value)}>
              <option value="">Tous</option>
              <option value="entree">Entrée</option>
              <option value="sortie">Sortie</option>
              <option value="ajustement">Ajustement</option>
              <option value="transfert">Transfert</option>
            </TSelect>
          </Field>
          <Field label="Date de"><TInput type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></Field>
          <Field label="Date à"><TInput type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></Field>
          <Field label="Référence"><TInput value={reference} onChange={(e) => setReference(e.target.value)} placeholder="BL, ticket..." /></Field>
        </div>
        <div className="flex gap-xs justify-end mt-md">
          <Button onClick={resetFilters} variant="ghost" size="sm">Réinitialiser</Button>
          <Button onClick={fetchMovements} variant="primary" size="sm">Appliquer</Button>
        </div>
      </Card>

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-md text-danger text-body-sm flex items-center gap-2 mb-md">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <Card animate delay={0.25} padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-md space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : movements.length === 0 ? (
          <EmptyState icon={BarChart3} title="Aucun mouvement trouvé" description="Ajuste les filtres ou réinitialise-les." />
        ) : (
          <DataTable minWidth={1200}>
            <THead>
              <TR><TH>Date</TH><TH>Type</TH><TH>Article</TH><TH>Catégorie</TH><TH right>Quantité</TH><TH>Unité</TH><TH>Référence</TH><TH>BO lié</TH><TH>Notes</TH></TR>
            </THead>
            <tbody>
              {movements.map((m, i) => {
                const sign = m.movement_type === 'sortie' ? '-' : m.movement_type === 'entree' ? '+' : ''
                return (
                  <TR key={m.id} animate delay={0.04 + i * 0.01}>
                    <TD mono className="text-caption"><DateDisplay value={m.movement_date} variant="compact" /></TD>
                    <TD><Badge variant={TYPE_VARIANT[m.movement_type] || 'default'} size="sm">{TYPE_LABELS[m.movement_type]}</Badge></TD>
                    <TD>
                      <div className="font-display font-semibold text-fg-primary">{m.stock_items?.name ?? '—'}</div>
                      {m.stock_items?.code && <div className="font-mono text-caption text-fg-tertiary">{m.stock_items.code}</div>}
                    </TD>
                    <TD><Badge variant="default" size="sm">{m.stock_items?.category ?? '—'}</Badge></TD>
                    <TD right mono className={`font-bold ${TYPE_VARIANT[m.movement_type] === 'success' ? 'text-success' : TYPE_VARIANT[m.movement_type] === 'danger' ? 'text-danger' : 'text-fg-primary'}`}>
                      {sign}{Number(m.quantity).toLocaleString('fr')}
                    </TD>
                    <TD mono className="text-caption text-fg-tertiary">{m.stock_items?.unit ?? '—'}</TD>
                    <TD mono className="text-caption">{m.reference ?? '—'}</TD>
                    <TD>{m.po_id && m.purchase_orders ? <Link href={`/achats/${m.po_id}`} className="font-mono text-caption text-brand hover:underline">{m.purchase_orders.po_number}</Link> : <span className="text-fg-tertiary">—</span>}</TD>
                    <TD className="text-caption text-fg-tertiary truncate max-w-[200px]">{m.notes ?? '—'}</TD>
                  </TR>
                )
              })}
            </tbody>
          </DataTable>
        )}
      </Card>
    </div>
  )
}
