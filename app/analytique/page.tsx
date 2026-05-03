'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type Stats = {
  campaigns: number
  plantings: number
  harvests: number
  dispatches: number
  dispatchesNoPrice: number
  costs: number
  costsTotal: number
  budgetVersions: number
  alertes: number
}

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')
const fmtK = (n: number) => `${(n / 1000).toFixed(1)} k`

export default function AnalytiquePage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const [c, p, h, d, ce, bv, al] = await Promise.all([
          supabase.from('campaigns').select('id', { count: 'exact', head: true }),
          supabase.from('campaign_plantings').select('id', { count: 'exact', head: true }),
          supabase.from('harvests').select('id', { count: 'exact', head: true }),
          supabase.from('harvest_lots').select('id, certificate_number', { count: 'exact' }).eq('category', 'station_dispatch'),
          supabase.from('cost_entries').select('amount'),
          supabase.from('budget_versions').select('id', { count: 'exact', head: true }),
          supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('is_resolved', false),
        ])
        const dispatchesAll = (d.data ?? []) as any[]
        const costsAll = (ce.data ?? []) as any[]
        setStats({
          campaigns: c.count ?? 0,
          plantings: p.count ?? 0,
          harvests: h.count ?? 0,
          dispatches: dispatchesAll.length,
          dispatchesNoPrice: dispatchesAll.filter(r => !r.certificate_number).length,
          costs: costsAll.length,
          costsTotal: costsAll.reduce((s, r) => s + (Number(r.amount) || 0), 0),
          budgetVersions: bv.count ?? 0,
          alertes: al.count ?? 0,
        })
      } catch (e: any) {
        setError(e.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400 }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-main)' }}>
          🤖 IA & Prévisions
        </h1>
        <div style={{ color: 'var(--text-sub)', fontSize: 12.5, marginTop: 4 }}>
          Vue d'ensemble des données + accès aux analyses IA (Gemini)
        </div>
      </header>

      {error && (
        <div style={{ padding: 12, marginBottom: 14, background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 6, color: 'var(--text-main)', fontSize: 12.5 }}>
          ⚠ {error}
        </div>
      )}

      {/* Stats globales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
        <Stat icon="📅" label="Campagnes" value={stats?.campaigns ?? '…'} color="#8b5cf6" />
        <Stat icon="🌱" label="Plantations" value={stats?.plantings ?? '…'} color="#22c55e" />
        <Stat icon="🌿" label="Récoltes" value={stats?.harvests ?? '…'} color="#10b981" />
        <Stat icon="📦" label="Dispatches" value={stats?.dispatches ?? '…'} sub={stats ? `${stats.dispatchesNoPrice} sans prix` : ''} color="#0ea5e9" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
        <Stat icon="💰" label="Coûts (entrées)" value={stats?.costs ?? '…'} sub={stats ? `${fmtK(stats.costsTotal)} MAD total` : ''} color="#f59e0b" />
        <Stat icon="💼" label="Versions budget" value={stats?.budgetVersions ?? '…'} color="#6366f1" />
        <Stat icon="🔔" label="Alertes ouvertes" value={stats?.alertes ?? '…'} color="#ef4444" />
        <Stat icon="✓" label="Statut" value={loading ? 'loading' : 'ok'} color="#10b981" />
      </div>

      {/* Cartes IA */}
      <div style={{ marginTop: 24, marginBottom: 14, fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>
        🧠 Outils d'analyse IA
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 12 }}>
        <AICard
          icon="🤖" title="Assistant chatbot"
          description="Pose des questions en langage naturel sur tes données : marges, coûts, récoltes, prévisions… Le modèle a accès à toute la base."
          cta="Ouvrir l'assistant"
          target="/admin/compte-exploitation"
          tip="Bouton 💬 IA dans la toolbar du Compte d'exploitation"
        />
        <AICard
          icon="📊" title="Analyse du compte d'exploitation"
          description="Diagnostic automatique des écarts budget/réel, alertes de complétude, recommandations comptables et agronomiques."
          cta="Lancer l'analyse"
          target="/admin/compte-exploitation"
          tip="Bouton 'Analyser avec l'IA' dans la page Compte d'exploitation"
        />
        <AICard
          icon="📈" title="Marges & rentabilité"
          description="Vue calculée sur données réelles : CA confirmé via dispatches × prix, coûts ventilés, marge brute par variété/marché."
          cta="Voir les marges"
          target="/marges"
        />
      </div>

      <div style={{ marginTop: 24, padding: 12, background: 'var(--bg-2)', border: '1px solid var(--bd-1)', borderRadius: 8, fontSize: 11.5, color: 'var(--text-sub)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text-main)' }}>ⓘ À propos des prévisions</strong><br/>
        Les prévisions <em>strict sense</em> (modèles statistiques sur séries temporelles) ne sont pas activées dans cette version.
        Le moteur IA actuel se base sur Gemini Flash pour de l'analyse qualitative + diagnostics ponctuels.
        Pour des prévisions volumétriques fiables, l'historique nécessaire (≥ 2 saisons complètes) doit être présent en base.
      </div>
    </div>
  )
}

function Stat({ icon, label, value, sub, color }: { icon: string; label: string; value: any; sub?: string; color: string }) {
  return (
    <div style={{
      padding: 14, background: 'var(--bg-1)', border: '1px solid var(--bd-1)',
      borderRadius: 10, borderTop: `2px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 18 }}>{icon}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color, fontFamily: 'var(--font-display)' }}>{typeof value === 'number' ? fmt(value) : value}</div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--text-sub)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function AICard({ icon, title, description, cta, target, tip }: {
  icon: string; title: string; description: string; cta: string; target: string; tip?: string
}) {
  return (
    <div style={{
      padding: 16, background: 'var(--bg-1)', border: '1px solid var(--bd-1)',
      borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontSize: 26 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-main)' }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.5, flex: 1 }}>{description}</div>
      {tip && (
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>💡 {tip}</div>
      )}
      <Link href={target} style={{
        textDecoration: 'none', textAlign: 'center', marginTop: 4,
        padding: '8px 14px', background: 'var(--neon-dim)',
        border: '1px solid var(--neon)', borderRadius: 6,
        color: 'var(--neon)', fontSize: 12, fontWeight: 600,
      }}>{cta} →</Link>
    </div>
  )
}
