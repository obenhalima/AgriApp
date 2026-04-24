'use client'
import { useEffect, useMemo, useState } from 'react'
import {
  AccountCategory, AccountCategoryNode, AccountCategoryType,
  TYPE_LABELS, TYPE_COLORS,
  listAccountCategories, buildTree,
  toggleAccountCategoryActive, deleteAccountCategory,
} from '@/lib/accountCategories'
import { AccountCategoryModal } from '@/components/accounting/AccountCategoryModal'

export default function AccountCategoriesAdminPage() {
  const [flat, setFlat] = useState<AccountCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filterType, setFilterType] = useState<AccountCategoryType | 'all'>('all')
  const [showInactive, setShowInactive] = useState(false)

  // Modal état
  const [modalState, setModalState] = useState<
    | { kind: 'create_root' }
    | { kind: 'create_child'; parent: AccountCategory }
    | { kind: 'edit'; category: AccountCategory }
    | null
  >(null)

  const load = async () => {
    try {
      setLoading(true)
      const list = await listAccountCategories()
      setFlat(list)
      // Par défaut, ouvre les racines et niveau 2
      const toOpen = new Set<string>()
      list.forEach(c => { if (c.level <= 2) toOpen.add(c.id) })
      setExpanded(toOpen)
    } catch (e: any) {
      setError(e.message)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const tree = useMemo(() => buildTree(
    flat.filter(c => (showInactive || c.is_active) && (filterType === 'all' || c.type === filterType))
  ), [flat, filterType, showInactive])

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleToggleActive = async (c: AccountCategory) => {
    const verb = c.is_active ? 'désactiver' : 'réactiver'
    if (!confirm(`Vous voulez ${verb} "${c.label}" ?`)) return
    try {
      const u = await toggleAccountCategoryActive(c.id, !c.is_active)
      setFlat(prev => prev.map(x => x.id === c.id ? u : x))
    } catch (e: any) { alert('Erreur : ' + e.message) }
  }

  const handleDelete = async (c: AccountCategory) => {
    if (!confirm(`Supprimer définitivement "${c.label}" ? (impossible si des enfants ou des coûts y sont rattachés)`)) return
    try {
      await deleteAccountCategory(c.id)
      setFlat(prev => prev.filter(x => x.id !== c.id))
    } catch (e: any) { alert('Suppression impossible : ' + e.message) }
  }

  const handleSaved = (saved: AccountCategory) => {
    setFlat(prev => {
      const exists = prev.find(x => x.id === saved.id)
      return exists ? prev.map(x => x.id === saved.id ? saved : x) : [...prev, saved]
    })
    setModalState(null)
  }

  const renderNode = (node: AccountCategoryNode, depth: number) => {
    const hasChildren = node.children.length > 0
    const isOpen = expanded.has(node.id)
    const color = TYPE_COLORS[node.type]
    const rowStyle: React.CSSProperties = {
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 10px',
      borderBottom: '1px solid var(--bd-1)',
      background: depth === 0 ? 'var(--bg-deep)' : 'transparent',
      opacity: node.is_active ? 1 : 0.55,
    }
    return (
      <div key={node.id}>
        <div style={rowStyle}>
          <div style={{ width: depth * 18, flexShrink: 0 }} />
          {hasChildren ? (
            <button onClick={() => toggleExpand(node.id)}
              style={{ background: 'transparent', border: 'none', color: 'var(--tx-2)', cursor: 'pointer', width: 18, padding: 0, fontSize: 10 }}>
              {isOpen ? '▾' : '▸'}
            </button>
          ) : <div style={{ width: 18 }} />}
          <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)', minWidth: 120 }}>{node.code}</code>
          <strong style={{ color: 'var(--tx-1)', fontSize: depth === 0 ? 14 : 13, fontWeight: depth === 0 ? 700 : 500 }}>
            {node.label}
          </strong>
          {node.default_depreciation_years != null && (
            <span style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>({node.default_depreciation_years} ans)</span>
          )}
          {!node.is_active && <span className="tag">inactif</span>}
          <div style={{ flex: 1 }} />
          {node.level < 3 && (
            <button onClick={() => setModalState({ kind: 'create_child', parent: node })}
              title="Ajouter une sous-catégorie"
              style={{ background: 'transparent', border: '1px solid var(--bd-1)', color: 'var(--neon)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>
              + enfant
            </button>
          )}
          <button onClick={() => setModalState({ kind: 'edit', category: node })}
            title="Modifier"
            style={{ background: 'transparent', border: '1px solid var(--bd-1)', color: 'var(--tx-2)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>
            ✎
          </button>
          <button onClick={() => handleToggleActive(node)}
            title={node.is_active ? 'Désactiver' : 'Réactiver'}
            style={{ background: 'transparent', border: '1px solid var(--bd-1)', color: node.is_active ? 'var(--amber)' : 'var(--neon)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>
            {node.is_active ? '⏻' : '↺'}
          </button>
          <button onClick={() => handleDelete(node)}
            title="Supprimer"
            style={{ background: 'transparent', border: '1px solid var(--bd-1)', color: 'var(--red)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>
            🗑
          </button>
        </div>
        {hasChildren && isOpen && node.children.map(c => renderNode(c, depth + 1))}
      </div>
    )
  }

  const countByType = useMemo(() => {
    const c: Record<AccountCategoryType, number> = {
      produit: 0, charge_variable: 0, charge_fixe: 0, amortissement: 0,
    }
    flat.forEach(x => { if (x.is_active) c[x.type]++ })
    return c
  }, [flat])

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="page-title">PLAN COMPTABLE</div>
          <div className="page-sub">
            Hiérarchie des catégories utilisée pour le CPC, le budget et le rapport statistique
          </div>
        </div>
        <button className="btn-primary" onClick={() => setModalState({ kind: 'create_root' })}>
          + CATÉGORIE RACINE
        </button>
      </div>

      {/* KPIs par type */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        {(['produit','charge_variable','charge_fixe','amortissement'] as AccountCategoryType[]).map(t => (
          <div key={t} className="kpi" style={{ '--accent': TYPE_COLORS[t] } as any}>
            <div className="kpi-label">{TYPE_LABELS[t]}</div>
            <div className="kpi-value" style={{ color: TYPE_COLORS[t] }}>{countByType[t]}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="card" style={{ padding: 12, marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>TYPE</div>
          <select value={filterType} onChange={e => setFilterType(e.target.value as any)}
            style={{ padding: 6, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 5, fontSize: 12 }}>
            <option value="all">Tous</option>
            {(['produit','charge_variable','charge_fixe','amortissement'] as AccountCategoryType[]).map(t =>
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            )}
          </select>
        </div>
        <label style={{ fontSize: 12, color: 'var(--tx-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Afficher les inactifs
        </label>
        <div style={{ flex: 1 }} />
        <button onClick={() => setExpanded(new Set(flat.map(c => c.id)))}
          style={{ background: 'transparent', border: '1px solid var(--bd-1)', color: 'var(--tx-2)', borderRadius: 5, padding: '5px 10px', cursor: 'pointer', fontSize: 11 }}>
          Tout déplier
        </button>
        <button onClick={() => setExpanded(new Set())}
          style={{ background: 'transparent', border: '1px solid var(--bd-1)', color: 'var(--tx-2)', borderRadius: 5, padding: '5px 10px', cursor: 'pointer', fontSize: 11 }}>
          Tout replier
        </button>
      </div>

      {loading && <div style={{ padding: 40, color: 'var(--tx-3)', textAlign: 'center' }}>CHARGEMENT...</div>}
      {error && <div style={{ padding: 12, background: 'var(--red-dim)', color: 'var(--red)', borderRadius: 8, marginBottom: 12 }}>⚠ {error}</div>}

      {!loading && tree.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🗂️</div>
          <div className="empty-title">Aucune catégorie</div>
          <div style={{ color: 'var(--tx-3)', fontSize: 12, marginTop: 8 }}>Applique la migration 009 ou crée une catégorie racine.</div>
        </div>
      )}

      {!loading && tree.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {tree.map(n => renderNode(n, 0))}
        </div>
      )}

      {/* MODAL création/édition */}
      {modalState && (
        <AccountCategoryModal
          open
          mode={modalState.kind === 'edit' ? 'edit' : 'create'}
          parent={modalState.kind === 'create_child' ? modalState.parent : null}
          category={modalState.kind === 'edit' ? modalState.category : undefined}
          onClose={() => setModalState(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
