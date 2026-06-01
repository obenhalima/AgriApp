'use client'
import { useEffect, useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Globe, Plus, Trash2, Search, X, MapPin, DollarSign, ShieldCheck, Pencil, Calendar } from 'lucide-react'
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
  const [editId, setEditId] = useState<string | null>(null)  // null = création, sinon = édition
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const [form, setForm] = useState({
    code: '', name: '', type: 'local', country: 'Maroc', currency: 'MAD',
    avg_price_per_kg: '', avg_logistics_cost_per_kg: '', export_fees_per_kg: '',
    payment_terms: '', payment_terms_days: '30', client_id: '',
    bordereau_frequency: 'monthly',
    is_ecart_market: false, requirements: '', notes: '',
  } as any)
  const upd = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))
  const [clients, setClients] = useState<any[]>([])

  const [loadDebug, setLoadDebug] = useState<{ activeCount: number; totalCount: number; lastError?: string } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      let marketsAll: any[] = []
      let lastError: string | undefined

      // Charge TOUS les clients d'abord pour mapping local (evite PostgREST embed ambigu)
      const clientsRes = await supabase.from('clients').select('id, name, is_active').order('name')
      const allClients = (clientsRes.data ?? []) as any[]
      const clientById = new Map(allClients.map(c => [c.id, c]))
      setClients(allClients.filter(c => c.is_active !== false))

      // Charge les marches SANS embed clients (evite l'erreur 'more than one relationship')
      const res = await supabase.from('markets').select('*').order('name')
      if (res.error) {
        console.error('[marches] load failed:', res.error)
        lastError = res.error.message
        toast.error('Chargement marches : ' + res.error.message)
      } else {
        // Enrichit chaque marche avec son client (jointure cote client)
        marketsAll = (res.data ?? []).map((m: any) => ({
          ...m,
          clients: m.client_id ? { name: clientById.get(m.client_id)?.name ?? null } : null,
        }))
      }

      const activeOnly = marketsAll.filter(m => m.is_active !== false)
      setItems(activeOnly)
      setLoadDebug({
        activeCount: activeOnly.length,
        totalCount: marketsAll.length,
        lastError,
      })
    } finally {
      setLoading(false)
    }
  }
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

  const openModal = () => {
    setEditId(null)
    setForm({
      code: genCode('MKT', items.map(i => i.code)), name: '', type: 'local',
      country: 'Maroc', currency: 'MAD',
      avg_price_per_kg: '', avg_logistics_cost_per_kg: '', export_fees_per_kg: '',
      payment_terms: '', payment_terms_days: '30', client_id: '',
      bordereau_frequency: 'monthly',
      is_ecart_market: false, requirements: '', notes: '',
    } as any)
    setModal(true)
  }

  const openEdit = (m: any) => {
    setEditId(m.id)
    // Frequency par defaut selon type : export=weekly, local=monthly
    const defaultFreq = m.type === 'export' ? 'weekly' : 'monthly'
    setForm({
      code: m.code ?? '',
      name: m.name ?? '',
      type: m.type ?? 'local',
      country: m.country ?? '',
      currency: m.currency ?? 'MAD',
      avg_price_per_kg: m.avg_price_per_kg != null ? String(m.avg_price_per_kg) : '',
      avg_logistics_cost_per_kg: m.avg_logistics_cost_per_kg != null ? String(m.avg_logistics_cost_per_kg) : '',
      export_fees_per_kg: m.export_fees_per_kg != null ? String(m.export_fees_per_kg) : '',
      payment_terms: m.payment_terms ?? '',
      payment_terms_days: m.payment_terms_days != null ? String(m.payment_terms_days) : '30',
      client_id: m.client_id ?? '',
      bordereau_frequency: m.bordereau_frequency ?? defaultFreq,
      is_ecart_market: !!m.is_ecart_market,
      requirements: m.requirements ?? '',
      notes: m.notes ?? '',
    } as any)
    setModal(true)
  }

  const save = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      const payload: any = {
        code: form.code, name: form.name, type: form.type,
        country: form.country || null, currency: form.currency || 'MAD',
        avg_price_per_kg: form.avg_price_per_kg ? Number(form.avg_price_per_kg) : null,
        avg_logistics_cost_per_kg: form.avg_logistics_cost_per_kg ? Number(form.avg_logistics_cost_per_kg) : null,
        export_fees_per_kg: form.export_fees_per_kg ? Number(form.export_fees_per_kg) : null,
        payment_terms: form.payment_terms || null,
        payment_terms_days: form.payment_terms_days ? Number(form.payment_terms_days) : 30,
        client_id: form.client_id || null,
        bordereau_frequency: (form as any).bordereau_frequency || 'monthly',
        is_ecart_market: !!(form as any).is_ecart_market,
        requirements: form.requirements || null,
        notes: form.notes || null,
      }

      // Helper : retire les colonnes manquantes en BD pour retry (migration partielle)
      const retryWithout = async (col: string) => {
        const fallbackPayload = { ...payload }
        delete fallbackPayload[col]
        return editId
          ? await supabase.from('markets').update(fallbackPayload).eq('id', editId).select().single()
          : await supabase.from('markets').insert({ ...fallbackPayload, is_active: true }).select().single()
      }

      let resp
      if (editId) {
        resp = await supabase.from('markets').update(payload).eq('id', editId).select().single()
      } else {
        resp = await supabase.from('markets').insert({ ...payload, is_active: true }).select().single()
      }

      // Retry sans client_id si la colonne n'existe pas (migration 047 pas appliquee)
      if (resp.error && /client_id.*schema cache|client_id.*does not exist/i.test(resp.error.message)) {
        toast.warning('Colonne client_id absente (migration 047 a appliquer). Sauvegarde sans client.', { duration: 6000 })
        resp = await retryWithout('client_id')
      }
      // Retry sans payment_terms_days si pas applique (migration 044)
      if (resp.error && /payment_terms_days.*schema cache|payment_terms_days.*does not exist/i.test(resp.error.message)) {
        toast.warning('Colonne payment_terms_days absente (migration 044 a appliquer). Sauvegarde sans delai.', { duration: 6000 })
        resp = await retryWithout('payment_terms_days')
      }
      // Retry sans is_ecart_market si pas applique (migration 048)
      if (resp.error && /is_ecart_market.*schema cache|is_ecart_market.*does not exist/i.test(resp.error.message)) {
        toast.warning('Colonne is_ecart_market absente (migration 048 a appliquer).', { duration: 6000 })
        resp = await retryWithout('is_ecart_market')
      }
      // Retry sans bordereau_frequency si pas applique (migration 049)
      if (resp.error && /bordereau_frequency.*schema cache|bordereau_frequency.*does not exist/i.test(resp.error.message)) {
        toast.warning('Colonne bordereau_frequency absente (migration 049 a appliquer).', { duration: 6000 })
        resp = await retryWithout('bordereau_frequency')
      }
      if (resp.error) throw resp.error

      const data = resp.data
      if (editId) {
        setItems(p => p.map(m => m.id === editId ? data : m))
        setDone(true)
        toast.success(`Marché "${data.name}" mis à jour`)
      } else {
        setItems(p => [data, ...p])
        setDone(true)
        toast.success(`Marché "${data.name}" créé`)
      }
      setTimeout(() => { setModal(false); setDone(false); setEditId(null) }, 1200)
    } catch (e: any) {
      const msg = e?.message ?? String(e)
      // Détection : colonne payment_terms_days inconnue → migration 044 pas déployée
      if (/payment_terms_days/i.test(msg) && /column/i.test(msg)) {
        toast.error("La colonne payment_terms_days n'existe pas. Appliquez la migration 044_bordereau_payment_invoice.sql sur Supabase.", { duration: 10000 })
      } else {
        toast.error('Erreur : ' + msg)
      }
    }
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
        <Modal title={editId ? 'MODIFIER LE MARCHÉ' : 'NOUVEAU MARCHÉ'} onClose={() => { setModal(false); setDone(false); setEditId(null) }}>
          {done ? <SuccessMessage message={editId ? 'Marché mis à jour !' : 'Marché créé !'} /> : (
            <div className="space-y-md">
              <div className="grid grid-cols-2 gap-md">
                <Field label="Code (auto)"><TInput value={form.code} onChange={upd('code')} disabled={!!editId} /></Field>
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
              <div className="grid grid-cols-2 gap-md">
                <Field label="Conditions de paiement (texte)">
                  <TInput value={form.payment_terms} onChange={upd('payment_terms')} placeholder="30 jours net" />
                </Field>
                <Field label="Délai paiement (jours) — auto-facturation">
                  <TInput
                    type="number"
                    min={0}
                    max={365}
                    value={form.payment_terms_days}
                    onChange={upd('payment_terms_days')}
                    placeholder="30"
                  />
                </Field>
              </div>
              <Field label="Client par défaut (utilisé pour les factures)" required>
                <TSelect value={form.client_id} onChange={upd('client_id')}>
                  <option value="">— Choisir un client —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </TSelect>
                {!form.client_id && (
                  <div className="text-caption text-warning mt-1">
                    ⚠ Sans client, les ventes vers ce marché ne pourront pas être facturées
                  </div>
                )}
              </Field>
              <Field label="Cadence du bordereau" hint="Période de regroupement des dispatches pour facturation">
                <TSelect value={(form as any).bordereau_frequency ?? 'monthly'} onChange={upd('bordereau_frequency')}>
                  <option value="weekly">Hebdomadaire (lundi → dimanche) — recommandé pour Export</option>
                  <option value="monthly">Mensuel (1er → fin du mois) — recommandé pour Local</option>
                  <option value="none">Aucun (facture par dispatch direct, sans regroupement)</option>
                </TSelect>
              </Field>
              <div className="rounded-md border border-warning/30 bg-warning/5 p-md">
                <label className="flex items-start gap-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(form as any).is_ecart_market ?? false}
                    onChange={(e) => setForm((f: any) => ({ ...f, is_ecart_market: e.target.checked }))}
                    className="mt-0.5 w-4 h-4 accent-warning"
                  />
                  <div className="flex-1 text-body-sm">
                    <strong className="text-fg-primary">Marché écart</strong>
                    <div className="text-fg-secondary mt-0.5">
                      Ce marché reçoit les écarts du tri (revendus à un client spécifique).
                      Un seul marché écart actif à la fois. Lie-le au client marqué
                      <code className="mx-1 px-1 bg-surface-sunk rounded">is_ecart_buyer</code>.
                    </div>
                  </div>
                </label>
              </div>
              <Field label="Certifications requises"><TInput value={form.requirements} onChange={upd('requirements')} placeholder="GlobalGAP, BRC..." /></Field>
              <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={upd('notes')} /></Field>
              <ModalFooter onCancel={() => { setModal(false); setEditId(null) }} onSave={save} loading={saving} disabled={!form.name} saveLabel={editId ? 'METTRE À JOUR' : 'CRÉER'} />
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

      {/* Bandeau diagnostic visible si erreur de chargement ou markets desactives */}
      {!loading && loadDebug && (loadDebug.lastError || loadDebug.totalCount !== loadDebug.activeCount) && (
        <Card animate delay={0.1} className="mb-md" style={{ borderColor: loadDebug.lastError ? '#ef4444' : '#f59e0b' }}>
          <div className="text-body-sm">
            <strong className="text-fg-primary">Diagnostic chargement</strong>
            <div className="text-fg-secondary mt-1">
              Total en base : <strong>{loadDebug.totalCount}</strong> marche(s) ·{' '}
              Actifs : <strong>{loadDebug.activeCount}</strong> · Inactifs : <strong>{loadDebug.totalCount - loadDebug.activeCount}</strong>
            </div>
            {loadDebug.lastError && (
              <div className="text-danger mt-1 font-mono text-caption">Erreur : {loadDebug.lastError}</div>
            )}
            {loadDebug.totalCount > 0 && loadDebug.activeCount === 0 && (
              <div className="text-warning mt-1">
                Tous les marches sont desactives (is_active=false). Pour les reactiver, lance dans Supabase SQL :
                <code className="block mt-1 p-2 bg-surface-sunk rounded font-mono text-caption">UPDATE markets SET is_active = true;</code>
              </div>
            )}
          </div>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Globe}
          title={loadDebug?.totalCount === 0 ? 'Aucun marché en base' : `${loadDebug?.totalCount ?? 0} marché(s) en base mais tous désactivés (is_active=false)`}
          description={
            loadDebug?.lastError
              ? `Erreur de chargement : ${loadDebug.lastError}`
              : (loadDebug?.totalCount === 0
                ? 'Crée ton premier marché pour piloter la commercialisation.'
                : `Active ces marchés via SQL : UPDATE markets SET is_active=true ; ou crée-en un nouveau.`)
          }
          action={<Button onClick={openModal}><Plus size={14} strokeWidth={2.5} /> Nouveau marché</Button>}
        />
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
                {/* Client par défaut + délai paiement (utilisés pour les factures) */}
                {m.clients?.name ? (
                  <div className="mt-sm flex items-center gap-1 text-caption text-fg-secondary">
                    👤 Client : <strong>{m.clients.name}</strong>
                  </div>
                ) : (
                  <div className="mt-sm flex items-center gap-1 text-caption text-warning">
                    ⚠ Aucun client (factures impossibles)
                  </div>
                )}
                {m.payment_terms_days != null && (
                  <div className="mt-sm flex items-center gap-1 text-caption text-fg-tertiary">
                    <Calendar size={10} />
                    Délai paiement : <strong className="text-fg-secondary">{m.payment_terms_days} j</strong>
                    {m.payment_terms && <span className="text-fg-muted">— {m.payment_terms}</span>}
                  </div>
                )}
                {m.requirements && (
                  <div className="mt-sm flex items-center gap-1 text-caption text-fg-tertiary"><ShieldCheck size={10} />{m.requirements}</div>
                )}
                <div className="mt-md grid grid-cols-2 gap-sm">
                  <Button onClick={() => openEdit(m)} variant="secondary" size="sm">
                    <Pencil size={12} strokeWidth={2.2} /> Modifier
                  </Button>
                  <Button onClick={() => del(m.id, m.name)} variant="destructive" size="sm">
                    <Trash2 size={12} strokeWidth={2.2} /> Désactiver
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
