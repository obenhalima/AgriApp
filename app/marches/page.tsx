'use client'
import { useEffect, useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Globe, Plus, Trash2, Search, X, MapPin, DollarSign, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { genCode } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect, Textarea, Field } from '@/components/ui/Input'
import { Modal, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

const TYPES = ['local', 'export', 'grande_distribution', 'grossiste', 'industrie']
const TYPE_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'brand' | 'default'> = {
  export: 'warning', local: 'success', grande_distribution: 'info', grossiste: 'brand', industrie: 'default',
}

export default function MarchesPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const [form, setForm] = useState({
    code: '', name: '', type: 'local', country: 'Maroc', currency: 'MAD',
    avg_price_per_kg: '', avg_logistics_cost_per_kg: '', export_fees_per_kg: '',
    payment_terms: '', requirements: '', notes: '',
  })
  const upd = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }))

  const load = () => supabase.from('markets').select('*').eq('is_active', true).order('name').then(r => { setItems(r.data || []); setLoading(false) })
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => items.filter(m => {
    if (typeFilter !== 'all' && m.type !== typeFilter) return false
    if (search && !`${m.code} ${m.name} ${m.country ?? ''}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [items, search, typeFilter])

  const stats = useMemo(() => ({
    count: items.length,
    types: new Set(items.map(m => m.type)).size,
    countries: new Set(items.map(m => m.country).filter(Boolean)).size,
    exportMarkets: items.filter(m => m.type === 'export').length,
  }), [items])

  const openModal = () => { setForm(f => ({ ...f, code: genCode('MKT', items.map(i => i.code)) })); setModal(true) }

  const save = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      const { data, error } = await supabase.from('markets').insert({
        code: form.code, name: form.name, type: form.type,
        country: form.country || null, currency: form.currency || 'MAD',
        avg_price_per_kg: form.avg_price_per_kg ? Number(form.avg_price_per_kg) : null,
        avg_logistics_cost_per_kg: form.avg_logistics_cost_per_kg ? Number(form.avg_logistics_cost_per_kg) : null,
        export_fees_per_kg: form.export_fees_per_kg ? Number(form.export_fees_per_kg) : null,
        payment_terms: form.payment_terms || null,
        requirements: form.requirements || null,
        notes: form.notes || null, is_active: true,
      }).select().single()
      if (error) throw error
      setItems(p => [data, ...p]); setDone(true)
      toast.success(`Marché "${data.name}" créé`)
      setTimeout(() => { setModal(false); setDone(false) }, 1200)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
    setSaving(false)
  }

  const del = async (id: string, name: string) => {
    if (!confirm(`Désactiver "${name}" ?`)) return
    try {
      await supabase.from('markets').update({ is_active: false }).eq('id', id)
      setItems(p => p.filter(i => i.id !== id))
      toast.success('Marché désactivé')
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
  }

  return (
    <div>
      {modal && (
        <Modal title="NOUVEAU MARCHÉ" onClose={() => { setModal(false); setDone(false) }}>
          {done ? <SuccessMessage message="Marché créé !" /> : (
            <div className="space-y-md">
              <div className="grid grid-cols-2 gap-md">
                <Field label="Code (auto)"><TInput value={form.code} onChange={upd('code')} /></Field>
                <Field label="Nom du marché" required><TInput value={form.name} onChange={upd('name')} placeholder="Export France" autoFocus /></Field>
              </div>
              <div className="grid grid-cols-2 gap-md">
                <Field label="Type">
                  <TSelect value={form.type} onChange={upd('type')}>{TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}</TSelect>
                </Field>
                <Field label="Devise">
                  <TSelect value={form.currency} onChange={upd('currency')}>{['MAD', 'EUR', 'USD', 'GBP'].map(c => <option key={c}>{c}</option>)}</TSelect>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-md">
                <Field label="Pays"><TInput value={form.country} onChange={upd('country')} placeholder="France" /></Field>
                <Field label="Prix moyen (par kg)"><TInput type="number" value={form.avg_price_per_kg} onChange={upd('avg_price_per_kg')} placeholder="0.65" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-md">
                <Field label="Coût logistique (/kg)"><TInput type="number" value={form.avg_logistics_cost_per_kg} onChange={upd('avg_logistics_cost_per_kg')} placeholder="0.18" /></Field>
                <Field label="Frais export (/kg)"><TInput type="number" value={form.export_fees_per_kg} onChange={upd('export_fees_per_kg')} placeholder="0.05" /></Field>
              </div>
              <Field label="Conditions de paiement"><TInput value={form.payment_terms} onChange={upd('payment_terms')} placeholder="30 jours net" /></Field>
              <Field label="Certifications requises"><TInput value={form.requirements} onChange={upd('requirements')} placeholder="GlobalGAP, BRC..." /></Field>
              <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={upd('notes')} /></Field>
              <ModalFooter onCancel={() => setModal(false)} onSave={save} loading={saving} disabled={!form.name} saveLabel="CRÉER" />
            </div>
          )}
        </Modal>
      )}

      <PageHeader
        title="Marchés" subtitle="Commercial" icon={Globe} iconColor="#3b82f6"
        description={`${items.length} marché${items.length > 1 ? 's' : ''} actif${items.length > 1 ? 's' : ''}`}
        actions={<Button onClick={openModal} variant="primary"><Plus size={14} strokeWidth={2.5} /> Nouveau marché</Button>}
        stats={loading ? [] : [
          { label: 'Total', value: String(stats.count), icon: Globe, color: '#3b82f6' },
          { label: 'Types', value: String(stats.types), icon: ShieldCheck, color: '#10b981' },
          { label: 'Pays', value: String(stats.countries), icon: MapPin, color: '#a855f7' },
          { label: 'Export', value: String(stats.exportMarkets), icon: DollarSign, color: '#f59e0b' },
        ]}
      />

      {!loading && items.length > 0 && (
        <Card animate delay={0.15} className="mb-md">
          <div className="flex items-center gap-md flex-wrap">
            <div className="flex items-center gap-sm flex-1 min-w-[200px] max-w-md">
              <Search size={14} className="text-fg-tertiary" />
              <TInput placeholder="Rechercher code, nom, pays…" value={search} onChange={(e) => setSearch(e.target.value)} className="border-none bg-transparent focus:ring-0 px-0" />
              {search && <button onClick={() => setSearch('')} className="text-fg-tertiary hover:text-fg-primary"><X size={14} /></button>}
            </div>
            <TSelect value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-8 w-auto min-w-[160px] text-body-sm">
              <option value="all">Tous types</option>
              {TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </TSelect>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Globe} title="Aucun marché" description="Crée tes marchés pour piloter la commercialisation." action={<Button onClick={openModal}><Plus size={14} strokeWidth={2.5} /> Nouveau</Button>} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="Aucun résultat" action={<Button variant="ghost" onClick={() => { setSearch(''); setTypeFilter('all') }}>Réinitialiser</Button>} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
          {filtered.map((m, i) => (
            <Card key={m.id} animate delay={0.05 + i * 0.04} interactive padding="none" className="overflow-hidden flex flex-col">
              <div className="h-1 bg-gradient-to-r from-info to-info/40" />
              <div className="p-lg flex-1">
                <div className="flex items-start justify-between gap-sm mb-md pb-md border-b border-border">
                  <div>
                    <div className="font-display text-heading font-bold text-fg-primary uppercase tracking-tight">{m.name}</div>
                    <div className="font-mono text-caption text-fg-tertiary mt-0.5">{m.code} · {m.country || '—'}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={TYPE_VARIANT[m.type] || 'default'} size="sm">{m.type?.replace('_', ' ')}</Badge>
                    <span className="font-mono text-caption text-warning">{m.currency}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-sm">
                  {[
                    { l: 'Prix/kg', v: m.avg_price_per_kg ? `${m.avg_price_per_kg} ${m.currency}` : '—' },
                    { l: 'Logistique', v: m.avg_logistics_cost_per_kg ? `${m.avg_logistics_cost_per_kg} ${m.currency}` : '—' },
                    { l: 'Frais export', v: m.export_fees_per_kg ? `${m.export_fees_per_kg} ${m.currency}` : '—' },
                  ].map((stat, idx) => (
                    <div key={idx} className="rounded-md bg-surface-sunk border border-border px-sm py-sm">
                      <div className="font-mono text-[8px] uppercase tracking-wider text-fg-tertiary mb-0.5">{stat.l}</div>
                      <div className="font-display text-body font-bold text-fg-primary">{stat.v}</div>
                    </div>
                  ))}
                </div>
                {m.requirements && (
                  <div className="mt-md flex items-center gap-1 text-caption text-fg-tertiary"><ShieldCheck size={10} />{m.requirements}</div>
                )}
                <Button onClick={() => del(m.id, m.name)} variant="destructive" size="sm" className="mt-md w-full">
                  <Trash2 size={12} strokeWidth={2.2} /> Désactiver
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
