'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

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

const TYPE_COLORS: Record<string, string> = {
  entree: 'var(--neon)',
  sortie: 'var(--red)',
  ajustement: 'var(--amber)',
  transfert: 'var(--blue)',
}

const TYPE_LABELS: Record<string, string> = {
  entree: 'Entrée',
  sortie: 'Sortie',
  ajustement: 'Ajustement',
  transfert: 'Transfert',
}

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

  // Filtres
  const [stockItemId, setStockItemId] = useState('')
  const [category, setCategory] = useState('')
  const [movementType, setMovementType] = useState<string>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [reference, setReference] = useState('')

  // Chargement des articles de stock (pour filtre + affichage)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('stock_items')
        .select('id, code, name, category, unit')
        .eq('is_active', true).order('name')
      setItems((data ?? []) as Item[])
    })()
  }, [])

  // Chargement des mouvements avec filtres appliqués en base
  const fetchMovements = async () => {
    setLoading(true); setError('')
    try {
      let q = supabase
        .from('stock_movements')
        .select('*, stock_items(code,name,unit,category), purchase_orders(po_number)')
        .order('movement_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(500)

      if (stockItemId) q = q.eq('stock_item_id', stockItemId)
      if (movementType) q = q.eq('movement_type', movementType)
      if (dateFrom) q = q.gte('movement_date', dateFrom)
      if (dateTo) q = q.lte('movement_date', dateTo)
      if (reference) q = q.ilike('reference', `%${reference}%`)

      const { data, error } = await q
      if (error) throw error

      let list = (data ?? []) as Movement[]
      // Filtre par catégorie d'article (client-side puisque c'est une colonne de la table liée)
      if (category) list = list.filter(m => m.stock_items?.category === category)

      setMovements(list)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchMovements() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const resetFilters = () => {
    setStockItemId(''); setCategory(''); setMovementType('')
    setDateFrom(''); setDateTo(''); setReference('')
  }
  const apply = () => fetchMovements()

  const totals = useMemo(() => {
    const byType: Record<string, { count: number; qty: number }> = {}
    movements.forEach(m => {
      const t = m.movement_type
      byType[t] = byType[t] || { count: 0, qty: 0 }
      byType[t].count++
      byType[t].qty += Number(m.quantity || 0)
    })
    return byType
  }, [movements])

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      <div style={{ marginBottom: 6 }}>
        <Link href="/stocks" style={{ fontSize: 11, color: 'var(--tx-3)', textDecoration: 'none' }}>← Retour aux stocks</Link>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="page-title">MOUVEMENTS DE STOCK</div>
          <div className="page-sub">{movements.length} mouvement(s) · limite 500</div>
        </div>
      </div>

      {/* FILTRES */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>ARTICLE</div>
            <select value={stockItemId} onChange={e => setStockItemId(e.target.value)}
              style={{ width: '100%', padding: 7, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 12 }}>
              <option value="">Tous les articles</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>CATÉGORIE</div>
            <select value={category} onChange={e => setCategory(e.target.value)}
              style={{ width: '100%', padding: 7, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 12 }}>
              {CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>TYPE</div>
            <select value={movementType} onChange={e => setMovementType(e.target.value)}
              style={{ width: '100%', padding: 7, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 12 }}>
              <option value="">Tous</option>
              <option value="entree">Entrée</option>
              <option value="sortie">Sortie</option>
              <option value="ajustement">Ajustement</option>
              <option value="transfert">Transfert</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>DATE DE</div>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ width: '100%', padding: 7, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 12 }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>DATE À</div>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ width: '100%', padding: 7, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 12 }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>RÉFÉRENCE</div>
            <input value={reference} onChange={e => setReference(e.target.value)} placeholder="BL, ticket..."
              style={{ width: '100%', padding: 7, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 12 }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          <button onClick={resetFilters}
            style={{ padding: '7px 14px', background: 'transparent', border: '1px solid var(--bd-1)', color: 'var(--tx-2)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
            Réinitialiser
          </button>
          <button onClick={apply} className="btn-primary">APPLIQUER</button>
        </div>
      </div>

      {/* RÉCAP */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        {(['entree', 'sortie', 'ajustement', 'transfert'] as const).map(t => {
          const tot = totals[t] ?? { count: 0, qty: 0 }
          const c = TYPE_COLORS[t]
          return (
            <div key={t} className="kpi" style={{ '--accent': c } as any}>
              <div className="kpi-label">{TYPE_LABELS[t]}</div>
              <div className="kpi-value" style={{ color: c }}>{tot.count}</div>
              <div style={{ fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                {tot.qty.toLocaleString('fr')} unités
              </div>
            </div>
          )
        })}
      </div>

      {/* TABLEAU */}
      {error && <div style={{ padding: 12, background: 'var(--red-dim)', color: 'var(--red)', borderRadius: 8, marginBottom: 12 }}>⚠ {error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>CHARGEMENT...</div>
      ) : movements.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <div className="empty-title">Aucun mouvement trouvé</div>
          <div style={{ color: 'var(--tx-3)', fontSize: 12, marginTop: 8 }}>Ajuste les filtres ou réinitialise-les.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr>
                {['Date', 'Type', 'Article', 'Catégorie', 'Quantité', 'Unité', 'Référence', 'BO lié', 'Notes'].map(h => <th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>
                {movements.map(m => {
                  const c = TYPE_COLORS[m.movement_type] ?? 'var(--tx-3)'
                  const sign = m.movement_type === 'sortie' ? '-' : m.movement_type === 'entree' ? '+' : ''
                  return (
                    <tr key={m.id}>
                      <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-2)' }}>{m.movement_date}</span></td>
                      <td><span style={{ background: `${c}18`, color: c, padding: '2px 8px', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 10, border: `1px solid ${c}40` }}>{TYPE_LABELS[m.movement_type]?.toUpperCase()}</span></td>
                      <td><strong style={{ color: 'var(--tx-1)', fontSize: 13 }}>{m.stock_items?.name ?? '—'}</strong>{m.stock_items?.code && <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>{m.stock_items.code}</div>}</td>
                      <td><span className="tag">{m.stock_items?.category ?? '—'}</span></td>
                      <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: c }}>{sign}{Number(m.quantity).toLocaleString('fr')}</span></td>
                      <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>{m.stock_items?.unit ?? '—'}</span></td>
                      <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-2)' }}>{m.reference ?? '—'}</span></td>
                      <td>
                        {m.po_id && m.purchase_orders ? (
                          <Link href={`/achats/${m.po_id}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--neon)', textDecoration: 'none' }}>
                            {m.purchase_orders.po_number}
                          </Link>
                        ) : '—'}
                      </td>
                      <td><span style={{ fontSize: 11, color: 'var(--tx-3)' }}>{m.notes ?? '—'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
