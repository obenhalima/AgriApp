'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter } from '@/components/ui/Modal'
import {
  AccountCategory, AccountCategoryNode,
  TYPE_COLORS, TYPE_LABELS,
  listAccountCategories, buildTree,
} from '@/lib/accountCategories'
import {
  BudgetVersion, BudgetLine,
  campaignMonths, MONTH_LABELS_FR,
  listBudgetVersions, createBudgetVersion, setBudgetVersionStatus, duplicateBudgetVersion,
  listBudgetLines, setBudgetCell,
  computeGrid, gridKey, monthKey,
} from '@/lib/budgets'
import { BudgetImportModal } from '@/components/budget/BudgetImportModal'
import { GenerateSalesBudgetModal } from '@/components/budget/GenerateSalesBudgetModal'

type Campaign = { id: string; name: string; code: string; preparation_start: string | null; planting_start: string | null; farm_id: string }
type Farm = { id: string; name: string; code: string }
type Greenhouse = { id: string; farm_id: string; name: string; code: string }

const STATUS_COLORS: Record<string, string> = {
  brouillon: 'var(--tx-3)',
  valide:    'var(--neon)',
  fige:      'var(--purple)',
}

export default function BudgetsAdminPage() {
  const [campaigns, setCampaigns]   = useState<Campaign[]>([])
  const [farms, setFarms]           = useState<Farm[]>([])
  const [greenhouses, setGreenhouses] = useState<Greenhouse[]>([])
  const [categories, setCategories] = useState<AccountCategory[]>([])
  const [loadingRefs, setLoadingRefs] = useState(true)

  // Sélection courante
  const [campaignId, setCampaignId] = useState<string>('')
  const [versionId, setVersionId] = useState<string>('')
  const [farmId, setFarmId] = useState<string>('')
  const [level, setLevel] = useState<'farm' | 'greenhouse' | 'consolidated' | 'domain'>('farm')
  const [greenhouseId, setGreenhouseId] = useState<string>('')

  const [versions, setVersions] = useState<BudgetVersion[]>([])
  const [lines, setLines] = useState<BudgetLine[]>([])
  const [linesLoading, setLinesLoading] = useState(false)

  // Modal création version
  const [versionModal, setVersionModal] = useState(false)
  const [newVersion, setNewVersion] = useState({ code: '', name: '' })

  // Modal import Excel
  const [importModal, setImportModal] = useState(false)
  // Modal génération CA depuis plantations
  const [generateModal, setGenerateModal] = useState(false)

  // Unité d'affichage : MAD ou kMAD (milliers)
  const [unit, setUnit] = useState<'MAD' | 'kMAD'>('MAD')

  // Profondeur d'affichage : 1 = Types, 2 = Catégories, 3 = Détail (toutes les feuilles)
  const [displayDepth, setDisplayDepth] = useState<1 | 2 | 3>(3)
  const unitDivisor = unit === 'kMAD' ? 1000 : 1
  const fmt = (v: number): string => {
    if (!v) return '—'
    return (v / unitDivisor).toLocaleString('fr', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // ── Chargement des référentiels ──
  useEffect(() => {
    (async () => {
      try {
        const [c, f, g, cat] = await Promise.all([
          supabase.from('campaigns').select('id, name, code, preparation_start, planting_start, farm_id').order('preparation_start', { ascending: false, nullsFirst: false }),
          supabase.from('farms').select('id, name, code').eq('is_active', true).order('name'),
          supabase.from('greenhouses').select('id, farm_id, name, code').order('code'),
          listAccountCategories(),
        ])
        setCampaigns((c.data ?? []) as Campaign[])
        setFarms((f.data ?? []) as Farm[])
        setGreenhouses((g.data ?? []) as Greenhouse[])
        setCategories(cat)

        // Auto-sélection d'une campagne par défaut
        if (c.data && c.data.length > 0) setCampaignId(c.data[0].id)
        if (f.data && f.data.length > 0) setFarmId(f.data[0].id)
      } catch (e: any) {
        alert('Erreur chargement référentiels : ' + e.message)
      } finally { setLoadingRefs(false) }
    })()
  }, [])

  // Versions d'une campagne
  useEffect(() => {
    if (!campaignId) { setVersions([]); setVersionId(''); return }
    (async () => {
      const v = await listBudgetVersions(campaignId)
      setVersions(v)
      setVersionId(v[0]?.id ?? '')
    })()
  }, [campaignId])

  // Lignes pour la grille — logique selon le mode :
  //   farm         = uniquement lignes niveau ferme (greenhouse_id IS NULL) de la ferme courante → éditable
  //   greenhouse   = uniquement lignes de la serre sélectionnée                                   → éditable
  //   consolidated = TOUTES les lignes de la ferme (niveau ferme + toutes les serres)             → lecture seule
  //   domain       = TOUTES les lignes de la version (toutes fermes, tous niveaux)                → lecture seule
  useEffect(() => {
    if (!versionId) { setLines([]); return }
    if ((level === 'farm' || level === 'greenhouse' || level === 'consolidated') && !farmId) { setLines([]); return }
    setLinesLoading(true)
    ;(async () => {
      try {
        let fetched: BudgetLine[]
        if (level === 'farm') {
          fetched = await listBudgetLines({ versionId, farmId, greenhouseId: null })
        } else if (level === 'greenhouse') {
          fetched = await listBudgetLines({ versionId, farmId, greenhouseId: greenhouseId || undefined })
        } else if (level === 'consolidated') {
          fetched = await listBudgetLines({ versionId, farmId })  // pas de filtre greenhouse
        } else {
          // domain : toutes fermes
          fetched = await listBudgetLines({ versionId })
        }
        setLines(fetched)
      } catch (e: any) { alert('Erreur chargement lignes : ' + e.message) }
      finally { setLinesLoading(false) }
    })()
  }, [versionId, farmId, level, greenhouseId])

  // ── Calculs dérivés ──
  const campaign = useMemo(() => campaigns.find(c => c.id === campaignId), [campaigns, campaignId])
  // Le budget commence à la date de préparation de la campagne (fallback : plantation)
  const months   = useMemo(
    () => campaignMonths(campaign?.preparation_start || campaign?.planting_start),
    [campaign]
  )
  const version  = useMemo(() => versions.find(v => v.id === versionId), [versions, versionId])
  // Édition autorisée seulement en mode farm/greenhouse (pas consolidé/domaine) ET si version en brouillon
  const editable = version?.status === 'brouillon' && (level === 'farm' || level === 'greenhouse')

  const ghsForFarm = useMemo(() => greenhouses.filter(g => g.farm_id === farmId), [greenhouses, farmId])
  useEffect(() => {
    if (level === 'greenhouse' && !ghsForFarm.find(g => g.id === greenhouseId)) {
      setGreenhouseId(ghsForFarm[0]?.id ?? '')
    }
  }, [level, ghsForFarm, greenhouseId])

  const tree = useMemo(() => buildTree(categories.filter(c => c.is_active)), [categories])
  const grid = useMemo(() => computeGrid(lines, months), [lines, months])

  // Map rapide : category_id → type
  const categoryTypeById = useMemo(() => {
    const m = new Map<string, string>()
    categories.forEach(c => m.set(c.id, c.type))
    return m
  }, [categories])

  // Totaux par type × mois pour les lignes de synthèse (CPC)
  const typeTotals = useMemo(() => {
    type T = 'produit' | 'charge_variable' | 'charge_fixe' | 'amortissement'
    const monthly: Record<T, Record<string, number>> = {
      produit: {}, charge_variable: {}, charge_fixe: {}, amortissement: {},
    }
    const total: Record<T, number> = {
      produit: 0, charge_variable: 0, charge_fixe: 0, amortissement: 0,
    }
    for (const l of lines) {
      const type = categoryTypeById.get(l.account_category_id) as T | undefined
      if (!type || !(type in monthly)) continue
      const mk = monthKey(l.period_year, l.period_month)
      monthly[type][mk] = (monthly[type][mk] ?? 0) + Number(l.amount || 0)
      total[type] += Number(l.amount || 0)
    }
    return { monthly, total }
  }, [lines, categoryTypeById])

  // ── Actions ──
  const saveCell = async (categoryId: string, year: number, month: number, rawValue: string) => {
    const amount = Number(rawValue.replace(/[^\d.-]/g, '')) || 0
    const gh = level === 'greenhouse' ? (greenhouseId || null) : null
    try {
      await setBudgetCell({
        version_id: versionId,
        farm_id: farmId,
        greenhouse_id: gh,
        account_category_id: categoryId,
        period_year: year,
        period_month: month,
        amount,
      })
      // Rafraîchir localement sans recharger tout
      setLines(prev => {
        const idx = prev.findIndex(l =>
          l.account_category_id === categoryId &&
          l.period_year === year && l.period_month === month &&
          (l.greenhouse_id ?? null) === (gh ?? null)
        )
        if (amount === 0 && idx >= 0) return prev.filter((_, i) => i !== idx)
        if (idx >= 0) {
          const next = [...prev]; next[idx] = { ...next[idx], amount }; return next
        }
        if (amount > 0) {
          return [...prev, {
            id: `tmp-${Date.now()}`, version_id: versionId, farm_id: farmId,
            greenhouse_id: gh, account_category_id: categoryId,
            period_year: year, period_month: month, amount,
            quantity: null, unit_price: null, notes: null,
          }]
        }
        return prev
      })
    } catch (e: any) { alert('Erreur : ' + e.message) }
  }

  const createVersion = async () => {
    if (!campaignId || !newVersion.code.trim() || !newVersion.name.trim()) return
    try {
      const v = await createBudgetVersion({ campaign_id: campaignId, code: newVersion.code, name: newVersion.name })
      setVersions(prev => [v, ...prev])
      setVersionId(v.id)
      setVersionModal(false)
      setNewVersion({ code: '', name: '' })
    } catch (e: any) { alert('Erreur : ' + e.message) }
  }

  const changeStatus = async (to: 'brouillon' | 'valide' | 'fige') => {
    if (!version) return
    const msg = to === 'fige'
      ? `Figer cette version ? Elle deviendra la référence officielle et ne pourra plus être modifiée.`
      : to === 'valide' ? 'Valider cette version ? Les modifications restent possibles tant qu\'elle n\'est pas figée.'
      : 'Repasser en brouillon ? Les modifications redeviennent possibles.'
    if (!confirm(msg)) return
    try {
      const u = await setBudgetVersionStatus(version.id, to)
      setVersions(prev => prev.map(v => v.id === u.id ? u : v))
    } catch (e: any) { alert('Erreur : ' + e.message) }
  }

  const duplicate = async () => {
    if (!version) return
    const code = prompt('Code de la nouvelle version :', `${version.code}_v2`)
    if (!code) return
    const name = prompt('Nom de la nouvelle version :', `${version.name} (copie)`)
    if (!name) return
    try {
      const v = await duplicateBudgetVersion(version.id, { code, name })
      setVersions(prev => [v, ...prev])
      setVersionId(v.id)
    } catch (e: any) { alert('Erreur : ' + e.message) }
  }

  // ── Rendu d'une ligne de catégorie dans la grille ──
  // depth 0 = niveau 1 (Type), depth 1 = L2, depth 2 = L3
  // On agrège toujours les enfants pour l'affichage total, mais on ne rend
  // les sous-lignes que si (depth + 1) < displayDepth.
  const renderCategoryRow = (node: AccountCategoryNode, depth: number) => {
    const hasChildren = node.children.length > 0
    const color = TYPE_COLORS[node.type]
    const rowTotal = grid.totalByCategory[node.id] ?? 0

    // Agrégation de tous les descendants feuilles (pour le total + calculs par mois)
    const childIds = hasChildren ? collectDescendantIds(node) : []
    const groupTotal = hasChildren ? childIds.reduce((s, id) => s + (grid.totalByCategory[id] ?? 0), 0) : rowTotal

    // La ligne est éditable SEULEMENT si elle n'a pas d'enfants (ou si les enfants sont masqués par le niveau d'affichage)
    const willRenderChildren = hasChildren && (depth + 1) < displayDepth
    const isInteractiveLeaf = !hasChildren

    return (
      <>
        <tr key={node.id} style={{ background: depth === 0 ? 'var(--bg-deep)' : 'transparent' }}>
          <td style={{ position: 'sticky', left: 0, background: depth === 0 ? 'var(--bg-deep)' : 'var(--bg-base)', zIndex: 1, minWidth: 220 }}>
            <div style={{ paddingLeft: depth * 18, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: 2, background: color }} />
              <span style={{
                fontWeight: depth === 0 ? 700 : (hasChildren ? 600 : 400),
                fontSize: depth === 0 ? 13 : 12,
                color: hasChildren ? 'var(--tx-1)' : 'var(--tx-2)',
              }}>
                {node.label}
              </span>
              {hasChildren && !willRenderChildren && (
                <span style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginLeft: 4 }}>
                  ({node.children.length} sous-catégorie{node.children.length > 1 ? 's' : ''})
                </span>
              )}
            </div>
          </td>
          {months.map(m => {
            const k = gridKey(node.id, m.year, m.month)
            if (hasChildren) {
              // total agrégé (somme des descendants pour ce mois)
              const sum = childIds.reduce((s, id) => s + (grid.amounts[gridKey(id, m.year, m.month)] ?? 0), 0)
              return (
                <td key={k} style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: sum ? 'var(--tx-2)' : 'var(--tx-3)', fontWeight: 600 }}>
                  {fmt(sum)}
                </td>
              )
            }
            return (
              <td key={k} style={{ padding: 0 }}>
                <BudgetCellInput
                  value={grid.amounts[k] ?? 0}
                  editable={editable}
                  unit={unit}
                  onCommit={(v) => saveCell(node.id, m.year, m.month, v)}
                />
              </td>
            )
          })}
          <td style={{
            textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
            color: hasChildren ? color : 'var(--tx-1)',
            borderLeft: '2px solid var(--bd-1)', paddingLeft: 8,
          }}>
            {fmt(groupTotal)}
          </td>
        </tr>
        {willRenderChildren && node.children.map(c => renderCategoryRow(c, depth + 1))}
      </>
    )
  }

  // ── Rendu principal ──
  if (loadingRefs) return <div style={{ padding: 40, color: 'var(--tx-3)' }}>CHARGEMENT...</div>

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="page-title">BUDGETS</div>
          <div className="page-sub">Saisie budgétaire mensuelle par ferme, serre et catégorie comptable</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Toggle profondeur d'affichage */}
          <div style={{ display: 'flex', border: '1px solid var(--bd-1)', borderRadius: 7, overflow: 'hidden' }}>
            {([
              { v: 1, l: 'Type',      t: 'Afficher uniquement les 4 types racines (Produits, Charges var., Charges fixes, Amortissements)' },
              { v: 2, l: 'Catégorie', t: 'Afficher jusqu\'au niveau catégorie (Intrants, MOD, Loyer...)' },
              { v: 3, l: 'Détail',    t: 'Afficher toutes les sous-catégories feuilles' },
            ] as const).map(opt => (
              <button key={opt.v} onClick={() => setDisplayDepth(opt.v)} title={opt.t}
                style={{
                  padding: '9px 12px',
                  background: displayDepth === opt.v ? 'var(--bg-deep)' : 'transparent',
                  color: displayDepth === opt.v ? 'var(--amber)' : 'var(--tx-3)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: .5,
                  fontWeight: displayDepth === opt.v ? 700 : 400,
                }}>
                {opt.l}
              </button>
            ))}
          </div>

          {/* Toggle unité */}
          <div style={{ display: 'flex', border: '1px solid var(--bd-1)', borderRadius: 7, overflow: 'hidden' }}>
            {(['MAD', 'kMAD'] as const).map(u => (
              <button key={u} onClick={() => setUnit(u)}
                title={u === 'MAD' ? 'Affichage en MAD' : 'Affichage en milliers de MAD'}
                style={{
                  padding: '9px 12px',
                  background: unit === u ? 'var(--bg-deep)' : 'transparent',
                  color: unit === u ? 'var(--neon)' : 'var(--tx-3)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: .5,
                  fontWeight: unit === u ? 700 : 400,
                }}>
                {u}
              </button>
            ))}
          </div>
          <button
            onClick={() => setGenerateModal(true)}
            disabled={!versionId || !campaignId}
            title={versionId ? 'Générer le budget : CA depuis plantations + charges depuis coûts prévisionnels' : 'Sélectionnez une version d\'abord'}
            style={{
              padding: '9px 14px',
              background: 'color-mix(in srgb, var(--amber) 18%, transparent)',
              color: 'var(--amber)',
              border: '1px solid color-mix(in srgb, var(--amber) 40%, transparent)',
              borderRadius: 7,
              cursor: (versionId && campaignId) ? 'pointer' : 'not-allowed',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              letterSpacing: 1,
              opacity: (versionId && campaignId) ? 1 : 0.5,
            }}>
            🧮 GÉNÉRER BUDGET
          </button>
          <button
            onClick={() => setImportModal(true)}
            disabled={!versionId}
            title={versionId ? 'Importer un fichier Excel dans cette version' : 'Sélectionnez ou créez une version d\'abord'}
            style={{
              padding: '9px 14px',
              background: 'var(--neon-dim)',
              color: 'var(--neon)',
              border: '1px solid color-mix(in srgb, var(--neon) 40%, transparent)',
              borderRadius: 7,
              cursor: versionId ? 'pointer' : 'not-allowed',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              letterSpacing: 1,
              opacity: versionId ? 1 : 0.5,
            }}>
            📤 IMPORT EXCEL
          </button>
        </div>
      </div>

      {/* Filtres globaux */}
      <div className="card" style={{ padding: 14, marginBottom: 14, display: 'grid', gridTemplateColumns: '1.3fr 1.5fr 1fr auto 1.3fr', gap: 10, alignItems: 'end' }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>CAMPAGNE</div>
          <select value={campaignId} onChange={e => setCampaignId(e.target.value)}
            style={{ width: '100%', padding: 8, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 6 }}>
            {campaigns.length === 0 && <option value="">— aucune campagne —</option>}
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
            VERSION
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <select value={versionId} onChange={e => setVersionId(e.target.value)} disabled={!versions.length}
              style={{ flex: 1, padding: 8, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 6 }}>
              {versions.length === 0 && <option value="">— aucune version —</option>}
              {versions.map(v => (
                <option key={v.id} value={v.id}>
                  {v.code} — {v.name} [{v.status}]
                </option>
              ))}
            </select>
            <button onClick={() => setVersionModal(true)} disabled={!campaignId}
              title={campaignId ? 'Créer une nouvelle version' : 'Sélectionnez une campagne d\'abord'}
              style={{
                padding: '0 12px',
                background: campaignId ? 'var(--neon-dim)' : 'transparent',
                border: `1px solid ${campaignId ? 'color-mix(in srgb, var(--neon) 40%, transparent)' : 'var(--bd-1)'}`,
                color: campaignId ? 'var(--neon)' : 'var(--tx-3)',
                borderRadius: 6,
                cursor: campaignId ? 'pointer' : 'not-allowed',
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                whiteSpace: 'nowrap',
              }}>
              + NOUVELLE
            </button>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>FERME</div>
          <select value={farmId} onChange={e => setFarmId(e.target.value)} disabled={level === 'domain'}
            style={{ width: '100%', padding: 8, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 6, opacity: level === 'domain' ? 0.4 : 1 }}>
            {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>VUE</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {([
              { k: 'farm',         l: 'Ferme',       title: 'Saisie au niveau ferme (coûts communs, loyers...)' },
              { k: 'greenhouse',   l: 'Serre',       title: 'Saisie pour une serre précise' },
              { k: 'consolidated', l: 'Consolidé',   title: 'Lecture : total ferme + toutes les serres (non éditable)' },
              { k: 'domain',       l: 'Domaine',     title: 'Lecture : total toutes fermes confondues (non éditable)' },
            ] as const).map(v => (
              <button key={v.k} onClick={() => setLevel(v.k)} title={v.title}
                style={{
                  padding: '7px 10px',
                  border: `1px solid ${level===v.k ? 'var(--neon)':'var(--bd-1)'}`,
                  background: level===v.k ? 'var(--neon-dim)' : 'transparent',
                  color: level===v.k ? 'var(--neon)' : 'var(--tx-2)',
                  borderRadius: 6, cursor: 'pointer', fontSize: 11,
                }}>
                {v.l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>SERRE</div>
          <select value={greenhouseId} onChange={e => setGreenhouseId(e.target.value)} disabled={level !== 'greenhouse'}
            style={{ width: '100%', padding: 8, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 6, opacity: level === 'greenhouse' ? 1 : 0.4 }}>
            {ghsForFarm.length === 0 && <option value="">— aucune serre —</option>}
            {ghsForFarm.map(g => <option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}
          </select>
        </div>
      </div>

      {/* Bandeau version */}
      {version && (
        <div className="card" style={{ padding: 12, marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="tag" style={{ background: `${STATUS_COLORS[version.status]}20`, color: STATUS_COLORS[version.status], border: `1px solid ${STATUS_COLORS[version.status]}50`, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
            {version.status.toUpperCase()}
          </span>
          <span style={{ fontSize: 12, color: 'var(--tx-2)' }}>{version.name}</span>
          {level === 'consolidated' && (
            <span className="tag" style={{ background: 'color-mix(in srgb, var(--purple) 20%, transparent)', color: 'var(--purple)', border: '1px solid color-mix(in srgb, var(--purple) 40%, transparent)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
              CONSOLIDÉ — {[
                lines.filter(l => l.greenhouse_id === null).length,
                `ferme + ${lines.filter(l => l.greenhouse_id !== null).length} ligne(s) serre`,
              ].join(' ')}
            </span>
          )}
          {level === 'domain' && (
            <span className="tag" style={{ background: 'color-mix(in srgb, var(--purple) 20%, transparent)', color: 'var(--purple)', border: '1px solid color-mix(in srgb, var(--purple) 40%, transparent)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
              DOMAINE — {farms.length} ferme(s)
            </span>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: 'var(--tx-3)' }}>
            {level === 'farm'         && 'Total niveau ferme : '}
            {level === 'greenhouse'   && 'Total serre : '}
            {level === 'consolidated' && 'Total consolidé ferme : '}
            {level === 'domain'       && 'Total domaine : '}
            <strong style={{ color: 'var(--tx-1)', fontFamily: 'var(--font-mono)' }}>{fmt(grid.grandTotal)} {unit}</strong>
          </span>
          <div style={{ flex: 1 }} />
          {version.status === 'brouillon' && (
            <button onClick={() => changeStatus('valide')}
              style={{ padding: '6px 12px', border: '1px solid var(--neon)50', background: 'var(--neon-dim)', color: 'var(--neon)', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
              Valider
            </button>
          )}
          {version.status === 'valide' && (
            <>
              <span style={{ fontSize: 10, color: 'var(--tx-3)', fontStyle: 'italic' }}>
                Version validée — verrouillée (retour brouillon réservé à l'admin)
              </span>
              <button onClick={() => changeStatus('fige')}
                style={{ padding: '6px 12px', border: '1px solid var(--purple)50', background: 'color-mix(in srgb, var(--purple) 20%, transparent)', color: 'var(--purple)', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
                Figer
              </button>
              <button onClick={duplicate}
                style={{ padding: '6px 12px', border: '1px solid var(--bd-1)', background: 'transparent', color: 'var(--tx-2)', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
                Dupliquer pour amendement
              </button>
            </>
          )}
          {version.status === 'fige' && (
            <button onClick={duplicate}
              style={{ padding: '6px 12px', border: '1px solid var(--bd-1)', background: 'transparent', color: 'var(--tx-2)', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
              Dupliquer pour amendement
            </button>
          )}
        </div>
      )}

      {/* Grille */}
      {campaigns.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📅</div>
          <div className="empty-title">Aucune campagne en base</div>
          <div style={{ color: 'var(--tx-3)', fontSize: 12, marginTop: 8 }}>
            Crée d'abord une campagne (menu <strong>EXPLOITATION → Campagnes</strong>), puis reviens ici pour saisir le budget.
          </div>
        </div>
      ) : !version ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <div className="empty-title">Aucune version de budget pour cette campagne</div>
          <div style={{ color: 'var(--tx-3)', fontSize: 12, marginTop: 8 }}>
            Clique sur le bouton <strong style={{ color: 'var(--neon)' }}>+ NOUVELLE</strong> à droite du sélecteur VERSION pour créer la première version.
          </div>
          <button onClick={() => setVersionModal(true)}
            style={{ marginTop: 16, padding: '9px 14px', background: 'var(--neon-dim)', color: 'var(--neon)', border: '1px solid color-mix(in srgb, var(--neon) 40%, transparent)', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>
            + CRÉER UNE VERSION
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 360px)' }}>
          {linesLoading && <div style={{ padding: 20, color: 'var(--tx-3)' }}>Chargement des lignes...</div>}
          <table className="tbl" style={{ minWidth: 1400 }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: 'var(--bg-deep)', zIndex: 2, minWidth: 220 }}>Catégorie</th>
                {months.map(m => (
                  <th key={`${m.year}-${m.month}`} style={{ textAlign: 'right', minWidth: 85, fontSize: 10 }}>
                    {MONTH_LABELS_FR[m.month - 1]} {String(m.year).slice(-2)}
                  </th>
                ))}
                <th style={{ textAlign: 'right', borderLeft: '2px solid var(--bd-1)', minWidth: 110 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {tree.map(node => renderCategoryRow(node, 0))}
              {/* ════════════════ SYNTHÈSE CPC ════════════════ */}
              {/* Total Produits */}
              <SynthesisRow
                label="TOTAL PRODUITS"
                months={months}
                monthly={typeTotals.monthly.produit}
                total={typeTotals.total.produit}
                color="var(--neon)"
                fmt={fmt}
                borderTop
              />
              {/* Total Charges variables */}
              <SynthesisRow
                label="TOTAL CHARGES VARIABLES"
                months={months}
                monthly={typeTotals.monthly.charge_variable}
                total={typeTotals.total.charge_variable}
                color="var(--amber)"
                negative
                fmt={fmt}
              />
              {/* Total Charges fixes */}
              <SynthesisRow
                label="TOTAL CHARGES FIXES"
                months={months}
                monthly={typeTotals.monthly.charge_fixe}
                total={typeTotals.total.charge_fixe}
                color="var(--blue)"
                negative
                fmt={fmt}
              />
              {/* EBITDA = Produits − Charges variables − Charges fixes */}
              {(() => {
                const ebitdaMonthly: Record<string, number> = {}
                months.forEach(m => {
                  const mk = monthKey(m.year, m.month)
                  ebitdaMonthly[mk] = (typeTotals.monthly.produit[mk] ?? 0)
                    - (typeTotals.monthly.charge_variable[mk] ?? 0)
                    - (typeTotals.monthly.charge_fixe[mk] ?? 0)
                })
                const ebitdaTotal = typeTotals.total.produit - typeTotals.total.charge_variable - typeTotals.total.charge_fixe
                const caTotal = typeTotals.total.produit
                return (
                  <SynthesisRow
                    label="= EBITDA"
                    sublabel={caTotal > 0 ? `${(ebitdaTotal / caTotal * 100).toFixed(1)}% du CA` : undefined}
                    months={months}
                    monthly={ebitdaMonthly}
                    total={ebitdaTotal}
                    color={ebitdaTotal >= 0 ? 'var(--neon)' : 'var(--red)'}
                    fmt={fmt}
                    strong
                    borderTop
                  />
                )
              })()}
              {/* Total Amortissements */}
              <SynthesisRow
                label="TOTAL AMORTISSEMENTS"
                months={months}
                monthly={typeTotals.monthly.amortissement}
                total={typeTotals.total.amortissement}
                color="var(--purple)"
                negative
                fmt={fmt}
              />
              {/* Résultat d'exploitation = EBITDA − Amortissements */}
              {(() => {
                const resMonthly: Record<string, number> = {}
                months.forEach(m => {
                  const mk = monthKey(m.year, m.month)
                  const ebitda = (typeTotals.monthly.produit[mk] ?? 0)
                    - (typeTotals.monthly.charge_variable[mk] ?? 0)
                    - (typeTotals.monthly.charge_fixe[mk] ?? 0)
                  resMonthly[mk] = ebitda - (typeTotals.monthly.amortissement[mk] ?? 0)
                })
                const ebitdaTotal = typeTotals.total.produit - typeTotals.total.charge_variable - typeTotals.total.charge_fixe
                const resTotal = ebitdaTotal - typeTotals.total.amortissement
                const caTotal = typeTotals.total.produit
                return (
                  <SynthesisRow
                    label="= RÉSULTAT D'EXPLOITATION"
                    sublabel={caTotal > 0 ? `${(resTotal / caTotal * 100).toFixed(1)}% du CA` : undefined}
                    months={months}
                    monthly={resMonthly}
                    total={resTotal}
                    color={resTotal >= 0 ? 'var(--neon)' : 'var(--red)'}
                    fmt={fmt}
                    strong
                    borderTop
                  />
                )
              })()}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal création version */}
      {versionModal && (
        <Modal title="NOUVELLE VERSION DE BUDGET" onClose={() => setVersionModal(false)} size="md">
          <FormRow>
            <FormGroup label="Code *">
              <Input value={newVersion.code} onChange={e => setNewVersion({ ...newVersion, code: e.target.value })} placeholder="BUD-V1" />
            </FormGroup>
            <FormGroup label="Nom *">
              <Input value={newVersion.name} onChange={e => setNewVersion({ ...newVersion, name: e.target.value })} placeholder="Budget initial 2025-2026" />
            </FormGroup>
          </FormRow>
          <ModalFooter
            onCancel={() => setVersionModal(false)}
            onSave={createVersion}
            disabled={!newVersion.code.trim() || !newVersion.name.trim()}
            saveLabel="CRÉER LA VERSION"
          />
        </Modal>
      )}

      {/* Modal génération CA depuis plantations */}
      {generateModal && version && campaignId && (
        <GenerateSalesBudgetModal
          versionId={version.id}
          versionLabel={`${version.code} — ${version.name}`}
          campaignId={campaignId}
          editable={version.status === 'brouillon'}
          onClose={() => setGenerateModal(false)}
          onCommitted={async () => {
            // Les lignes générées sont au niveau serre — on bascule sur la vue "Consolidé"
            // pour que l'utilisateur les voie tout de suite (la vue Ferme filtre greenhouse_id IS NULL)
            setLevel('consolidated')
            const fetched = await listBudgetLines({ versionId, farmId })
            setLines(fetched)
          }}
        />
      )}

      {/* Modal import Excel */}
      {importModal && version && (
        <BudgetImportModal
          versionId={version.id}
          versionLabel={`${version.code} — ${version.name}`}
          editable={version.status === 'brouillon'}
          onClose={() => setImportModal(false)}
          onImported={async () => {
            // Recharger les lignes de la vue courante
            const gh = level === 'greenhouse' ? (greenhouseId || undefined) : null
            const fetched = await listBudgetLines({ versionId, farmId, greenhouseId: gh as any })
            setLines(fetched)
          }}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Ligne de synthèse (CPC) : total par type, EBITDA, résultat d'exploitation
// ══════════════════════════════════════════════════════════════
function SynthesisRow(props: {
  label: string
  sublabel?: string
  months: { year: number; month: number }[]
  monthly: Record<string, number>
  total: number
  color: string
  fmt: (v: number) => string
  strong?: boolean     // ligne importante (EBITDA, Résultat) : fond coloré
  negative?: boolean   // affiche en négatif (charges)
  borderTop?: boolean  // trait de séparation au-dessus
}) {
  const { label, sublabel, months, monthly, total, color, fmt, strong, negative, borderTop } = props
  const bg = strong
    ? `color-mix(in srgb, ${color} 18%, transparent)`
    : 'var(--bg-deep)'
  const sign = (v: number) => negative ? -Math.abs(v) : v
  return (
    <tr style={{ background: bg, borderTop: borderTop ? `2px solid ${color}60` : undefined }}>
      <td style={{ position: 'sticky', left: 0, background: bg, zIndex: 1, fontWeight: strong ? 800 : 700, color, fontSize: strong ? 13 : 11, letterSpacing: .5 }}>
        {label}
        {sublabel && <div style={{ fontSize: 9, color: 'var(--tx-3)', fontWeight: 400, marginTop: 2, fontFamily: 'var(--font-mono)' }}>{sublabel}</div>}
      </td>
      {months.map(m => {
        const mk = `${m.year}|${m.month}`
        const raw = monthly[mk] ?? 0
        const val = sign(raw)
        return (
          <td key={mk} style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: strong ? 12 : 11, fontWeight: strong ? 700 : 600, color: raw === 0 ? 'var(--tx-3)' : (val < 0 ? 'var(--red)' : color) }}>
            {raw === 0 ? '—' : (val < 0 ? `(${fmt(Math.abs(val))})` : fmt(val))}
          </td>
        )
      })}
      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: strong ? 14 : 12, fontWeight: strong ? 800 : 700, color: total === 0 ? 'var(--tx-3)' : (sign(total) < 0 ? 'var(--red)' : color), borderLeft: '2px solid var(--bd-1)', paddingLeft: 8 }}>
        {total === 0 ? '—' : (sign(total) < 0 ? `(${fmt(Math.abs(sign(total)))})` : fmt(sign(total)))}
      </td>
    </tr>
  )
}

// ══════════════════════════════════════════════════════════════
// Cellule éditable
// ══════════════════════════════════════════════════════════════
function BudgetCellInput({ value, editable, unit, onCommit }: {
  value: number
  editable: boolean
  unit: 'MAD' | 'kMAD'
  onCommit: (valueInMAD: string) => void
}) {
  // Affiche en unité courante, stocke toujours en MAD
  const displayValue = value
    ? (unit === 'kMAD'
        ? (value / 1000).toLocaleString('fr', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : value.toLocaleString('fr', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    : ''

  const [local, setLocal] = useState(displayValue)
  useEffect(() => { setLocal(displayValue) }, [value, unit])

  if (!editable) {
    return (
      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: value ? 'var(--tx-2)' : 'var(--tx-3)', padding: '6px 8px' }}>
        {displayValue || '—'}
      </div>
    )
  }

  const commit = () => {
    // Normalise "1 234,56" → "1234.56" et convertit en MAD si saisie en kMAD
    const normalized = local.replace(/\s/g, '').replace(',', '.').replace(/[^\d.\-]/g, '')
    const num = Number(normalized)
    const inMad = Number.isFinite(num) ? (unit === 'kMAD' ? num * 1000 : num) : 0
    // Arrondi 2 décimales
    const rounded = Math.round(inMad * 100) / 100
    if (rounded !== value) onCommit(String(rounded))
  }

  return (
    <input
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') { setLocal(displayValue); (e.target as HTMLInputElement).blur() }
      }}
      placeholder="0"
      title={unit === 'kMAD' ? 'Saisie en kMAD (milliers)' : 'Saisie en MAD'}
      style={{
        width: '100%', padding: '6px 8px', textAlign: 'right',
        fontFamily: 'var(--font-mono)', fontSize: 11,
        background: 'transparent', color: local ? 'var(--tx-1)' : 'var(--tx-3)',
        border: '1px solid transparent',
        borderRadius: 0,
      }}
      onFocus={e => { e.target.style.background = 'var(--bg-deep)'; e.target.style.border = '1px solid var(--neon)40' }}
      onBlurCapture={e => { (e.target as HTMLInputElement).style.background = 'transparent'; (e.target as HTMLInputElement).style.border = '1px solid transparent' }}
    />
  )
}

// ══════════════════════════════════════════════════════════════
// Utilitaire : collecte les IDs de tous les descendants feuilles
// ══════════════════════════════════════════════════════════════
function collectDescendantIds(node: AccountCategoryNode): string[] {
  const out: string[] = []
  const walk = (n: AccountCategoryNode) => {
    if (n.children.length === 0) out.push(n.id)
    else n.children.forEach(walk)
  }
  node.children.forEach(walk)
  return out
}
