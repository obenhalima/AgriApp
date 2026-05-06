'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Users, UserSquare, Banknote, Palmtree, Building, AlertCircle, Info, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtMAD } from '@/lib/payroll'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton, SkeletonKPI } from '@/components/ui/Skeleton'
import { KPICard } from '@/components/ui/KPICard'

type Stats = {
  totalEmployes: number; fermiers: number; staff: number; saisonniers: number; tacherons: number
  paie_mois_actuel: number; conges_en_attente: number; declarations_brouillon: number
}

export default function RHDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const now = new Date()
        const year = now.getFullYear(), month = now.getMonth() + 1
        const [w, p, lr, cd] = await Promise.all([
          supabase.from('workers').select('id, category').eq('is_active', true),
          supabase.from('payslips').select('total_employer_cost, payroll_periods!inner(period_year, period_month)')
            .eq('payroll_periods.period_year', year).eq('payroll_periods.period_month', month),
          supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'demande'),
          supabase.from('cnss_declarations').select('id', { count: 'exact', head: true }).eq('status', 'brouillon'),
        ])
        const workers = (w.data ?? []) as any[]
        const payslips = (p.data ?? []) as any[]
        setStats({
          totalEmployes: workers.length,
          fermiers: workers.filter(x => x.category === 'fermier').length,
          staff: workers.filter(x => x.category === 'staff_admin').length,
          saisonniers: workers.filter(x => x.category === 'saisonnier').length,
          tacherons: workers.filter(x => x.category === 'tacheron').length,
          paie_mois_actuel: payslips.reduce((s, r) => s + (Number(r.total_employer_cost) || 0), 0),
          conges_en_attente: lr.count ?? 0,
          declarations_brouillon: cd.count ?? 0,
        })
      } catch (e: any) { setError(e.message || String(e)) }
      finally { setLoading(false) }
    })()
  }, [])

  return (
    <div>
      <PageHeader
        title="Ressources Humaines" subtitle="Tableau de bord" icon={Users} iconColor="#0ea5e9"
        description="Gestion des employés, paie, congés et déclarations CNSS — conforme aux standards Maroc"
      />

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-md text-danger text-body-sm flex items-center gap-2 mb-md">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* KPIs effectif */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-md mb-md">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonKPI key={i} />)}
        </div>
      ) : stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-md mb-md">
          <KPICard label="Effectif total" value={String(stats.totalEmployes)} sub="actifs" icon={Users} accent="#0ea5e9" delay={0} />
          <KPICard label="Fermiers" value={String(stats.fermiers)} sub="paie quinzaine" icon={UserSquare} accent="#10b981" delay={0.05} />
          <KPICard label="Staff admin" value={String(stats.staff)} sub="paie mensuelle" icon={Building} accent="#8b5cf6" delay={0.1} />
          <KPICard label="Saisonniers" value={String(stats.saisonniers)} sub="contrat CDD" icon={UserSquare} accent="#f59e0b" delay={0.15} />
          <KPICard label="Staff à la tâche" value={String(stats.tacherons)} sub="missions ponctuelles" icon={UserSquare} accent="#ec4899" delay={0.2} />
        </div>
      )}

      {/* KPIs financiers */}
      {!loading && stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-md mb-xl">
          <KPICard label="Masse salariale (mois)" value={fmtMAD(stats.paie_mois_actuel)} sub="coût employeur total" icon={Banknote} accent="#10b981" variant="hero" delay={0.25} />
          <KPICard label="Congés en attente" value={String(stats.conges_en_attente)} sub="à approuver" icon={Palmtree} accent="#f59e0b" variant="hero" delay={0.3} />
          <KPICard label="CNSS à déclarer" value={String(stats.declarations_brouillon)} sub="déclarations brouillon" icon={Building} accent="#6366f1" variant="hero" delay={0.35} />
        </div>
      )}

      {/* Modules */}
      <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary mb-md">Modules</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
        {[
          { icon: UserSquare, title: 'Employés', desc: 'Annuaire : matricule, CNSS, contrat, situation, IBAN.', href: '/rh/employes', cta: 'Gérer', color: '#0ea5e9' },
          { icon: Banknote, title: 'Paie', desc: 'Périodes mensuelles ou bimensuelles. Calcul auto CNSS, AMO, IR.', href: '/rh/paie', cta: 'Gérer la paie', color: '#10b981' },
          { icon: Palmtree, title: 'Congés', desc: 'Demandes, soldes (1,5 j/mois acquis), maladie, maternité.', href: '/rh/conges', cta: 'Voir', color: '#f59e0b' },
          { icon: Building, title: 'Déclarations CNSS', desc: 'Récap mensuel : assiette, cotisations, total à régler.', href: '/rh/cnss', cta: 'Déclarations', color: '#6366f1' },
        ].map((m, i) => {
          const Icon = m.icon
          return (
            <Card key={i} animate delay={0.4 + i * 0.05} interactive className="flex flex-col">
              <div className="rounded-lg flex items-center justify-center mb-md"
                style={{ width: 48, height: 48, background: `color-mix(in srgb, ${m.color} 14%, transparent)`, color: m.color }}>
                <Icon size={24} strokeWidth={2.2} />
              </div>
              <div className="font-display text-heading font-bold text-fg-primary mb-xs">{m.title}</div>
              <div className="text-body-sm text-fg-secondary leading-relaxed flex-1 mb-md">{m.desc}</div>
              <Link href={m.href}>
                <Button variant="secondary" size="sm" className="w-full">
                  {m.cta} <ArrowRight size={12} strokeWidth={2.2} />
                </Button>
              </Link>
            </Card>
          )
        })}
      </div>

      <Card variant="ghost" className="mt-xl border-info/30 bg-info/5">
        <div className="flex items-start gap-sm text-body-sm text-fg-secondary">
          <Info size={14} className="text-info flex-shrink-0 mt-0.5" />
          <div>
            <strong className="text-fg-primary">Intégration comptable :</strong> chaque bulletin validé génère automatiquement
            une écriture dans <Link href="/couts" className="text-brand hover:underline">Coûts</Link> sous la catégorie
            {' '}<em>Salaires &amp; charges sociales</em>, qui alimente le{' '}
            <Link href="/admin/compte-exploitation" className="text-brand hover:underline">Compte d'exploitation</Link> en temps réel.
          </div>
        </div>
      </Card>
    </div>
  )
}
