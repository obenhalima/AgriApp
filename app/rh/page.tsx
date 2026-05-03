'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { fmtMAD } from '@/lib/payroll'

type Stats = {
  totalEmployes: number
  fermiers: number
  staff: number
  saisonniers: number
  tacherons: number
  paie_mois_actuel: number
  conges_en_attente: number
  declarations_brouillon: number
}

export default function RHDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const now = new Date()
        const year = now.getFullYear(), month = now.getMonth() + 1
        const [w, p, lr, cd] = await Promise.all([
          supabase.from('workers').select('id, category').eq('is_active', true),
          supabase.from('payslips').select('total_employer_cost, payroll_periods!inner(period_year, period_month)')
            .eq('payroll_periods.period_year', year)
            .eq('payroll_periods.period_month', month),
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
          👥 Ressources Humaines
        </h1>
        <div style={{ color: 'var(--text-sub)', fontSize: 12.5, marginTop: 4 }}>
          Gestion des employés, paie, congés et déclarations CNSS — conforme aux standards Maroc
        </div>
      </header>

      {error && (
        <div style={{ padding: 12, marginBottom: 14, background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 6, color: 'var(--text-main)', fontSize: 12.5 }}>
          ⚠ {error}
        </div>
      )}

      {/* KPIs effectif */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 14 }}>
        <KPI label="Effectif total"  value={stats?.totalEmployes ?? '…'} sub="actifs"             color="#0ea5e9" icon="👥" />
        <KPI label="Fermiers"        value={stats?.fermiers ?? '…'}      sub="paie quinzaine"     color="#10b981" icon="🌾" />
        <KPI label="Staff admin"     value={stats?.staff ?? '…'}         sub="paie mensuelle"     color="#8b5cf6" icon="🧑‍💼" />
        <KPI label="Saisonniers"     value={stats?.saisonniers ?? '…'}    sub="contrat CDD"        color="#f59e0b" icon="🌻" />
        <KPI label="Staff à la tâche" value={stats?.tacherons ?? '…'}     sub="missions ponctuelles" color="#ec4899" icon="🛠️" />
      </div>

      {/* KPIs financiers / opérationnels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
        <KPI label="Masse salariale (mois)" value={stats ? fmtMAD(stats.paie_mois_actuel) : '…'} sub="coût employeur total" color="#10b981" icon="💵" />
        <KPI label="Congés en attente"      value={stats?.conges_en_attente ?? '…'}              sub="à approuver"        color="#f59e0b" icon="🏖️" />
        <KPI label="CNSS à déclarer"        value={stats?.declarations_brouillon ?? '…'}         sub="déclarations brouillon" color="#6366f1" icon="🏛️" />
      </div>

      {/* Cartes vers sous-modules */}
      <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>
        Modules
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12 }}>
        <ModuleCard icon="🪪" title="Employés"
          description="Annuaire des collaborateurs : matricule, CNSS, contrat, situation familiale, IBAN."
          href="/rh/employes" cta="Gérer les employés" />
        <ModuleCard icon="💵" title="Paie"
          description="Périodes mensuelles (staff) ou bimensuelles (fermiers, le 15 et fin de mois). Calcul automatique CNSS, AMO, IR."
          href="/rh/paie" cta="Gérer la paie" />
        <ModuleCard icon="🏖️" title="Congés"
          description="Demandes, soldes (1,5 j/mois acquis), maladie, maternité, congés spéciaux."
          href="/rh/conges" cta="Voir les congés" />
        <ModuleCard icon="🏛️" title="Déclarations CNSS"
          description="Récap mensuel : assiette, cotisations salariales et patronales, total à régler."
          href="/rh/cnss" cta="Déclarations" />
      </div>

      <div style={{ marginTop: 24, padding: 12, background: 'var(--bg-2)', border: '1px solid var(--bd-1)', borderRadius: 8, fontSize: 11.5, color: 'var(--text-sub)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text-main)' }}>ⓘ Intégration comptable</strong><br/>
        Chaque bulletin validé génère automatiquement une écriture dans <Link href="/couts" style={{ color: 'var(--neon)' }}>Coûts</Link> sous la catégorie <em>Salaires &amp; charges sociales</em>, ce qui alimente le <Link href="/admin/compte-exploitation" style={{ color: 'var(--neon)' }}>Compte d'exploitation</Link> en temps réel.
      </div>
    </div>
  )
}

function KPI({ label, value, sub, color, icon }: { label: string; value: any; sub: string; color: string; icon: string }) {
  return (
    <div style={{
      padding: 14, background: 'var(--bg-1)', border: '1px solid var(--bd-1)',
      borderRadius: 10, borderTop: `2px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 18 }}>{icon}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: 'var(--font-display)' }}>
        {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function ModuleCard({ icon, title, description, href, cta }: {
  icon: string; title: string; description: string; href: string; cta: string
}) {
  return (
    <div style={{
      padding: 16, background: 'var(--bg-1)', border: '1px solid var(--bd-1)',
      borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontSize: 26 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-main)' }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.5, flex: 1 }}>{description}</div>
      <Link href={href} style={{
        textDecoration: 'none', textAlign: 'center', marginTop: 4,
        padding: '8px 14px', background: 'var(--neon-dim)',
        border: '1px solid var(--neon)', borderRadius: 6,
        color: 'var(--neon)', fontSize: 12, fontWeight: 600,
      }}>{cta} →</Link>
    </div>
  )
}
