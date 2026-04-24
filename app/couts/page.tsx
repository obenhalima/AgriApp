'use client'
import { useEffect, useMemo, useState, Fragment } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { AccountCategory, listAccountCategories, TYPE_LABELS, TYPE_COLORS } from '@/lib/accountCategories'
import {
  CostEntry,
  createCostEntry, createCostEntriesMonthly, createCostEntriesMonthlyBySurface, createCostEntriesBySurface,
  getGreenhousesForSurfaceDistribution, listCostEntries,
  deleteCostEntries,
  SurfaceDistributionGreenhouse,
} from '@/lib/costEntries'
import { BulkEditCostsModal } from '@/components/costs/BulkEditCostsModal'

type Mode = 'single' | 'monthly' | 'surface'
type Tab = 'actual' | 'budget'

type Campaign = { id: string; name: string; code: string; farm_id: string }
type Farm = { id: string; code: string; name: string }
type Greenhouse = { id: string; code: string; name: string; farm_id: string; exploitable_area: number | null; total_area: number | null }

// Types de catégories éligibles pour la saisie des coûts (exclut 'produit')
const CHARGE_TYPES = ['charge_variable', 'charge_fixe', 'amortissement'] as const

export default function CoutsPage() {
  // ── Données ──
  const [items, setItems] = useState<any[]>([])
  const [campagnes, setCampagnes] = useState<Campaign[]>([])
  const [farms, setFarms] = useState<Farm[]>([])
  const [greenhouses, setGreenhouses] = useState<Greenhouse[]>([])
  const [categories, setCategories] = useState<AccountCategory[]>([])
  const [loading, setLoading] = useState(true)

  // ── Onglet actif (coûts réels vs budget prévisionnel) ──
  const [tab, setTab] = useState<Tab>('actual')

  // ── Filtres de la liste ──
  const [filters, setFilters] = useState({
    campaign_id: '',
    farm_id: '',
    greenhouse_id: '',
    charge_type: '' as '' | 'charge_variable' | 'charge_fixe' | 'amortissement',
    date_from: '',
    date_to: '',
    search: '',
  })
  const f = (k: string) => (e: any) => setFilters(v => ({ ...v, [k]: e.target.value }))
  const resetFilters = () => setFilters({
    campaign_id: '', farm_id: '', greenhouse_id: '', charge_type: '', date_from: '', date_to: '', search: '',
  })

  // ── Sélection multiple ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const clearSelection = () => setSelectedIds(new Set())
  const toggleSelection = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  // ── Groupes dépliés ──
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const toggleGroup = (key: string) => setExpandedGroups(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  // ── Tri ──
  const [sortBy, setSortBy] = useState<'entry_date' | 'amount'>('entry_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const toggleSort = (col: 'entry_date' | 'amount') => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
  }

  // ── Modal bulk edit ──
  const [bulkEditOpen, setBulkEditOpen] = useState(false)

  // ── Formulaire ──
  const [modal, setModal] = useState(false)
  const [mode, setMode] = useState<Mode>('single')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({
    campaign_id: '',
    farm_id: '',
    greenhouse_id: '',
    // 3 niveaux :
    //   1) type comptable (charge_variable / charge_fixe / amortissement)
    //   2) catégorie comptable (niveau 2, ex: Intrants, MOD, Loyers…)
    //   3) sous-catégorie (niveau 3, ex: Semences sous Intrants) — facultatif si L2 est déjà une feuille
    charge_type: '' as '' | 'charge_variable' | 'charge_fixe' | 'amortissement',
    parent_category_id: '',
    account_category_id: '',
    amount: '',
    entry_date: '',
    description: '',
    // Répartition mensuelle
    months_count: '12',
    distribution: 'prorata' as 'linear' | 'prorata',
    // Option : combiner répartition mensuelle + surface sur les serres d'une ferme
    monthly_also_surface: false,
    // Répartition par surface
    selected_greenhouse_ids: [] as string[],
  })
  const s = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }))

  // ── Chargement initial ──
  const load = async () => {
    try {
      const [entries, camps, flist, ghs, cats] = await Promise.all([
        listCostEntries({ limit: 300 }),
        supabase.from('campaigns').select('id, name, code, farm_id').order('planting_start', { ascending: false }),
        supabase.from('farms').select('id, code, name').eq('is_active', true).order('name'),
        supabase.from('greenhouses').select('id, code, name, farm_id, exploitable_area, total_area').order('code'),
        listAccountCategories(),
      ])
      setItems(entries)
      setCampagnes((camps.data ?? []) as Campaign[])
      setFarms((flist.data ?? []) as Farm[])
      setGreenhouses((ghs.data ?? []) as Greenhouse[])
      setCategories(cats)
    } catch (e: any) { console.error(e) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // ── Helpers hiérarchie 3 niveaux ──
  // L1 = type (charge_variable / charge_fixe / amortissement)
  // L2 = catégorie comptable (parents de niveau 2)
  // L3 = sous-catégorie (feuilles sous L2) — facultatif si L2 est déjà une feuille

  // Niveau 2 filtré par le type sélectionné
  const parentCategories = useMemo(() => {
    if (!form.charge_type) return []
    return categories
      .filter(c => c.is_active && c.level === 2 && c.type === form.charge_type)
      .sort((a, b) => a.display_order - b.display_order)
  }, [categories, form.charge_type])

  // Enfants (feuilles) d'une catégorie parente
  const childrenOf = (parentId: string) =>
    categories.filter(c => c.is_active && c.parent_id === parentId)
      .sort((a, b) => a.display_order - b.display_order)

  const selectedParent = useMemo(
    () => categories.find(c => c.id === form.parent_category_id),
    [categories, form.parent_category_id]
  )

  const subCategories = useMemo(
    () => form.parent_category_id ? childrenOf(form.parent_category_id) : [],
    [categories, form.parent_category_id]
  )

  // Si le "parent" est lui-même une feuille (ex: MOD, LOYER_FERMES), il n'y a pas de sous-catégorie
  const parentIsLeaf = useMemo(() => subCategories.length === 0 && !!selectedParent, [subCategories, selectedParent])

  const categoryById = useMemo(() => {
    const m = new Map<string, AccountCategory>()
    categories.forEach(c => m.set(c.id, c))
    return m
  }, [categories])

  // Changer le type comptable (L1) : réinitialise L2 et L3
  const onChangeChargeType = (t: string) => {
    setForm(f => ({
      ...f,
      charge_type: (t as any) || '',
      parent_category_id: '',
      account_category_id: '',
    }))
  }

  // Si on change de catégorie (L2) et que celle-ci est une feuille, on assigne automatiquement account_category_id
  const onChangeParentCategory = (parentId: string) => {
    const children = categories.filter(c => c.is_active && c.parent_id === parentId)
    if (children.length === 0) {
      // L2 est une feuille directement (ex: MOD, LOYER_FERMES)
      setForm(f => ({ ...f, parent_category_id: parentId, account_category_id: parentId }))
    } else {
      // Reset L3 pour forcer la sélection
      setForm(f => ({ ...f, parent_category_id: parentId, account_category_id: '' }))
    }
  }

  const ghsForFarm = useMemo(() =>
    form.farm_id ? greenhouses.filter(g => g.farm_id === form.farm_id) : [],
    [greenhouses, form.farm_id])

  const onChangeCampaign = (campaignId: string) => {
    const camp = campagnes.find(c => c.id === campaignId)
    const farm_id = camp?.farm_id || form.farm_id
    const currentGh = greenhouses.find(g => g.id === form.greenhouse_id)
    const keepGh = currentGh && currentGh.farm_id === farm_id ? form.greenhouse_id : ''
    setForm(f => ({ ...f, campaign_id: campaignId, farm_id, greenhouse_id: keepGh, selected_greenhouse_ids: [] }))
  }

  const onChangeFarm = (farmId: string) => {
    setForm(f => ({ ...f, farm_id: farmId, greenhouse_id: '', selected_greenhouse_ids: [] }))
  }

  const toggleGreenhouseSelection = (id: string) => {
    setForm(f => ({
      ...f,
      selected_greenhouse_ids: f.selected_greenhouse_ids.includes(id)
        ? f.selected_greenhouse_ids.filter(x => x !== id)
        : [...f.selected_greenhouse_ids, id],
    }))
  }

  // ── Sauvegarde ──
  const save = async () => {
    const baseValid = form.campaign_id && form.account_category_id && form.amount && form.entry_date
    if (!baseValid) return

    setSaving(true)
    try {
      const base = {
        campaign_id: form.campaign_id,
        account_category_id: form.account_category_id,
        description: form.description || null,
        is_planned: tab === 'budget',  // auto-déduit de l'onglet actif
      }

      if (mode === 'single') {
        await createCostEntry({
          ...base,
          greenhouse_id: form.greenhouse_id || null,
          amount: Number(form.amount),
          entry_date: form.entry_date,
        })
      } else if (mode === 'monthly') {
        if (form.monthly_also_surface) {
          // Mensuel × Surface combiné
          if (!form.farm_id) throw new Error('Ferme requise pour la répartition par surface')
          const ghs = await getGreenhousesForSurfaceDistribution(form.farm_id)
          if (ghs.length === 0) throw new Error('Aucune serre dans cette ferme')
          const selected = form.selected_greenhouse_ids.length > 0 ? form.selected_greenhouse_ids : ghs.map(g => g.id)
          const res = await createCostEntriesMonthlyBySurface({
            ...base,
            total_amount: Number(form.amount),
          }, {
            startDate: form.entry_date,
            months: Number(form.months_count) || 12,
            distribution: form.distribution,
          }, ghs, selected)
          console.log(`Mensuel × surface : ${res.created.length} entrées`)
        } else {
          const res = await createCostEntriesMonthly({
            ...base,
            greenhouse_id: form.greenhouse_id || null,
            total_amount: Number(form.amount),
          }, {
            startDate: form.entry_date,
            months: Number(form.months_count) || 12,
            distribution: form.distribution,
          })
          console.log(`Répartition mensuelle : ${res.created.length} entrées, total ${res.totalDistributed}`)
        }
      } else if (mode === 'surface') {
        if (!form.farm_id) throw new Error('Ferme requise pour la répartition par surface')
        const ghs = await getGreenhousesForSurfaceDistribution(form.farm_id)
        if (ghs.length === 0) throw new Error('Aucune serre dans cette ferme')
        const selected = form.selected_greenhouse_ids.length > 0 ? form.selected_greenhouse_ids : ghs.map(g => g.id)
        const res = await createCostEntriesBySurface({
          ...base,
          total_amount: Number(form.amount),
          entry_date: form.entry_date,
        }, ghs, selected)
        console.log(`Répartition surface : ${res.created.length} entrées`)
      }

      setDone(true)
      await load()
      setTimeout(() => {
        setModal(false); setDone(false)
        setForm({
          campaign_id:'', farm_id:'', greenhouse_id:'',
          charge_type: '', parent_category_id:'', account_category_id:'',
          amount:'', entry_date:'', description:'',
          months_count:'12', distribution:'prorata',
          monthly_also_surface: false, selected_greenhouse_ids:[],
        })
      }, 1400)
    } catch (e: any) { alert('Erreur : ' + e.message) }
    setSaving(false)
  }

  // ── Totaux KPI ──
  const totalReel = items.filter(i => !i.is_planned).reduce((s, i) => s + (i.amount || 0), 0)
  const totalPrev = items.filter(i => i.is_planned).reduce((s, i) => s + (i.amount || 0), 0)
  const countReel = items.filter(i => !i.is_planned).length
  const countPrev = items.filter(i => i.is_planned).length
  const notCategorized = items.filter(i => !i.account_category_id).length

  // Filtrage : onglet + filtres utilisateur
  const filteredItems = useMemo(() => {
    const search = filters.search.trim().toLowerCase()
    return items.filter((i: any) => {
      if (tab === 'actual' && i.is_planned) return false
      if (tab === 'budget' && !i.is_planned) return false
      if (filters.campaign_id && i.campaign_id !== filters.campaign_id) return false
      if (filters.greenhouse_id && i.greenhouse_id !== filters.greenhouse_id) return false
      if (filters.farm_id) {
        const ghFarm = i.greenhouses?.farm_id
        const campFarm = campagnes.find(c => c.id === i.campaign_id)?.farm_id
        if (ghFarm !== filters.farm_id && campFarm !== filters.farm_id) return false
      }
      if (filters.charge_type && i.account_categories?.type !== filters.charge_type) return false
      if (filters.date_from && i.entry_date < filters.date_from) return false
      if (filters.date_to && i.entry_date > filters.date_to) return false
      if (search) {
        const hay = [i.description, i.account_categories?.label, i.campaigns?.name, i.greenhouses?.code].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(search)) return false
      }
      return true
    })
  }, [items, tab, filters, campagnes])

  // Tri
  const sortedItems = useMemo(() => {
    const arr = [...filteredItems]
    arr.sort((a, b) => {
      let va: any = a[sortBy]; let vb: any = b[sortBy]
      if (sortBy === 'amount') { va = Number(va || 0); vb = Number(vb || 0) }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return arr
  }, [filteredItems, sortBy, sortDir])

  // Groupage hiérarchique 3 niveaux :
  //   L1 = type racine (Charges variables / Charges fixes / Amortissements)
  //   L2 = catégorie comptable (Intrants, MOD, Loyer, Énergie...)
  //   L3 = sous-catégorie (Semences, Plants, Électricité...) — optionnel
  type Level3Group = { catId: string; label: string; total: number; entries: any[] }
  type Level2Group = { catId: string; label: string; total: number; isLeaf: boolean; entries: any[]; children: Map<string, Level3Group> }
  type Level1Group = { catId: string; label: string; type: string; total: number; totalCount: number; children: Map<string, Level2Group> }

  const groupedItems = useMemo(() => {
    const l1groups = new Map<string, Level1Group>()

    for (const e of sortedItems) {
      const cat = e.account_categories
      if (!cat) continue

      // Remonte au racine (level 1) via la chaîne de parents
      const chain: any[] = [cat]
      let current = cat
      while (current.parent_id) {
        const parent = categoryById.get(current.parent_id)
        if (!parent) break
        chain.unshift(parent)
        current = parent as any
      }
      if (chain.length === 0) continue

      const l1 = chain[0]
      const l2 = chain.length >= 2 ? chain[1] : null
      const l3 = chain.length >= 3 ? chain[2] : null

      // L1
      let g1 = l1groups.get(l1.id)
      if (!g1) {
        g1 = { catId: l1.id, label: l1.label, type: l1.type, total: 0, totalCount: 0, children: new Map() }
        l1groups.set(l1.id, g1)
      }
      g1.total += Number(e.amount || 0)
      g1.totalCount += 1

      if (!l2) continue

      // L2
      let g2 = g1.children.get(l2.id)
      if (!g2) {
        g2 = { catId: l2.id, label: l2.label, total: 0, isLeaf: !l3, entries: [], children: new Map() }
        g1.children.set(l2.id, g2)
      }
      g2.total += Number(e.amount || 0)

      if (!l3) {
        g2.entries.push(e)
      } else {
        let g3 = g2.children.get(l3.id)
        if (!g3) {
          g3 = { catId: l3.id, label: l3.label, total: 0, entries: [] }
          g2.children.set(l3.id, g3)
        }
        g3.total += Number(e.amount || 0)
        g3.entries.push(e)
      }
    }
    return Array.from(l1groups.values()).sort((a, b) => a.type.localeCompare(b.type))
  }, [sortedItems, categoryById])

  const expandAll = () => {
    const keys = new Set<string>()
    groupedItems.forEach(g1 => {
      keys.add(g1.catId)
      g1.children.forEach(g2 => {
        keys.add(g2.catId)
        g2.children.forEach(g3 => keys.add(g3.catId))
      })
    })
    setExpandedGroups(keys)
  }
  const collapseAll = () => setExpandedGroups(new Set())

  // Helper : liste plate des entries visibles (pour "select all")
  const visibleEntryIds = useMemo(() => sortedItems.map((e: any) => e.id as string), [sortedItems])

  // Greenhouse filtrée pour le filtre Serre (dépend de la ferme)
  const filterGhsForFarm = useMemo(
    () => filters.farm_id ? greenhouses.filter(g => g.farm_id === filters.farm_id) : greenhouses,
    [greenhouses, filters.farm_id]
  )

  // Action : supprimer la sélection
  const bulkDelete = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Supprimer ${selectedIds.size} entrée(s) ? Cette action est irréversible.`)) return
    try {
      const n = await deleteCostEntries(Array.from(selectedIds))
      alert(`${n} entrée(s) supprimée(s).`)
      clearSelection()
      await load()
    } catch (e: any) { alert('Erreur : ' + e.message) }
  }

  // ── Preview calcul répartition ──
  const monthlyPreview = useMemo(() => {
    if (mode !== 'monthly' || !form.amount || !form.entry_date) return null
    const total = Number(form.amount)
    const n = Number(form.months_count) || 12
    return { total, n, avg: total / n }
  }, [mode, form.amount, form.months_count, form.entry_date])

  const surfaceBreakdown = useMemo(() => {
    if (mode !== 'surface' || !form.amount || ghsForFarm.length === 0) return []
    const total = Number(form.amount)
    const selected = form.selected_greenhouse_ids.length > 0
      ? ghsForFarm.filter(g => form.selected_greenhouse_ids.includes(g.id))
      : ghsForFarm
    const totalSurface = selected.reduce((s, g) => s + Number(g.exploitable_area || g.total_area || 0), 0)
    if (totalSurface <= 0) return []
    return selected.map(g => {
      const surface = Number(g.exploitable_area || g.total_area || 0)
      return {
        id: g.id, code: g.code, name: g.name, surface,
        share: surface / totalSurface,
        amount: total * surface / totalSurface,
      }
    })
  }, [mode, form.amount, form.selected_greenhouse_ids, ghsForFarm])

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      {modal && (
        <Modal title={(() => {
          const prefix = tab === 'budget' ? 'BUDGET — ' : 'COÛT — '
          const label  = mode === 'single' ? 'SAISIE UNIQUE' : mode === 'monthly' ? 'RÉPARTITION MENSUELLE' : 'RÉPARTITION PAR SURFACE'
          return prefix + label
        })()} onClose={() => { setModal(false); setDone(false) }} size="lg">
          {done ? <SuccessMessage message="Coût(s) enregistré(s) !" /> : (<>
            {/* Sélecteur de mode */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 14, padding: 3, background: 'var(--bg-deep)', borderRadius: 8, border: '1px solid var(--bd-1)' }}>
              {([
                { k: 'single',  l: 'Ligne simple',    h: 'Un seul enregistrement' },
                { k: 'monthly', l: 'Mensuel',         h: 'Étale un montant sur N mois' },
                { k: 'surface', l: 'Par surface',     h: 'Répartit sur les serres au prorata des m²' },
              ] as const).map(m => (
                <button key={m.k} onClick={() => setMode(m.k)} title={m.h}
                  style={{
                    flex: 1, padding: '7px 10px',
                    border: 'none',
                    background: mode === m.k ? 'var(--bg-base)' : 'transparent',
                    color: mode === m.k ? 'var(--neon)' : 'var(--tx-3)',
                    borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)',
                    fontWeight: mode === m.k ? 700 : 400, letterSpacing: .5,
                  }}>
                  {m.l}
                </button>
              ))}
            </div>

            <FormRow>
              <FormGroup label="Campagne *">
                <Select value={form.campaign_id} onChange={e => onChangeCampaign(e.target.value)}>
                  <option value="">-- Sélectionner --</option>
                  {campagnes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label={mode === 'surface' ? 'Ferme *' : 'Ferme'}>
                <Select value={form.farm_id} onChange={e => onChangeFarm(e.target.value)}>
                  <option value="">-- Sélectionner --</option>
                  {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Select>
              </FormGroup>
            </FormRow>

            {/* Serre unique — visible en mode single ou monthly */}
            {(mode === 'single' || mode === 'monthly') && (
              <FormGroup label="Serre (optionnel)">
                <Select value={form.greenhouse_id} onChange={s('greenhouse_id')} disabled={!form.farm_id && ghsForFarm.length === 0}>
                  <option value="">{form.farm_id ? 'Niveau ferme (toutes serres)' : 'Choisissez une ferme d\'abord ou niveau ferme'}</option>
                  {ghsForFarm.map(g => <option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}
                </Select>
              </FormGroup>
            )}

            <FormRow>
              <FormGroup label="Type comptable *">
                <Select value={form.charge_type} onChange={e => onChangeChargeType(e.target.value)}>
                  <option value="">-- Sélectionner --</option>
                  <option value="charge_variable">Charge variable</option>
                  <option value="charge_fixe">Charge fixe</option>
                  <option value="amortissement">Amortissement</option>
                </Select>
              </FormGroup>
              <FormGroup label="Catégorie comptable *">
                <Select value={form.parent_category_id} onChange={e => onChangeParentCategory(e.target.value)} disabled={!form.charge_type}>
                  <option value="">{form.charge_type ? '-- Sélectionner --' : 'Choisir type d\'abord'}</option>
                  {parentCategories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.label} ({c.code})
                    </option>
                  ))}
                </Select>
              </FormGroup>
              <FormGroup label={parentIsLeaf ? 'Sous-catégorie (auto)' : 'Sous-catégorie *'}>
                {parentIsLeaf ? (
                  <div style={{ padding: '8px 10px', background: 'var(--bg-deep)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>
                    {selectedParent?.label} (pas de sous-niveau)
                  </div>
                ) : (
                  <Select value={form.account_category_id} onChange={s('account_category_id')} disabled={!form.parent_category_id}>
                    <option value="">{form.parent_category_id ? '-- Sélectionner --' : 'Choisir catégorie d\'abord'}</option>
                    {subCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.label} ({c.code})</option>
                    ))}
                  </Select>
                )}
              </FormGroup>
            </FormRow>

            <FormRow>
              <FormGroup label={mode === 'single' ? 'Montant (MAD) *' : 'Montant total (MAD) *'}>
                <Input type="number" value={form.amount} onChange={s('amount')} placeholder="ex: 15000" step={0.01} />
              </FormGroup>
              <FormGroup label={mode === 'monthly' ? 'Date début *' : 'Date *'}>
                <Input type="date" value={form.entry_date} onChange={s('entry_date')} />
              </FormGroup>
            </FormRow>

            {/* Options spécifiques au mode mensuel */}
            {mode === 'monthly' && (
              <>
                <FormRow>
                  <FormGroup label="Nombre de mois *">
                    <Input type="number" value={form.months_count} onChange={s('months_count')} min={1} max={36} />
                  </FormGroup>
                  <FormGroup label="Mode de distribution">
                    <Select value={form.distribution} onChange={s('distribution')}>
                      <option value="prorata">Prorata des jours</option>
                      <option value="linear">Parts égales</option>
                    </Select>
                  </FormGroup>
                </FormRow>

                {/* Option : combiner avec répartition par surface */}
                <div style={{ padding: 10, marginBottom: 8, background: 'var(--bg-deep)', border: '1px solid var(--bd-1)', borderRadius: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.monthly_also_surface}
                      onChange={e => setForm(f => ({ ...f, monthly_also_surface: e.target.checked, greenhouse_id: e.target.checked ? '' : f.greenhouse_id }))}
                      style={{ marginTop: 3 }} />
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--tx-1)', fontWeight: 600 }}>
                        Répartir aussi par serre au prorata des surfaces
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--tx-3)', marginTop: 2 }}>
                        Le montant sera d'abord distribué sur les mois, puis pour chaque mois, réparti sur les serres de la ferme au prorata de leur surface exploitable. Crée <strong>N mois × G serres</strong> entrées.
                      </div>
                    </div>
                  </label>
                </div>

                {monthlyPreview && monthlyPreview.total > 0 && !form.monthly_also_surface && (
                  <div style={{ padding: '10px 14px', background: 'var(--neon-dim)', border: '1px solid color-mix(in srgb, var(--neon) 30%, transparent)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neon)', marginBottom: 4 }}>
                    → <strong>{monthlyPreview.n}</strong> entrées créées · montant moyen <strong>{monthlyPreview.avg.toLocaleString('fr', { maximumFractionDigits: 2 })} MAD/mois</strong>
                  </div>
                )}

                {/* Liste des serres si combiné actif */}
                {form.monthly_also_surface && (
                  <>
                    {!form.farm_id ? (
                      <div style={{ padding: '10px 14px', background: 'color-mix(in srgb, var(--amber) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--amber) 30%, transparent)', borderRadius: 8, fontSize: 11, color: 'var(--amber)' }}>
                        ⚠ Sélectionnez une ferme pour afficher ses serres.
                      </div>
                    ) : ghsForFarm.length === 0 ? (
                      <div style={{ padding: '10px 14px', background: 'var(--red-dim)', border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', borderRadius: 8, fontSize: 11, color: 'var(--red)' }}>
                        ⚠ Cette ferme n'a aucune serre.
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 6, letterSpacing: 1 }}>
                          SERRES À INCLURE ({form.selected_greenhouse_ids.length || ghsForFarm.length} / {ghsForFarm.length})
                        </div>
                        <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--bd-1)', borderRadius: 6, marginBottom: 8 }}>
                          <table className="tbl" style={{ width: '100%' }}>
                            <thead>
                              <tr>
                                <th style={{ width: 40 }}>
                                  <input type="checkbox"
                                    checked={form.selected_greenhouse_ids.length === 0 || form.selected_greenhouse_ids.length === ghsForFarm.length}
                                    onChange={e => setForm(f => ({ ...f, selected_greenhouse_ids: e.target.checked ? [] : ghsForFarm.map(g => g.id) }))} />
                                </th>
                                <th>Serre</th>
                                <th style={{ textAlign: 'right' }}>Surface (m²)</th>
                                <th style={{ textAlign: 'right' }}>Part</th>
                                <th style={{ textAlign: 'right' }}>Total / mois</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                const selected = form.selected_greenhouse_ids.length > 0
                                  ? ghsForFarm.filter(g => form.selected_greenhouse_ids.includes(g.id))
                                  : ghsForFarm
                                const totalSurf = selected.reduce((s, g) => s + Number(g.exploitable_area || g.total_area || 0), 0)
                                const monthlyAvg = monthlyPreview ? monthlyPreview.avg : 0
                                return ghsForFarm.map(g => {
                                  const included = form.selected_greenhouse_ids.length === 0 || form.selected_greenhouse_ids.includes(g.id)
                                  const surface = Number(g.exploitable_area || g.total_area || 0)
                                  const share = included && totalSurf > 0 ? surface / totalSurf : 0
                                  const amtPerMonth = monthlyAvg * share
                                  return (
                                    <tr key={g.id} style={{ opacity: included ? 1 : 0.4 }}>
                                      <td>
                                        <input type="checkbox"
                                          checked={form.selected_greenhouse_ids.length === 0 ? true : form.selected_greenhouse_ids.includes(g.id)}
                                          onChange={() => toggleGreenhouseSelection(g.id)} />
                                      </td>
                                      <td><strong>{g.code}</strong> · {g.name}</td>
                                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{surface.toLocaleString('fr')}</td>
                                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>
                                        {share ? `${(share * 100).toFixed(1)}%` : '—'}
                                      </td>
                                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neon)', fontWeight: 600 }}>
                                        {amtPerMonth ? amtPerMonth.toLocaleString('fr', { maximumFractionDigits: 2 }) : '—'}
                                      </td>
                                    </tr>
                                  )
                                })
                              })()}
                            </tbody>
                          </table>
                        </div>
                        {monthlyPreview && monthlyPreview.total > 0 && (
                          <div style={{ padding: '10px 14px', background: 'var(--neon-dim)', border: '1px solid color-mix(in srgb, var(--neon) 30%, transparent)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neon)', marginBottom: 4 }}>
                            → <strong>{monthlyPreview.n} mois × {form.selected_greenhouse_ids.length || ghsForFarm.length} serres = {monthlyPreview.n * (form.selected_greenhouse_ids.length || ghsForFarm.length)}</strong> entrées créées
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {/* Options spécifiques au mode surface */}
            {mode === 'surface' && (
              <>
                {!form.farm_id ? (
                  <div style={{ padding: '10px 14px', background: 'color-mix(in srgb, var(--amber) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--amber) 30%, transparent)', borderRadius: 8, fontSize: 11, color: 'var(--amber)' }}>
                    ⚠ Sélectionnez une ferme pour afficher ses serres.
                  </div>
                ) : ghsForFarm.length === 0 ? (
                  <div style={{ padding: '10px 14px', background: 'var(--red-dim)', border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', borderRadius: 8, fontSize: 11, color: 'var(--red)' }}>
                    ⚠ Cette ferme n'a aucune serre.
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 6, letterSpacing: 1 }}>
                      SERRES À INCLURE ({form.selected_greenhouse_ids.length || ghsForFarm.length} / {ghsForFarm.length})
                    </div>
                    <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--bd-1)', borderRadius: 6 }}>
                      <table className="tbl" style={{ width: '100%' }}>
                        <thead>
                          <tr>
                            <th style={{ width: 40 }}>
                              <input type="checkbox"
                                checked={form.selected_greenhouse_ids.length === 0 || form.selected_greenhouse_ids.length === ghsForFarm.length}
                                onChange={e => setForm(f => ({ ...f, selected_greenhouse_ids: e.target.checked ? [] : ghsForFarm.map(g => g.id) }))}
                              />
                            </th>
                            <th>Serre</th>
                            <th style={{ textAlign: 'right' }}>Surface (m²)</th>
                            <th style={{ textAlign: 'right' }}>Part</th>
                            <th style={{ textAlign: 'right' }}>Montant</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(surfaceBreakdown.length > 0 ? surfaceBreakdown : ghsForFarm.map(g => ({ id: g.id, code: g.code, name: g.name, surface: Number(g.exploitable_area || g.total_area || 0), share: 0, amount: 0 }))).map(row => {
                            const included = form.selected_greenhouse_ids.length === 0 || form.selected_greenhouse_ids.includes(row.id)
                            return (
                              <tr key={row.id} style={{ opacity: included ? 1 : 0.4 }}>
                                <td>
                                  <input type="checkbox"
                                    checked={form.selected_greenhouse_ids.length === 0 ? true : form.selected_greenhouse_ids.includes(row.id)}
                                    onChange={() => toggleGreenhouseSelection(row.id)} />
                                </td>
                                <td><strong>{row.code}</strong> · {row.name}</td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{row.surface.toLocaleString('fr')}</td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>
                                  {row.share ? `${(row.share * 100).toFixed(1)}%` : '—'}
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neon)', fontWeight: 600 }}>
                                  {row.amount ? row.amount.toLocaleString('fr', { maximumFractionDigits: 2 }) : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}

            <FormGroup label="Description">
              <Input value={form.description} onChange={s('description')} placeholder="ex: Achat NPK 20-20-20 — 500 kg" />
            </FormGroup>

            <ModalFooter
              onCancel={() => setModal(false)}
              onSave={save}
              loading={saving}
              disabled={!form.campaign_id || !form.account_category_id || !form.amount || !form.entry_date || (mode === 'surface' && !form.farm_id) || (mode === 'monthly' && form.monthly_also_surface && !form.farm_id)}
              saveLabel={mode === 'single' ? 'Enregistrer' : mode === 'monthly' ? (form.monthly_also_surface ? 'Répartir mois × serres' : 'Répartir sur les mois') : 'Répartir sur les serres'}
            />
          </>)}
        </Modal>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div className="page-title">COÛTS & BUDGET</div>
          <div className="page-sub">
            {items.length} entrée(s) au total
            {notCategorized > 0 && <span style={{ color: 'var(--amber)', marginLeft: 8 }}>· {notCategorized} non catégorisée(s)</span>}
          </div>
        </div>
        <button className="btn-primary" onClick={() => setModal(true)}>
          {tab === 'actual' ? '+ SAISIR UN COÛT' : '+ SAISIR UN BUDGET'}
        </button>
      </div>

      {/* Onglets Coûts réels / Budget prévisionnel */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 14, borderBottom: '1px solid var(--bd-1)' }}>
        {([
          { k: 'actual', l: 'COÛTS RÉELS',         count: countReel, total: totalReel, color: 'var(--neon)' },
          { k: 'budget', l: 'BUDGET PRÉVISIONNEL', count: countPrev, total: totalPrev, color: 'var(--blue)' },
        ] as const).map(t => {
          const active = tab === t.k
          return (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{
                padding: '10px 18px',
                background: active ? 'var(--bg-deep)' : 'transparent',
                color: active ? t.color : 'var(--tx-3)',
                border: 'none',
                borderBottom: active ? `2px solid ${t.color}` : '2px solid transparent',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                letterSpacing: 1,
                fontWeight: active ? 700 : 400,
                marginBottom: -1,
              }}>
              {t.l} <span style={{ opacity: .6, marginLeft: 6 }}>({t.count})</span>
            </button>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 18 }}>
        {[
          {
            l: tab === 'actual' ? 'Total réels' : 'Total budget',
            v: `${((tab === 'actual' ? totalReel : totalPrev) / 1000).toFixed(2)} kMAD`,
            c: tab === 'actual' ? 'var(--neon)' : 'var(--blue)'
          },
          {
            l: 'Entrées affichées',
            v: String(filteredItems.length),
            c: 'var(--amber)'
          },
          {
            l: 'Écart budget → réel',
            v: totalPrev > 0 ? `${(((totalReel - totalPrev) / totalPrev) * 100).toFixed(1)}%` : '—',
            c: totalReel > totalPrev ? 'var(--red)' : 'var(--neon)'
          },
        ].map((k, i) => (
          <div key={i} className="kpi" style={{ '--accent': k.c } as any}>
            <div className="kpi-label">{k.l}</div>
            <div className="kpi-value" style={{ color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* ── FILTRES ── */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: 1.5, marginBottom: 10, fontWeight: 700 }}>
          🔍 FILTRES
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
        <div>
          <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 3, letterSpacing: 1 }}>CAMPAGNE</div>
          <select value={filters.campaign_id} onChange={f('campaign_id')} style={{ width: '100%', padding: 6, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 5, fontSize: 11 }}>
            <option value="">Toutes</option>
            {campagnes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 3, letterSpacing: 1 }}>FERME</div>
          <select value={filters.farm_id} onChange={e => setFilters(v => ({ ...v, farm_id: e.target.value, greenhouse_id: '' }))} style={{ width: '100%', padding: 6, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 5, fontSize: 11 }}>
            <option value="">Toutes</option>
            {farms.map(fr => <option key={fr.id} value={fr.id}>{fr.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 3, letterSpacing: 1 }}>SERRE</div>
          <select value={filters.greenhouse_id} onChange={f('greenhouse_id')} disabled={!filters.farm_id} style={{ width: '100%', padding: 6, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 5, fontSize: 11, opacity: filters.farm_id ? 1 : 0.4 }}>
            <option value="">Toutes</option>
            {filterGhsForFarm.map(g => <option key={g.id} value={g.id}>{g.code}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 3, letterSpacing: 1 }}>TYPE</div>
          <select value={filters.charge_type} onChange={f('charge_type')} style={{ width: '100%', padding: 6, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 5, fontSize: 11 }}>
            <option value="">Tous</option>
            <option value="charge_variable">Charge variable</option>
            <option value="charge_fixe">Charge fixe</option>
            <option value="amortissement">Amortissement</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 3, letterSpacing: 1 }}>DATE DE</div>
          <input type="date" value={filters.date_from} onChange={f('date_from')} style={{ width: '100%', padding: 6, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 5, fontSize: 11 }} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 3, letterSpacing: 1 }}>DATE À</div>
          <input type="date" value={filters.date_to} onChange={f('date_to')} style={{ width: '100%', padding: 6, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 5, fontSize: 11 }} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 3, letterSpacing: 1 }}>RECHERCHE</div>
          <input value={filters.search} onChange={f('search')} placeholder="Description, catégorie…" style={{ width: '100%', padding: 6, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 5, fontSize: 11 }} />
        </div>
          <button onClick={resetFilters} title="Réinitialiser les filtres"
            style={{ padding: '7px 12px', background: 'transparent', border: '1px solid var(--bd-1)', color: 'var(--tx-2)', borderRadius: 6, cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap', height: 32, alignSelf: 'end' }}>
            ↻ Reset
          </button>
        </div>
      </div>

      {/* ── BARRE D'ACTIONS BULK ── */}
      {selectedIds.size > 0 && (
        <div style={{ padding: 10, marginBottom: 10, background: 'var(--neon-dim)', border: '1px solid color-mix(in srgb, var(--neon) 40%, transparent)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--neon)', fontWeight: 600 }}>
            ✓ {selectedIds.size} entrée(s) sélectionnée(s)
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={() => setBulkEditOpen(true)}
            style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--neon)50', color: 'var(--neon)', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
            ✎ Modifier
          </button>
          <button onClick={bulkDelete}
            style={{ padding: '6px 12px', background: 'color-mix(in srgb, var(--red) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 50%, transparent)', color: 'var(--red)', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
            🗑 Supprimer
          </button>
          <button onClick={clearSelection}
            style={{ padding: '6px 10px', background: 'transparent', border: 'none', color: 'var(--tx-3)', cursor: 'pointer', fontSize: 11 }}>
            ✕ Effacer
          </button>
        </div>
      )}

      {/* ── TOOLBAR TRI / DÉPLIER ── */}
      <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--tx-3)' }}>Trier par :</span>
        {([
          { k: 'entry_date', l: 'Date' },
          { k: 'amount',     l: 'Montant' },
        ] as const).map(c => {
          const active = sortBy === c.k
          return (
            <button key={c.k} onClick={() => toggleSort(c.k)}
              style={{ padding: '4px 10px', border: `1px solid ${active ? 'var(--neon)' : 'var(--bd-1)'}`, background: active ? 'var(--neon-dim)' : 'transparent', color: active ? 'var(--neon)' : 'var(--tx-2)', borderRadius: 5, cursor: 'pointer', fontSize: 11 }}>
              {c.l} {active && (sortDir === 'asc' ? '↑' : '↓')}
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        <button onClick={expandAll} style={{ padding: '4px 10px', background: 'transparent', border: '1px solid var(--bd-1)', color: 'var(--tx-2)', borderRadius: 5, cursor: 'pointer', fontSize: 11 }}>
          ⇓ Tout déplier
        </button>
        <button onClick={collapseAll} style={{ padding: '4px 10px', background: 'transparent', border: '1px solid var(--bd-1)', color: 'var(--tx-2)', borderRadius: 5, cursor: 'pointer', fontSize: 11 }}>
          ⇑ Tout replier
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--tx-3)' }}>CHARGEMENT...</div>
      ) : sortedItems.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">💰</div>
          <div className="empty-title">
            {tab === 'actual' ? 'Aucun coût réel' : 'Aucun budget prévisionnel'} {Object.values(filters).some(v => v) ? '(filtres actifs)' : ''}
          </div>
          <button className="btn-primary" onClick={() => setModal(true)}>
            {tab === 'actual' ? '+ Saisir un coût' : '+ Saisir un budget'}
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl" style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox"
                      checked={visibleEntryIds.length > 0 && visibleEntryIds.every(id => selectedIds.has(id))}
                      onChange={e => {
                        if (e.target.checked) setSelectedIds(new Set(visibleEntryIds))
                        else clearSelection()
                      }} />
                  </th>
                  <th>Catégorie / Sous-catégorie / Date</th>
                  <th>Campagne</th>
                  <th>Serre</th>
                  <th style={{ textAlign: 'right' }}>Montant (MAD)</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Rendu aplati sur 3 niveaux (L1 = type, L2 = catégorie, L3 = sous-catégorie)
                  const rows: React.ReactNode[] = []
                  for (const g1 of groupedItems) {
                    const l1Color = TYPE_COLORS[g1.type as keyof typeof TYPE_COLORS] || 'var(--tx-3)'
                    const l1Expanded = expandedGroups.has(g1.catId)

                    // HEADER LEVEL 1 (type)
                    rows.push(
                      <tr key={`h1-${g1.catId}`} style={{ background: `${l1Color}12`, cursor: 'pointer', borderTop: '2px solid var(--bd-1)' }} onClick={() => toggleGroup(g1.catId)}>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 13, color: l1Color, fontWeight: 700 }}>{l1Expanded ? '▾' : '▸'}</span>
                        </td>
                        <td colSpan={3}>
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: l1Color, marginRight: 8 }} />
                          <strong style={{ fontSize: 14, color: l1Color, textTransform: 'uppercase', letterSpacing: .5 }}>{g1.label}</strong>
                          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>
                            ({g1.totalCount})
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 800, color: l1Color }}>
                          {g1.total.toLocaleString('fr', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td></td>
                      </tr>
                    )

                    if (!l1Expanded) continue

                    // LEVEL 2
                    const sortedL2 = Array.from(g1.children.values()).sort((a, b) => a.label.localeCompare(b.label))
                    for (const g2 of sortedL2) {
                      const l2Count = g2.isLeaf ? g2.entries.length : Array.from(g2.children.values()).reduce((s, c) => s + c.entries.length, 0)
                      const l2Expanded = expandedGroups.has(g2.catId)

                      rows.push(
                        <tr key={`h2-${g2.catId}`} style={{ background: 'var(--bg-deep)', cursor: 'pointer' }} onClick={() => toggleGroup(g2.catId)}>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: 12, color: 'var(--tx-2)' }}>{l2Expanded ? '▾' : '▸'}</span>
                          </td>
                          <td colSpan={3} style={{ paddingLeft: 24 }}>
                            <strong style={{ fontSize: 13, color: 'var(--tx-1)' }}>{g2.label}</strong>
                            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>
                              ({l2Count})
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--tx-1)' }}>
                            {g2.total.toLocaleString('fr', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td></td>
                        </tr>
                      )

                      if (!l2Expanded) continue

                      if (g2.isLeaf) {
                        for (const e of g2.entries) {
                          rows.push(renderEntryRow(e, selectedIds, toggleSelection, 2))
                        }
                      } else {
                        // LEVEL 3
                        const sortedL3 = Array.from(g2.children.values()).sort((a, b) => a.label.localeCompare(b.label))
                        for (const g3 of sortedL3) {
                          const l3Expanded = expandedGroups.has(g3.catId)
                          rows.push(
                            <tr key={`h3-${g3.catId}`} style={{ background: 'color-mix(in srgb, var(--bg-deep) 40%, transparent)', cursor: 'pointer' }} onClick={() => toggleGroup(g3.catId)}>
                              <td></td>
                              <td colSpan={3} style={{ paddingLeft: 44 }}>
                                <span style={{ fontSize: 11, color: 'var(--tx-2)', marginRight: 6 }}>{l3Expanded ? '▾' : '▸'}</span>
                                <span style={{ fontSize: 12, color: 'var(--tx-2)' }}>{g3.label}</span>
                                <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>
                                  ({g3.entries.length})
                                </span>
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--tx-2)' }}>
                                {g3.total.toLocaleString('fr', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td></td>
                            </tr>
                          )
                          if (l3Expanded) {
                            for (const e of g3.entries) {
                              rows.push(renderEntryRow(e, selectedIds, toggleSelection, 3))
                            }
                          }
                        }
                      }
                    }
                  }
                  return rows
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal bulk edit */}
      {bulkEditOpen && (
        <BulkEditCostsModal
          selectedIds={Array.from(selectedIds)}
          campaigns={campagnes}
          categories={categories}
          farms={farms}
          greenhouses={greenhouses}
          onClose={() => setBulkEditOpen(false)}
          onSaved={async () => { clearSelection(); await load() }}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Rendu d'une ligne d'entrée (avec case à cocher + indentation)
// ══════════════════════════════════════════════════════════════
function renderEntryRow(e: any, selectedIds: Set<string>, toggleSelection: (id: string) => void, depth: number) {
  const selected = selectedIds.has(e.id)
  return (
    <tr key={e.id} style={{ background: selected ? 'color-mix(in srgb, var(--neon) 8%, transparent)' : undefined }}>
      <td style={{ textAlign: 'center' }}>
        <input type="checkbox" checked={selected} onChange={() => toggleSelection(e.id)} />
      </td>
      <td style={{ paddingLeft: 12 + depth * 20 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-2)' }}>{e.entry_date}</span>
      </td>
      <td style={{ fontSize: 12, color: 'var(--tx-2)' }}>{e.campaigns?.name || '—'}</td>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: e.greenhouses ? 'var(--tx-2)' : 'var(--tx-3)' }}>
        {e.greenhouses?.code ?? 'niveau ferme'}
      </td>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--tx-1)', textAlign: 'right' }}>
        {Number(e.amount || 0).toLocaleString('fr', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </td>
      <td style={{ fontSize: 11, color: 'var(--tx-3)', maxWidth: 250 }}>{e.description || '—'}</td>
    </tr>
  )
}
