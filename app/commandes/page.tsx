'use client'
/**
 * /commandes — Refonte avec design system + workflow.
 */
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  ClipboardList, Plus, History, AlertCircle, ArrowRight, Search, X,
  Calendar, Package, Truck, CheckCircle2, XCircle, Clock,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/format'

import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect, Textarea, Field } from '@/components/ui/Input'
import { Modal, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'
import { DateDisplay } from '@/components/display'

import {
  getDefaultDefinition, getStates, applyTransition, getEntityHistory,
  WorkflowState, WorkflowTransition, WorkflowHistoryEntry,
} from '@/lib/workflow'

const ENTITY_TYPE = 'sales_order'

export default function CommandesPage() {
  const [items, setItems] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [marches, setMarches] = useState<any[]>([])
  const [campagnes, setCampagnes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [form, setForm] = useState({
    client_id: '', market_id: '', campaign_id: '',
    order_date: '', delivery_date: '', currency: 'MAD', notes: '',
  })
  const upd = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }))

  const [states, setStates] = useState<WorkflowState[]>([])
  const [allTrans, setAllTrans] = useState<WorkflowTransition[]>([])
  const [transitingId, setTransitingId] = useState<string | null>(null)

  const [histOrderId, setHistOrderId] = useState<string | null>(null)
  const [histEntries, setHistEntries] = useState<WorkflowHistoryEntry[]>([])
  const [histLoading, setHistLoading] = useState(false)

  const load = async () => {
    const [o, c, m, camp, def] = await Promise.all([
      supabase.from('sales_orders').select('*, clients(name), markets(name)').order('order_date', { ascending: false }).limit(100),
      supabase.from('clients').select('id,name,code').eq('is_active', true).order('name'),
      supabase.from('markets').select('id,name,currency').eq('is_active', true).order('name'),
      supabase.from('campaigns').select('id,name').order('name'),
      getDefaultDefinition(ENTITY_TYPE),
    ])
    setItems(o.data || []); setClients(c.data || []); setMarches(m.data || []); setCampagnes(camp.data || [])

    if (def) {
      const [st, tr] = await Promise.all([
        getStates(def.id),
        supabase.from('workflow_transitions').select('*').eq('definition_id', def.id).eq('is_active', true).order('order_idx'),
      ])
      setStates(st)
      setAllTrans((tr.data ?? []) as WorkflowTransition[])
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => items.filter(o => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!`${o.order_number} ${o.clients?.name ?? ''} ${o.markets?.name ?? ''}`.toLowerCase().includes(q)) return false
    }
    return true
  }), [items, search, statusFilter])

  const stats = useMemo(() => {
    return {
      count: items.length,
      brouillon: items.filter(o => o.status === 'brouillon').length,
      enCours: items.filter(o => o.status === 'en_cours' || o.status === 'confirme').length,
      livre: items.filter(o => o.status === 'livre' || o.status === 'cloture').length,
      annule: items.filter(o => o.status === 'annule').length,
    }
  }, [items])

  const stateByCode = useMemo(() => {
    const m: Record<string, WorkflowState> = {}
    states.forEach(s => { m[s.code] = s })
    return m
  }, [states])

  const transitionsFor = (status: string): WorkflowTransition[] => {
    const fromState = states.find(s => s.code === status)
    if (!fromState) return []
    return allTrans.filter(t => t.from_state_id === fromState.id)
  }
  const toStateOf = (t: WorkflowTransition) => states.find(s => s.id === t.to_state_id)

  const triggerTransition = async (order: any, t: WorkflowTransition) => {
    const target = toStateOf(t)
    if (!target) return
    setTransitingId(order.id)
    try {
      await applyTransition({ entityType: ENTITY_TYPE, entityId: order.id, transitionId: t.id })
      setItems(prev => prev.map(o => o.id === order.id ? { ...o, status: target.code } : o))
      toast.success(`Statut mis à jour : ${target.code}`)
    } catch (e: any) { toast.error('Transition refusée : ' + (e?.message ?? 'erreur')) }
    finally { setTransitingId(null) }
  }

  const openHistory = async (orderId: string) => {
    setHistOrderId(orderId); setHistLoading(true)
    try { setHistEntries(await getEntityHistory(ENTITY_TYPE, orderId)) }
    catch (e: any) { toast.error('Erreur historique : ' + e.message) }
    finally { setHistLoading(false) }
  }

  const selectMarche = (id: string) => {
    const m = marches.find(x => x.id === id)
    setForm(f => ({ ...f, market_id: id, currency: m?.currency || 'MAD' }))
  }

  const save = async () => {
    if (!form.client_id || !form.order_date) return
    setSaving(true)
    try {
      const num = `CMD-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`
      const { data, error } = await supabase.from('sales_orders').insert({
        order_number: num, client_id: form.client_id,
        market_id: form.market_id || null, campaign_id: form.campaign_id || null,
        order_date: form.order_date, delivery_date: form.delivery_date || null,
        status: 'brouillon', currency: form.currency || 'MAD',
        exchange_rate: 1, subtotal: 0, total_amount: 0, notes: form.notes || null,
      }).select('*, clients(name), markets(name)').single()
      if (error) throw error
      setItems(p => [data, ...p]); setDone(true)
      toast.success(`Commande ${num} créée`)
      setTimeout(() => {
        setModal(false); setDone(false)
        setForm({ client_id: '', market_id: '', campaign_id: '', order_date: '', delivery_date: '', currency: 'MAD', notes: '' })
      }, 1200)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
    setSaving(false)
  }

  return (
    <div>
      {modal && (
        <Modal title="NOUVELLE COMMANDE" onClose={() => { setModal(false); setDone(false) }}>
          {done ? <SuccessMessage message="Commande créée !" /> : (
            <div className="space-y-md">
              <Field label="Client" required>
                {clients.length === 0 ? (
                  <div className="flex items-center gap-2 px-md py-2 rounded-md border border-danger/30 bg-danger/10 text-danger text-body-sm">
                    <AlertCircle size={14} /> Aucun client — crée d'abord un client
                  </div>
                ) : (
                  <TSelect value={form.client_id} onChange={upd('client_id')}>
                    <option value="">— Sélectionner —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </TSelect>
                )}
              </Field>
              <div className="grid grid-cols-2 gap-md">
                <Field label="Marché">
                  <TSelect value={form.market_id} onChange={(e) => selectMarche(e.target.value)}>
                    <option value="">— Optionnel —</option>
                    {marches.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </TSelect>
                </Field>
                <Field label="Devise">
                  <TSelect value={form.currency} onChange={upd('currency')}>
                    {['MAD', 'EUR', 'USD', 'GBP'].map(c => <option key={c}>{c}</option>)}
                  </TSelect>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-md">
                <Field label="Date de commande" required><TInput type="date" value={form.order_date} onChange={upd('order_date')} /></Field>
                <Field label="Date livraison souhaitée"><TInput type="date" value={form.delivery_date} onChange={upd('delivery_date')} /></Field>
              </div>
              <Field label="Campagne">
                <TSelect value={form.campaign_id} onChange={upd('campaign_id')}>
                  <option value="">— Optionnel —</option>
                  {campagnes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </TSelect>
              </Field>
              <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={upd('notes')} placeholder="Instructions, conditions particulières…" /></Field>
              <ModalFooter onCancel={() => setModal(false)} onSave={save} loading={saving} disabled={!form.client_id || !form.order_date} saveLabel="CRÉER LA COMMANDE" />
            </div>
          )}
        </Modal>
      )}

      {/* Modal historique */}
      {histOrderId && (
        <Modal title="HISTORIQUE DES TRANSITIONS" onClose={() => { setHistOrderId(null); setHistEntries([]) }} size="md">
          {histLoading ? (
            <div className="space-y-2 p-md">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : histEntries.length === 0 ? (
            <EmptyState icon={History} title="Aucune transition" description="L'historique est vide." />
          ) : (
            <div className="space-y-sm max-h-[60vh] overflow-y-auto">
              {histEntries.map(h => (
                <motion.div
                  key={h.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="rounded-md border border-border bg-surface-sunk p-md"
                >
                  <div className="font-mono text-caption text-fg-tertiary">
                    {new Date(h.created_at).toLocaleString('fr')}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-body-sm">
                    <Badge variant="default" size="sm">{h.from_state_code ?? '∅'}</Badge>
                    <ArrowRight size={12} className="text-fg-tertiary" />
                    <Badge variant="success" size="sm">{h.to_state_code}</Badge>
                  </div>
                  {h.comment && <div className="mt-2 text-body-sm text-fg-secondary">{h.comment}</div>}
                </motion.div>
              ))}
            </div>
          )}
        </Modal>
      )}

      <PageHeader
        title="Commandes"
        subtitle="Ventes"
        icon={ClipboardList}
        iconColor="#ec4899"
        description={`${items.length} commande${items.length > 1 ? 's' : ''}`}
        actions={
          <Button onClick={() => setModal(true)} variant="primary">
            <Plus size={14} strokeWidth={2.5} /> Nouvelle commande
          </Button>
        }
        stats={loading ? [] : [
          { label: 'Total',     value: String(stats.count),     icon: ClipboardList, color: '#ec4899' },
          { label: 'Brouillon', value: String(stats.brouillon), icon: Clock,         color: '#64748b' },
          { label: 'En cours',  value: String(stats.enCours),   icon: Truck,         color: '#3b82f6' },
          { label: 'Livrées',   value: String(stats.livre),     icon: CheckCircle2,   color: '#10b981' },
          { label: 'Annulées',  value: String(stats.annule),    icon: XCircle,       color: '#ef4444' },
        ]}
      />

      {!loading && items.length > 0 && (
        <Card animate delay={0.15} className="mb-md">
          <div className="flex items-center gap-md flex-wrap">
            <div className="flex items-center gap-sm flex-1 min-w-[200px] max-w-md">
              <Search size={14} className="text-fg-tertiary flex-shrink-0" />
              <TInput
                placeholder="Rechercher numéro, client, marché…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="border-none bg-transparent focus:ring-0 px-0"
              />
              {search && <button onClick={() => setSearch('')} className="text-fg-tertiary hover:text-fg-primary"><X size={14} /></button>}
            </div>
            <TSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 w-auto min-w-[160px] text-body-sm">
              <option value="all">Tous statuts</option>
              {states.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
            </TSelect>
            <div className="ml-auto text-caption font-mono text-fg-tertiary">{filtered.length}/{items.length}</div>
          </div>
        </Card>
      )}

      <Card animate delay={0.25} padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-md space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Aucune commande"
            description="Crée ta première commande client."
            action={<Button onClick={() => setModal(true)}><Plus size={14} strokeWidth={2.5} /> Nouvelle commande</Button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Aucun résultat"
            description="Aucune commande ne correspond à tes filtres."
            action={<Button variant="ghost" onClick={() => { setSearch(''); setStatusFilter('all') }}>Réinitialiser</Button>}
          />
        ) : (
          <DataTable minWidth={1200}>
            <THead>
              <TR>
                <TH>N° Commande</TH>
                <TH>Client</TH>
                <TH>Marché</TH>
                <TH>Date</TH>
                <TH>Livraison</TH>
                <TH>Devise</TH>
                <TH>Statut</TH>
                <TH>Actions workflow</TH>
                <TH right>Historique</TH>
              </TR>
            </THead>
            <tbody>
              {filtered.map((o, i) => {
                const st = stateByCode[o.status]
                const color = st?.color ?? '#64748b'
                const label = st?.label ?? o.status
                const available = transitionsFor(o.status)
                const isLoading = transitingId === o.id
                return (
                  <TR key={o.id} animate delay={0.04 + i * 0.02}>
                    <TD mono className="text-caption font-semibold text-brand">{o.order_number}</TD>
                    <TD className="font-display font-semibold text-fg-primary">{o.clients?.name || '—'}</TD>
                    <TD className="text-caption text-fg-secondary">{o.markets?.name || '—'}</TD>
                    <TD mono className="text-caption"><DateDisplay value={o.order_date} variant="compact" /></TD>
                    <TD mono className="text-caption"><DateDisplay value={o.delivery_date} variant="compact" /></TD>
                    <TD mono className="text-caption text-warning">{o.currency}</TD>
                    <TD>
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-caption font-mono uppercase tracking-wider font-semibold border"
                        style={{
                          background: `color-mix(in srgb, ${color} 12%, transparent)`,
                          color,
                          borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
                        }}
                      >
                        {label}
                      </span>
                    </TD>
                    <TD>
                      {available.length === 0 ? (
                        <span className="text-caption text-fg-tertiary font-mono">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {available.map(t => {
                            const tgt = toStateOf(t)
                            const tgtColor = tgt?.color ?? '#64748b'
                            return (
                              <button
                                key={t.id}
                                onClick={() => triggerTransition(o, t)}
                                disabled={isLoading}
                                title={`${o.status} → ${tgt?.code ?? '?'}`}
                                className={cn(
                                  'inline-flex items-center gap-1 px-2 py-0.5 rounded text-caption font-mono font-semibold border transition-colors',
                                  isLoading ? 'opacity-50 cursor-wait' : 'hover:opacity-80'
                                )}
                                style={{
                                  background: `color-mix(in srgb, ${tgtColor} 12%, transparent)`,
                                  color: tgtColor,
                                  borderColor: `color-mix(in srgb, ${tgtColor} 30%, transparent)`,
                                }}
                              >
                                {isLoading ? '…' : <>{t.label} <ArrowRight size={9} /></>}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </TD>
                    <TD right>
                      <Button onClick={() => openHistory(o.id)} variant="ghost" size="icon-sm" title="Historique">
                        <History size={12} strokeWidth={2.2} />
                      </Button>
                    </TD>
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
