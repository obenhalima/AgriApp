'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bot, Calendar, Sprout, Package, Coins, Briefcase, Bell, ArrowRight, MessageCircle, LineChart, TrendingUp, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton, SkeletonKPI } from '@/components/ui/Skeleton'
import { KPICard } from '@/components/ui/KPICard'

type Stats = { campaigns: number; plantings: number; harvests: number; dispatches: number; dispatchesNoPrice: number; costs: number; costsTotal: number; budgetVersions: number; alertes: number }

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')
const fmtK = (n: number) => `${(n / 1000).toFixed(1)} k`

export default function AnalytiquePage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
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
          campaigns: c.count ?? 0, plantings: p.count ?? 0, harvests: h.count ?? 0,
          dispatches: dispatchesAll.length,
          dispatchesNoPrice: dispatchesAll.filter(r => !r.certificate_number).length,
          costs: costsAll.length,
          costsTotal: costsAll.reduce((s, r) => s + (Number(r.amount) || 0), 0),
          budgetVersions: bv.count ?? 0, alertes: al.count ?? 0,
        })
      } catch (e: any) { /* silent */ }
      finally { setLoading(false) }
    })()
  }, [])

  return (
    <div>
      <PageHeader
        title="IA & Prévisions" subtitle="Analytique" icon={Bot} iconColor="#6366f1"
        description="Vue d'ensemble des données + accès aux analyses IA (Gemini)"
      />

      {/* Stats globales */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-md mb-md">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonKPI key={i} />)}
        </div>
      ) : stats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-md mb-md">
            <KPICard label="Campagnes" value={fmt(stats.campaigns)} icon={Calendar} accent="#8b5cf6" delay={0} />
            <KPICard label="Plantations" value={fmt(stats.plantings)} icon={Sprout} accent="#22c55e" delay={0.05} />
            <KPICard label="Récoltes" value={fmt(stats.harvests)} icon={Sprout} accent="#10b981" delay={0.1} />
            <KPICard label="Dispatches" value={fmt(stats.dispatches)} sub={`${stats.dispatchesNoPrice} sans prix`} icon={Package} accent="#0ea5e9" delay={0.15} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-md mb-xl">
            <KPICard label="Coûts (entrées)" value={fmt(stats.costs)} sub={`${fmtK(stats.costsTotal)} MAD total`} icon={Coins} accent="#f59e0b" delay={0.2} />
            <KPICard label="Versions budget" value={fmt(stats.budgetVersions)} icon={Briefcase} accent="#6366f1" delay={0.25} />
            <KPICard label="Alertes ouvertes" value={fmt(stats.alertes)} icon={Bell} accent="#ef4444" delay={0.3} />
            <KPICard label="Statut" value="OK" icon={Bot} accent="#10b981" delay={0.35} />
          </div>
        </>
      )}

      {/* Cartes IA */}
      <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary mb-md flex items-center gap-2">
        <Bot size={14} className="text-brand" /> Outils d'analyse IA
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-md">
        {[
          { icon: MessageCircle, title: 'Assistant chatbot', desc: "Pose des questions en langage naturel sur tes données : marges, coûts, récoltes, prévisions…", cta: "Ouvrir l'assistant", target: '/admin/compte-exploitation', tip: "Bouton 💬 IA dans la toolbar du Compte d'exploitation", color: '#6366f1' },
          { icon: LineChart, title: "Analyse du compte d'exploitation", desc: 'Diagnostic automatique des écarts budget/réel, alertes de complétude, recommandations.', cta: "Lancer l'analyse", target: '/admin/compte-exploitation', tip: "Bouton 'Analyser avec l'IA' dans la page", color: '#10b981' },
          { icon: TrendingUp, title: 'Marges & rentabilité', desc: 'Vue calculée sur données réelles : CA confirmé × prix, coûts ventilés, marge brute par variété/marché.', cta: 'Voir les marges', target: '/marges', color: '#22c55e' },
        ].map((item, i) => {
          const Icon = item.icon
          return (
            <Card key={i} animate delay={0.4 + i * 0.05} interactive className="flex flex-col">
              <div className="rounded-lg flex items-center justify-center mb-md"
                style={{ width: 48, height: 48, background: `color-mix(in srgb, ${item.color} 14%, transparent)`, color: item.color }}>
                <Icon size={24} strokeWidth={2.2} />
              </div>
              <div className="font-display text-heading font-bold text-fg-primary mb-xs">{item.title}</div>
              <div className="text-body-sm text-fg-secondary leading-relaxed flex-1 mb-md">{item.desc}</div>
              {item.tip && <div className="text-caption text-fg-tertiary italic mb-md">💡 {item.tip}</div>}
              <Link href={item.target}>
                <Button variant="secondary" size="sm" className="w-full">{item.cta} <ArrowRight size={12} /></Button>
              </Link>
            </Card>
          )
        })}
      </div>

      <Card variant="ghost" className="mt-xl border-info/30 bg-info/5">
        <div className="flex items-start gap-sm text-body-sm text-fg-secondary">
          <Info size={14} className="text-info flex-shrink-0 mt-0.5" />
          <div>
            <strong className="text-fg-primary">À propos des prévisions :</strong> les prévisions strictes (modèles statistiques) ne sont pas activées.
            Le moteur IA actuel se base sur Gemini Flash pour de l'analyse qualitative + diagnostics ponctuels. Pour des prévisions volumétriques fiables,
            l'historique nécessaire (≥ 2 saisons) doit être présent en base.
          </div>
        </div>
      </Card>
    </div>
  )
}
