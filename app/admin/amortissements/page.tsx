'use client'
/**
 * /admin/amortissements — Registre des actifs immobilisés.
 * Refonte complète avec le design system : KPICard, DataTable, StatusBadge, etc.
 */
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Calculator, Plus, Pencil, Trash2, Boxes, Coins, Wallet,
  CalendarDays, BarChart3, Info, Search, X, ArrowUpRight,
} from 'lucide-react'
import Link from 'next/link'

import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/format'

import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton, SkeletonKPI } from '@/components/ui/Skeleton'
import { KPICard } from '@/components/ui/KPICard'
import { Input as TInput, Select as TSelect, Textarea, Field } from '@/components/ui/Input'
import { Modal, FormGroup, FormRow, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { MoneyDisplay } from '@/components/display'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'

// ─── Types ───
type Asset = {
  id: string; code: string; label: string
  account_category_id: string; acquisition_date: string; acquisition_cost: number
  supplier: string | null; reference_number: string | null
  useful_life_years: number; depreciation_method: string
  residual_value: number | null; farm_id: string | null
  greenhouse_id: string | null; campaign_id: string | null
  is_active: boolean; disposal_date: string | null; disposal_amount: number | null
  notes: string | null
}
type Category = { id: string; code: string; label: string; type: string; default_depreciation_years: number | null }
type Farm = { id: string; code: string; name: string }
type Greenhouse = { id: string; code: string; name: string; farm_id: string }
type Campaign = { id: string; code: string; name: string; farm_id: string }

const empty: Partial<Asset> = {
  code: '', label: '',
  acquisition_date: new Date().toISOString().slice(0, 10),
  acquisition_cost: 0,
  useful_life_years: 10,
  depreciation_method: 'linear',
  residual_value: 0,
  is_active: true,
}

export default function AmortissementsPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [farms, setFarms] = useState<Farm[]>([])
  const [greenhouses, setGreenhouses] = useState<Greenhouse[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [costEntries, setCostEntries] = useState<{ source_asset_id: string; amount: number; entry_date: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'disposed'>('active')
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Asset | null>(null)
  const [form, setForm] = useState<Partial<Asset>>(empty)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [a, cat, f, g, camp, ce] = await Promise.all([
        supabase.from('assets').select('*').order('acquisition_date', { ascending: false }),
        supabase.from('account_categories').select('id, code, label, type, default_depreciation_years').eq('type', 'amortissement').eq('is_active', true).order('display_order'),
        supabase.from('farms').select('id, code, name').eq('is_active', true).order('name'),
        supabase.from('greenhouses').select('id, code, name, farm_id').order('code'),
        supabase.from('campaigns').select('id, code, name, farm_id').order('created_at', { ascending: false }),
        supabase.from('cost_entries').select('source_asset_id, amount, entry_date').not('source_asset_id', 'is', null),
      ])
      if (a.error) throw a.error
      setAssets((a.data ?? []) as any)
      setCategories((cat.data ?? []) as any)
      setFarms((f.data ?? []) as any)
      setGreenhouses((g.data ?? []) as any)
      setCampaigns((camp.data ?? []) as any)
      setCostEntries((ce.data ?? []) as any)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Enrichi
  const today = new Date().toISOString().slice(0, 10)
  const enrichedAssets = useMemo(() => {
    return assets.map(a => {
      const myEntries = costEntries.filter(ce => ce.source_asset_id === a.id)
      const cumulToDate = myEntries.filter(ce => ce.entry_date <= today).reduce((s, x) => s + Number(x.amount || 0), 0)
      const cumulTotal = myEntries.reduce((s, x) => s + Number(x.amount || 0), 0)
      const vnc = Math.max(0, Number(a.acquisition_cost) - cumulToDate)
      const monthly = (Number(a.acquisition_cost) - Number(a.residual_value || 0)) / (a.useful_life_years * 12)
      const annual = monthly * 12
      const status: 'active' | 'inactive' | 'disposed' | 'fully_amortized' =
        a.disposal_date ? 'disposed' :
        !a.is_active ? 'inactive' :
        cumulToDate >= (Number(a.acquisition_cost) - Number(a.residual_value || 0)) ? 'fully_amortized' :
        'active'
      return { ...a, cumulToDate, cumulTotal, vnc, monthly, annual, status, nb_entries: myEntries.length }
    })
  }, [assets, costEntries, today])

  // Filtres
  const filtered = useMemo(() => enrichedAssets.filter(a => {
    if (filterStatus === 'active' && !(a.is_active && !a.disposal_date)) return false
    if (filterStatus === 'inactive' && a.is_active) return false
    if (filterStatus === 'disposed' && !a.disposal_date) return false
    if (search) {
      const q = search.toLowerCase()
      const cat = categories.find(c => c.id === a.account_category_id)
      if (!`${a.code} ${a.label} ${cat?.code ?? ''} ${cat?.label ?? ''}`.toLowerCase().includes(q)) return false
    }
    return true
  }), [enrichedAssets, filterStatus, search, categories])

  // KPIs
  const kpis = useMemo(() => {
    const active = enrichedAssets.filter(a => a.status === 'active' || a.status === 'fully_amortized')
    return {
      nb: active.length,
      cost: active.reduce((s, a) => s + Number(a.acquisition_cost), 0),
      vnc: active.reduce((s, a) => s + a.vnc, 0),
      monthly: active.reduce((s, a) => s + a.monthly, 0),
      annual: active.reduce((s, a) => s + a.annual, 0),
    }
  }, [enrichedAssets])

  // Counts
  const counts = useMemo(() => ({
    active: enrichedAssets.filter(a => a.is_active && !a.disposal_date).length,
    disposed: enrichedAssets.filter(a => !!a.disposal_date).length,
    inactive: enrichedAssets.filter(a => !a.is_active).length,
    all: enrichedAssets.length,
  }), [enrichedAssets])

  // Form helpers
  const openCreate = () => { setEditing(null); setForm(empty); setModalOpen(true); setDone(false) }
  const openEdit = (a: any) => { setEditing(a); setForm({ ...a }); setModalOpen(true); setDone(false) }
  const f = (k: keyof Asset) => (e: any) => setForm(s => ({ ...s, [k]: e.target.value }))
  const onCategoryChange = (e: any) => {
    const id = e.target.value
    const cat = categories.find(c => c.id === id)
    setForm(s => ({
      ...s,
      account_category_id: id,
      useful_life_years: !editing && cat?.default_depreciation_years ? cat.default_depreciation_years : s.useful_life_years,
    }))
  }

  const save = async () => {
    if (!form.label || !form.account_category_id || !form.acquisition_date || !form.acquisition_cost || !form.useful_life_years) {
      toast.error('Libellé, catégorie, date, coût et durée sont requis')
      return
    }
    setSaving(true)
    try {
      const payload: any = {
        ...(editing ? { code: form.code } : {}),
        label: form.label,
        account_category_id: form.account_category_id,
        acquisition_date: form.acquisition_date,
        acquisition_cost: Number(form.acquisition_cost),
        supplier: form.supplier || null,
        reference_number: form.reference_number || null,
        useful_life_years: Number(form.useful_life_years),
        depreciation_method: form.depreciation_method || 'linear',
        residual_value: Number(form.residual_value || 0),
        farm_id: form.farm_id || null,
        greenhouse_id: form.greenhouse_id || null,
        campaign_id: form.campaign_id || null,
        is_active: form.is_active ?? true,
        disposal_date: form.disposal_date || null,
        disposal_amount: form.disposal_amount ? Number(form.disposal_amount) : null,
        notes: form.notes || null,
      }
      const { error } = editing
        ? await supabase.from('assets').update(payload).eq('id', editing.id)
        : await supabase.from('assets').insert(payload)
      if (error) throw error
      setDone(true)
      toast.success(editing ? 'Actif modifié' : 'Actif créé')
      setTimeout(() => { setModalOpen(false); setDone(false); load() }, 1000)
    } catch (e: any) { toast.error(e.message || String(e)) }
    setSaving(false)
  }

  const remove = async (a: Asset) => {
    if (!confirm(`Supprimer l'actif ${a.code} ? Les amortissements générés seront aussi supprimés.`)) return
    try {
      const { error } = await supabase.from('assets').delete().eq('id', a.id)
      if (error) throw error
      toast.success(`Actif ${a.code} supprimé`)
      load()
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
  }

  // Aperçu calcul amortissement
  const preview = useMemo(() => {
    const cost = Number(form.acquisition_cost) || 0
    const res = Number(form.residual_value || 0)
    const life = Number(form.useful_life_years) || 0
    if (cost <= 0 || life <= 0) return null
    const m = (cost - res) / (life * 12)
    return { monthly: m, annual: m * 12, total: m * 12 * life }
  }, [form.acquisition_cost, form.residual_value, form.useful_life_years])

  const filteredGreenhouses = greenhouses.filter(g => !form.farm_id || g.farm_id === form.farm_id)
  const filteredCampaigns = campaigns.filter(c => !form.farm_id || c.farm_id === form.farm_id)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':         return <Badge variant="success" size="sm" dot>Actif</Badge>
      case 'fully_amortized': return <Badge variant="default" size="sm">✓ Amorti</Badge>
      case 'disposed':       return <Badge variant="warning" size="sm">↗ Cédé</Badge>
      case 'inactive':       return <Badge variant="default" size="sm">○ Inactif</Badge>
      default:               return <Badge variant="default" size="sm">{status}</Badge>
    }
  }

  return (
    <div>
      <PageHeader
        title="Amortissements"
        subtitle="Paramétrage"
        icon={Calculator}
        iconColor="#a855f7"
        description="Registre des actifs immobilisés — dotations mensuelles automatiques imputées au compte d'exploitation"
        actions={
          <Button onClick={openCreate} variant="primary">
            <Plus size={14} strokeWidth={2.5} /> Nouvel actif
          </Button>
        }
      />

      {/* KPI hero */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-md mb-md">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonKPI key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-md mb-md">
          <KPICard label="Actifs en service"    value={String(kpis.nb)}                                  sub="amortissables" icon={Boxes}     accent="#a855f7" delay={0} />
          <KPICard label="Valeur d'origine"     value={<MoneyDisplay value={kpis.cost}    compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />} sub="MAD acquisition"     icon={Coins}        accent="#3b82f6" delay={0.05} />
          <KPICard label="VNC"                  value={<MoneyDisplay value={kpis.vnc}     compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />} sub="MAD valeur nette"   icon={Wallet}       accent="#10b981" delay={0.1} />
          <KPICard label="Dotation mensuelle"   value={<MoneyDisplay value={kpis.monthly} compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />} sub="MAD/mois charge"    icon={CalendarDays} accent="#f59e0b" delay={0.15} />
          <KPICard label="Dotation annuelle"    value={<MoneyDisplay value={kpis.annual}  compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />} sub="MAD/an charge"      icon={BarChart3}    accent="#ef4444" delay={0.2} />
        </div>
      )}

      {/* Filtres */}
      <Card animate delay={0.25} className="mb-md">
        <div className="flex items-center gap-md flex-wrap">
          <div className="flex items-center gap-sm flex-1 min-w-[200px] max-w-md">
            <Search size={14} className="text-fg-tertiary flex-shrink-0" />
            <TInput
              placeholder="Rechercher code, libellé, catégorie…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="border-none bg-transparent focus:ring-0 px-0"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-fg-tertiary hover:text-fg-primary">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 ml-auto">
            {([
              { k: 'active'   as const, label: 'En service', count: counts.active },
              { k: 'disposed' as const, label: 'Cédés',      count: counts.disposed },
              { k: 'inactive' as const, label: 'Inactifs',   count: counts.inactive },
              { k: 'all'      as const, label: 'Tous',       count: counts.all },
            ]).map(opt => (
              <button
                key={opt.k}
                onClick={() => setFilterStatus(opt.k)}
                className={cn(
                  'h-8 px-md rounded-md font-mono text-[11px] uppercase tracking-wider font-semibold transition-all',
                  filterStatus === opt.k
                    ? 'bg-brand text-white shadow-[0_2px_8px_var(--neon-dim)]'
                    : 'bg-surface-raised text-fg-secondary border border-border hover:border-border-strong hover:bg-surface-hover'
                )}
              >
                {opt.label}
                <span className={cn('ml-1.5 opacity-70', filterStatus === opt.k && 'opacity-100')}>({opt.count})</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card animate delay={0.3} padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-md space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : filtered.length === 0 ? (
          assets.length === 0 ? (
            <EmptyState
              icon={Calculator}
              title="Aucun actif"
              description="Crée ton premier actif pour générer automatiquement les dotations mensuelles."
              action={<Button onClick={openCreate}><Plus size={14} strokeWidth={2.5} /> Nouvel actif</Button>}
            />
          ) : (
            <EmptyState
              icon={Search}
              title="Aucun résultat"
              description="Aucun actif ne correspond à tes filtres."
              action={<Button variant="ghost" onClick={() => { setSearch(''); setFilterStatus('all') }}>Réinitialiser</Button>}
            />
          )
        ) : (
          <DataTable minWidth={1100}>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Libellé</TH>
                <TH>Catégorie</TH>
                <TH>Acquis</TH>
                <TH right>Coût</TH>
                <TH right>Durée</TH>
                <TH right>Mensuel</TH>
                <TH right>Cumul</TH>
                <TH right>VNC</TH>
                <TH>Statut</TH>
                <TH right>Actions</TH>
              </TR>
            </THead>
            <tbody>
              {filtered.map((a, i) => {
                const cat = categories.find(c => c.id === a.account_category_id)
                return (
                  <TR key={a.id} animate delay={0.05 + i * 0.02} className={cn(!a.is_active && 'opacity-50')}>
                    <TD mono className="text-caption font-semibold">{a.code}</TD>
                    <TD className="font-semibold text-fg-primary">{a.label}</TD>
                    <TD>
                      <Badge variant="brand" size="sm">{cat?.code ?? '?'}</Badge>
                    </TD>
                    <TD mono className="text-caption">{a.acquisition_date}</TD>
                    <TD right mono><MoneyDisplay value={a.acquisition_cost} showCurrency={false} compact="auto" className="text-fg-primary" /></TD>
                    <TD right mono className="text-caption">{a.useful_life_years}a</TD>
                    <TD right mono><MoneyDisplay value={a.monthly} showCurrency={false} compact="auto" className="text-fg-secondary" /></TD>
                    <TD right mono><MoneyDisplay value={a.cumulToDate} showCurrency={false} compact="auto" className="text-fg-tertiary" /></TD>
                    <TD right mono><MoneyDisplay value={a.vnc} showCurrency={false} compact="auto" className="text-success font-semibold" /></TD>
                    <TD>{getStatusBadge(a.status)}</TD>
                    <TD right>
                      <div className="flex items-center justify-end gap-1">
                        <Button onClick={() => openEdit(a)} variant="ghost" size="icon-sm" title="Modifier">
                          <Pencil size={12} strokeWidth={2.2} />
                        </Button>
                        <Button onClick={() => remove(a)} variant="ghost" size="icon-sm" title="Supprimer" className="hover:text-danger">
                          <Trash2 size={12} strokeWidth={2.2} />
                        </Button>
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </tbody>
          </DataTable>
        )}
      </Card>

      {/* Info pédagogique */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-md flex items-start gap-sm rounded-md border border-info/30 bg-info/5 p-md"
      >
        <Info size={14} className="text-info flex-shrink-0 mt-0.5" strokeWidth={2.2} />
        <div className="text-caption text-fg-secondary leading-relaxed">
          <strong className="text-fg-primary">Comment ça marche :</strong> à chaque création/modification d'un actif, le trigger SQL régénère
          automatiquement <strong>1 cost_entry par mois</strong> sur toute la durée d'amortissement (linéaire). Les écritures sont imputées à
          la <strong>catégorie comptable</strong> AMT_* et apparaissent dans{' '}
          <Link href="/admin/compte-exploitation" className="text-brand hover:underline inline-flex items-center gap-0.5">
            Compte d'exploitation <ArrowUpRight size={10} />
          </Link>{' '}
          sous <em>Amortissements</em>. En cas de cession, les dotations s'arrêtent à la date de cession.
        </div>
      </motion.div>

      {/* Modal */}
      {modalOpen && (
        <Modal title={editing ? `Éditer — ${editing.code}` : 'Nouvel actif immobilisé'} onClose={() => setModalOpen(false)} size="lg">
          {done ? <SuccessMessage message={editing ? 'Actif modifié' : 'Actif créé'} /> : (
            <div className="space-y-md">
              <FormRow>
                <FormGroup label={editing ? 'Code' : 'Code (auto-généré)'}>
                  <TInput
                    type="text"
                    value={editing ? (form.code ?? '') : '— auto à la création —'}
                    readOnly
                    className={cn(
                      editing ? '' : 'italic text-fg-tertiary',
                      'cursor-not-allowed bg-surface-sunk'
                    )}
                  />
                </FormGroup>
                <FormGroup label="Catégorie *">
                  <TSelect value={form.account_category_id ?? ''} onChange={onCategoryChange}>
                    <option value="">— sélectionner —</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.label}{c.default_depreciation_years ? ` (${c.default_depreciation_years} ans)` : ''}
                      </option>
                    ))}
                  </TSelect>
                </FormGroup>
              </FormRow>
              <FormGroup label="Libellé *">
                <TInput value={form.label ?? ''} onChange={f('label')} placeholder="Serre F01-S03 — structure métallique" autoFocus />
              </FormGroup>
              <FormRow>
                <FormGroup label="Date acquisition *"><TInput type="date" value={form.acquisition_date ?? ''} onChange={f('acquisition_date')} /></FormGroup>
                <FormGroup label="Coût d'acquisition (MAD) *"><TInput type="number" value={String(form.acquisition_cost ?? '')} onChange={f('acquisition_cost')} placeholder="500000" /></FormGroup>
                <FormGroup label="Valeur résiduelle (MAD)"><TInput type="number" value={String(form.residual_value ?? 0)} onChange={f('residual_value')} placeholder="0" /></FormGroup>
              </FormRow>
              <FormRow>
                <FormGroup label="Durée d'amortissement (années) *"><TInput type="number" value={String(form.useful_life_years ?? 10)} onChange={f('useful_life_years')} /></FormGroup>
                <FormGroup label="Méthode">
                  <TSelect value={form.depreciation_method ?? 'linear'} onChange={f('depreciation_method')}>
                    <option value="linear">Linéaire</option>
                  </TSelect>
                </FormGroup>
                <FormGroup label="Fournisseur"><TInput value={form.supplier ?? ''} onChange={f('supplier')} /></FormGroup>
              </FormRow>
              <FormRow>
                <FormGroup label="N° facture"><TInput value={form.reference_number ?? ''} onChange={f('reference_number')} /></FormGroup>
                <FormGroup label="Ferme">
                  <TSelect value={form.farm_id ?? ''} onChange={f('farm_id')}>
                    <option value="">— aucune —</option>
                    {farms.map(fm => <option key={fm.id} value={fm.id}>{fm.code} — {fm.name}</option>)}
                  </TSelect>
                </FormGroup>
                <FormGroup label="Serre">
                  <TSelect value={form.greenhouse_id ?? ''} onChange={f('greenhouse_id')}>
                    <option value="">— aucune —</option>
                    {filteredGreenhouses.map(g => <option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}
                  </TSelect>
                </FormGroup>
              </FormRow>
              <FormRow>
                <FormGroup label="Campagne (optionnel)">
                  <TSelect value={form.campaign_id ?? ''} onChange={f('campaign_id')}>
                    <option value="">— auto (selon date du mois) —</option>
                    {filteredCampaigns.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                  </TSelect>
                </FormGroup>
              </FormRow>
              <FormGroup label="Notes"><Textarea rows={2} value={form.notes ?? ''} onChange={f('notes')} /></FormGroup>

              {editing && (
                <>
                  <div className="rounded-md border border-warning/30 bg-warning/5 p-md text-caption text-warning flex items-center gap-2">
                    <ArrowUpRight size={14} /> Cession — remplir si l'actif est vendu/cédé
                  </div>
                  <FormRow>
                    <FormGroup label="Date de cession"><TInput type="date" value={form.disposal_date ?? ''} onChange={f('disposal_date')} /></FormGroup>
                    <FormGroup label="Montant de cession (MAD)"><TInput type="number" value={String(form.disposal_amount ?? '')} onChange={f('disposal_amount')} /></FormGroup>
                  </FormRow>
                </>
              )}

              {/* Aperçu calcul */}
              {preview && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-brand/30 bg-brand/5 p-md"
                >
                  <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary mb-sm">
                    Plan d'amortissement (linéaire)
                  </div>
                  <div className="grid grid-cols-3 gap-sm">
                    <div>
                      <div className="font-mono text-[9px] text-fg-tertiary uppercase">Mensuelle</div>
                      <div className="font-display text-heading font-bold text-brand"><MoneyDisplay value={preview.monthly} showCurrency={false} className="!text-current" /></div>
                    </div>
                    <div>
                      <div className="font-mono text-[9px] text-fg-tertiary uppercase">Annuelle</div>
                      <div className="font-display text-heading font-bold text-brand"><MoneyDisplay value={preview.annual} showCurrency={false} className="!text-current" /></div>
                    </div>
                    <div>
                      <div className="font-mono text-[9px] text-fg-tertiary uppercase">Total amortissable</div>
                      <div className="font-display text-heading font-bold text-fg-primary"><MoneyDisplay value={preview.total} showCurrency={false} compact="auto" className="!text-current" /></div>
                    </div>
                  </div>
                  <div className="mt-sm text-caption text-fg-tertiary">
                    {Number(form.useful_life_years) * 12} dotations seront générées automatiquement, du {form.acquisition_date} jusqu'à fin de vie utile.
                  </div>
                </motion.div>
              )}

              <ModalFooter onCancel={() => setModalOpen(false)} onSave={save} loading={saving} saveLabel={editing ? 'ENREGISTRER' : 'CRÉER'} />
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
