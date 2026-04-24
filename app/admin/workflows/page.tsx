'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type Def = {
  id: string
  entity_type: string
  code: string
  name: string
  description: string | null
  version: number
  is_active: boolean
  is_default: boolean
}

const ENTITY_LABELS: Record<string, string> = {
  sales_order: 'Commandes',
  invoice: 'Factures',
  purchase_order: 'Bons d\'achat',
  harvest: 'Récoltes',
}

export default function WorkflowsAdminPage() {
  const [defs, setDefs] = useState<Def[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('workflow_definitions')
          .select('*')
          .order('entity_type').order('name')
        if (error) throw error
        setDefs(data ?? [])
      } catch (e: any) {
        setError(e.message ?? 'Erreur de chargement')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const grouped = defs.reduce<Record<string, Def[]>>((acc, d) => {
    (acc[d.entity_type] ??= []).push(d); return acc
  }, {})

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      <div style={{ marginBottom: 20 }}>
        <div className="page-title">WORKFLOWS</div>
        <div className="page-sub">Paramétrage des processus métier par module</div>
      </div>

      {loading && <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>CHARGEMENT...</div>}
      {error && <div style={{ padding: 12, background: 'var(--red-dim)', color: 'var(--red)', borderRadius: 8 }}>⚠ {error}</div>}

      {!loading && !error && defs.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">⚙️</div>
          <div className="empty-title">Aucun workflow configuré</div>
          <div style={{ color: 'var(--tx-3)', fontSize: 12, marginTop: 8 }}>
            Appliquez la migration 006_workflows.sql pour créer les workflows par défaut.
          </div>
        </div>
      )}

      {!loading && Object.entries(grouped).map(([entityType, list]) => (
        <div key={entityType} style={{ marginBottom: 24 }}>
          <div className="section-label" style={{ marginBottom: 10 }}>
            {ENTITY_LABELS[entityType] || entityType}
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="tbl">
              <thead><tr>
                {['Nom', 'Code', 'Version', 'Actif', 'Défaut', ''].map(h => <th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>
                {list.map(d => (
                  <tr key={d.id}>
                    <td><strong style={{ color: 'var(--tx-1)' }}>{d.name}</strong>{d.description && <div style={{ fontSize: 11, color: 'var(--tx-3)' }}>{d.description}</div>}</td>
                    <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-2)' }}>{d.code}</span></td>
                    <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>v{d.version}</span></td>
                    <td>{d.is_active ? <span className="tag tag-green">actif</span> : <span className="tag">inactif</span>}</td>
                    <td>{d.is_default ? <span className="tag tag-green">défaut</span> : '—'}</td>
                    <td>
                      <Link
                        href={`/admin/workflows/${d.id}`}
                        style={{ padding: '4px 10px', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 12, color: 'var(--tx-2)', textDecoration: 'none' }}
                      >
                        Éditer
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
