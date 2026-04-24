'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Def = {
  id: string
  entity_type: string
  code: string
  name: string
  description: string | null
  is_active: boolean
  is_default: boolean
}
type State = {
  id: string
  code: string
  label: string
  color: string | null
  is_initial: boolean
  is_final: boolean
  order_idx: number
}
type Transition = {
  id: string
  from_state_id: string
  to_state_id: string
  code: string
  label: string
  is_active: boolean
  order_idx: number
  requires_approval: boolean
}

export default function WorkflowDefinitionEditor() {
  const params = useParams<{ id: string }>()
  const defId = params?.id as string

  const [def, setDef] = useState<Def | null>(null)
  const [states, setStates] = useState<State[]>([])
  const [trans, setTrans] = useState<Transition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Nouvelle transition
  const [newT, setNewT] = useState({ from_state_id: '', to_state_id: '', code: '', label: '' })
  const [savingT, setSavingT] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const [d, s, t] = await Promise.all([
        supabase.from('workflow_definitions').select('*').eq('id', defId).maybeSingle(),
        supabase.from('workflow_states').select('*').eq('definition_id', defId).order('order_idx'),
        supabase.from('workflow_transitions').select('*').eq('definition_id', defId).order('order_idx'),
      ])
      if (d.error) throw d.error
      if (s.error) throw s.error
      if (t.error) throw t.error
      setDef(d.data as Def | null)
      setStates(s.data ?? [])
      setTrans(t.data ?? [])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { if (defId) load() }, [defId])

  const stateById = (id: string) => states.find(s => s.id === id)

  const toggleTransition = async (t: Transition) => {
    await supabase.from('workflow_transitions').update({ is_active: !t.is_active }).eq('id', t.id)
    setTrans(p => p.map(x => x.id === t.id ? { ...x, is_active: !t.is_active } : x))
  }

  const deleteTransition = async (t: Transition) => {
    if (!confirm(`Supprimer la transition "${t.label}" ?`)) return
    await supabase.from('workflow_transitions').delete().eq('id', t.id)
    setTrans(p => p.filter(x => x.id !== t.id))
  }

  const addTransition = async () => {
    if (!newT.from_state_id || !newT.to_state_id || !newT.code || !newT.label) return
    if (newT.from_state_id === newT.to_state_id) { alert('L\'état de départ et d\'arrivée doivent être différents'); return }
    setSavingT(true)
    try {
      const { data, error } = await supabase.from('workflow_transitions').insert({
        definition_id: defId,
        from_state_id: newT.from_state_id,
        to_state_id: newT.to_state_id,
        code: newT.code,
        label: newT.label,
        order_idx: (trans.length + 1) * 10,
      }).select().single()
      if (error) throw error
      setTrans(p => [...p, data])
      setNewT({ from_state_id: '', to_state_id: '', code: '', label: '' })
    } catch (e: any) { alert('Erreur: ' + e.message) }
    finally { setSavingT(false) }
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--tx-3)' }}>CHARGEMENT...</div>
  if (error) return <div style={{ padding: 12, background: 'var(--red-dim)', color: 'var(--red)' }}>⚠ {error}</div>
  if (!def) return <div style={{ padding: 40 }}>Workflow introuvable.</div>

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/admin/workflows" style={{ fontSize: 11, color: 'var(--tx-3)', textDecoration: 'none' }}>← Retour</Link>
        <div className="page-title" style={{ marginTop: 6 }}>{def.name}</div>
        <div className="page-sub">
          <span style={{ fontFamily: 'var(--font-mono)' }}>{def.entity_type}</span> · code <code>{def.code}</code>
          {def.is_default && <span className="tag tag-green" style={{ marginLeft: 8 }}>défaut</span>}
          {!def.is_active && <span className="tag" style={{ marginLeft: 8 }}>inactif</span>}
        </div>
      </div>

      {/* ÉTATS */}
      <div style={{ marginBottom: 28 }}>
        <div className="section-label" style={{ marginBottom: 10 }}>ÉTATS ({states.length})</div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="tbl">
            <thead><tr>{['Ordre', 'Code', 'Libellé', 'Couleur', 'Initial', 'Final'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {states.map(s => (
                <tr key={s.id}>
                  <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{s.order_idx}</span></td>
                  <td><code>{s.code}</code></td>
                  <td>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: s.color ?? 'var(--tx-3)', marginRight: 8 }} />
                    {s.label}
                  </td>
                  <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)' }}>{s.color}</span></td>
                  <td>{s.is_initial ? '✓' : ''}</td>
                  <td>{s.is_final ? '✓' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: 'var(--tx-3)', marginTop: 6 }}>
          L'édition des états se fera en phase ultérieure — ils sont définis par migration.
        </div>
      </div>

      {/* TRANSITIONS */}
      <div>
        <div className="section-label" style={{ marginBottom: 10 }}>TRANSITIONS ({trans.length})</div>

        {/* Formulaire d'ajout */}
        <div className="card" style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr 1.5fr auto', gap: 8, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--tx-3)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>DE</div>
              <select value={newT.from_state_id} onChange={e => setNewT({ ...newT, from_state_id: e.target.value })}
                style={{ width: '100%', padding: 8, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 6 }}>
                <option value="">— état —</option>
                {states.filter(s => !s.is_final).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--tx-3)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>VERS</div>
              <select value={newT.to_state_id} onChange={e => setNewT({ ...newT, to_state_id: e.target.value })}
                style={{ width: '100%', padding: 8, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 6 }}>
                <option value="">— état —</option>
                {states.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--tx-3)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>CODE</div>
              <input value={newT.code} onChange={e => setNewT({ ...newT, code: e.target.value })} placeholder="ex: confirm"
                style={{ width: '100%', padding: 8, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 6 }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--tx-3)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>LIBELLÉ DU BOUTON</div>
              <input value={newT.label} onChange={e => setNewT({ ...newT, label: e.target.value })} placeholder="ex: Confirmer la commande"
                style={{ width: '100%', padding: 8, background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 6 }} />
            </div>
            <button onClick={addTransition} disabled={savingT} className="btn-primary" style={{ whiteSpace: 'nowrap' }}>
              {savingT ? '...' : '+ AJOUTER'}
            </button>
          </div>
        </div>

        {/* Liste */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="tbl">
            <thead><tr>{['De', 'Vers', 'Code', 'Libellé', 'Actif', ''].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {trans.map(t => {
                const from = stateById(t.from_state_id)
                const to = stateById(t.to_state_id)
                return (
                  <tr key={t.id} style={{ opacity: t.is_active ? 1 : 0.5 }}>
                    <td>{from?.label ?? '?'}</td>
                    <td>→ {to?.label ?? '?'}</td>
                    <td><code>{t.code}</code></td>
                    <td>{t.label}</td>
                    <td>
                      <button onClick={() => toggleTransition(t)}
                        style={{ padding: '3px 10px', border: '1px solid var(--bd-1)', borderRadius: 6, background: t.is_active ? 'var(--neon-dim)' : 'transparent', color: t.is_active ? 'var(--neon)' : 'var(--tx-3)', fontSize: 11, cursor: 'pointer' }}>
                        {t.is_active ? 'actif' : 'inactif'}
                      </button>
                    </td>
                    <td>
                      <button onClick={() => deleteTransition(t)}
                        title="Supprimer" style={{ background: 'transparent', border: '1px solid var(--bd-1)', borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer', color: 'var(--red)' }}>
                        🗑
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
