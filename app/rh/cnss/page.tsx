'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fmtMAD } from '@/lib/payroll'

type Declaration = {
  id: string; declaration_year: number; declaration_month: number; status: string
  nb_workers: number; total_gross: number
  total_cnss_employee: number; total_cnss_employer: number
  total_amo_employee: number; total_amo_employer: number
  total_family_allowance: number; total_prof_training: number; total_due: number
  declaration_number: string | null; declared_at: string | null
}

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

export default function CNSSPage() {
  const [declarations, setDeclarations] = useState<Declaration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)

  // Form génération
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const { data, error } = await supabase.from('cnss_declarations')
        .select('*').order('declaration_year', { ascending: false }).order('declaration_month', { ascending: false })
      if (error) throw error
      setDeclarations((data ?? []) as any)
    } catch (e: any) { setError(e.message || String(e)) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const generateDeclaration = async () => {
    setGenerating(true); setError('')
    try {
      // Agrège tous les bulletins de la période (toutes périodes payroll du mois)
      const { data: periods, error: pe } = await supabase.from('payroll_periods')
        .select('id').eq('period_year', year).eq('period_month', month)
      if (pe) throw pe
      const periodIds = (periods ?? []).map((p: any) => p.id)
      if (periodIds.length === 0) {
        setError(`Aucune période de paie trouvée pour ${MONTHS[month - 1]} ${year}. Créez d'abord les bulletins.`)
        setGenerating(false); return
      }

      const { data: payslips, error: pse } = await supabase.from('payslips')
        .select('worker_id, gross_salary, cnss_employee, cnss_employer, amo_employee, amo_employer, family_allowance_employer, prof_training_employer')
        .in('period_id', periodIds)
      if (pse) throw pse
      const ps = (payslips ?? []) as any[]

      const agg = ps.reduce((acc, x) => ({
        nb_workers: acc.nb_workers, // recalculé via Set
        total_gross: acc.total_gross + Number(x.gross_salary || 0),
        total_cnss_employee: acc.total_cnss_employee + Number(x.cnss_employee || 0),
        total_cnss_employer: acc.total_cnss_employer + Number(x.cnss_employer || 0),
        total_amo_employee: acc.total_amo_employee + Number(x.amo_employee || 0),
        total_amo_employer: acc.total_amo_employer + Number(x.amo_employer || 0),
        total_family_allowance: acc.total_family_allowance + Number(x.family_allowance_employer || 0),
        total_prof_training: acc.total_prof_training + Number(x.prof_training_employer || 0),
      }), { nb_workers: 0, total_gross: 0, total_cnss_employee: 0, total_cnss_employer: 0, total_amo_employee: 0, total_amo_employer: 0, total_family_allowance: 0, total_prof_training: 0 })
      const distinctWorkers = new Set(ps.map(x => x.worker_id)).size

      const total_due = agg.total_cnss_employee + agg.total_cnss_employer
        + agg.total_amo_employee + agg.total_amo_employer
        + agg.total_family_allowance + agg.total_prof_training

      const { error: ue } = await supabase.from('cnss_declarations').upsert({
        declaration_year: year,
        declaration_month: month,
        status: 'brouillon',
        nb_workers: distinctWorkers,
        total_gross: agg.total_gross,
        total_cnss_employee: agg.total_cnss_employee,
        total_cnss_employer: agg.total_cnss_employer,
        total_amo_employee: agg.total_amo_employee,
        total_amo_employer: agg.total_amo_employer,
        total_family_allowance: agg.total_family_allowance,
        total_prof_training: agg.total_prof_training,
        total_due,
      }, { onConflict: 'declaration_year,declaration_month' })
      if (ue) throw ue
      load()
    } catch (e: any) { setError(e.message || String(e)) }
    setGenerating(false)
  }

  const markDeclared = async (id: string) => {
    const num = prompt('Numéro DAMANCOM (optionnel) :')
    const { error } = await supabase.from('cnss_declarations').update({
      status: 'declaree',
      declaration_number: num || null,
      declared_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) alert('Erreur : ' + error.message); else load()
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1500 }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-main)' }}>
          🏛️ Déclarations CNSS
        </h1>
        <div style={{ color: 'var(--text-sub)', fontSize: 12.5, marginTop: 4 }}>
          Récap mensuel des cotisations dues à la CNSS — agrégé depuis les bulletins de paie validés
        </div>
      </header>

      {error && (
        <div style={{ padding: 12, marginBottom: 14, background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 6, color: 'var(--text-main)', fontSize: 12.5 }}>
          ⚠ {error}
        </div>
      )}

      {/* Génération */}
      <div style={{ padding: 14, background: 'var(--bg-1)', border: '1px solid var(--bd-1)', borderRadius: 10, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>📊 Générer / mettre à jour une déclaration :</span>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          style={{ padding: '6px 10px', background: 'var(--bg-2)', color: 'var(--text-main)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 12 }}>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <input type="number" value={year} onChange={e => setYear(Number(e.target.value))}
          style={{ padding: '6px 10px', width: 90, background: 'var(--bg-2)', color: 'var(--text-main)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 12 }} />
        <button onClick={generateDeclaration} disabled={generating} className="btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}>
          {generating ? '…' : '⚙ Calculer'}
        </button>
      </div>

      {/* Liste des déclarations */}
      <div style={{ border: '1px solid var(--bd-1)', borderRadius: 8, overflow: 'auto', background: 'var(--bg-1)' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--bg-2)' }}>
            <tr>
              {['Période', 'Statut', 'Salariés', 'Brut total', 'CNSS sal.', 'CNSS pat.', 'AMO sal.', 'AMO pat.', 'Alloc. fam.', 'Form. pro.', 'Total dû', 'N° DAMANCOM', 'Actions'].map(h => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={13} style={{ padding: 16, textAlign: 'center', color: 'var(--text-sub)' }}>Chargement…</td></tr>}
            {!loading && declarations.length === 0 && <tr><td colSpan={13} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Aucune déclaration. Cliquez "⚙ Calculer".</td></tr>}
            {declarations.map(d => (
              <tr key={d.id} style={{ borderBottom: '1px solid var(--bd-1)' }}>
                <td style={{ ...td, fontWeight: 600 }}>{MONTHS[d.declaration_month - 1]} {d.declaration_year}</td>
                <td style={td}>
                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10.5, fontWeight: 600,
                    background: d.status === 'declaree' ? 'var(--neon-dim)' : 'var(--amber-dim)',
                    color: d.status === 'declaree' ? 'var(--neon)' : 'var(--amber)' }}>
                    {d.status}
                  </span>
                </td>
                <td style={tdNum}>{d.nb_workers}</td>
                <td style={tdNum}>{Math.round(d.total_gross).toLocaleString('fr-FR')}</td>
                <td style={tdNum}>{Math.round(d.total_cnss_employee).toLocaleString('fr-FR')}</td>
                <td style={tdNum}>{Math.round(d.total_cnss_employer).toLocaleString('fr-FR')}</td>
                <td style={tdNum}>{Math.round(d.total_amo_employee).toLocaleString('fr-FR')}</td>
                <td style={tdNum}>{Math.round(d.total_amo_employer).toLocaleString('fr-FR')}</td>
                <td style={tdNum}>{Math.round(d.total_family_allowance).toLocaleString('fr-FR')}</td>
                <td style={tdNum}>{Math.round(d.total_prof_training).toLocaleString('fr-FR')}</td>
                <td style={{ ...tdNum, color: 'var(--neon)', fontWeight: 700 }}>{Math.round(d.total_due).toLocaleString('fr-FR')}</td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-sub)' }}>{d.declaration_number ?? '—'}</td>
                <td style={td}>
                  {d.status === 'brouillon' && (
                    <button onClick={() => markDeclared(d.id)} className="btn-primary" style={{ fontSize: 10, padding: '3px 8px' }}>✓ Marquer déclarée</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-2)', border: '1px solid var(--bd-1)', borderRadius: 8, fontSize: 11.5, color: 'var(--text-sub)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--text-main)' }}>ⓘ Taux appliqués (Maroc, en vigueur)</strong><br/>
        • CNSS salarié 4,48 % (plafonné à 6 000 MAD/mois) — patronale 8,98 %<br/>
        • AMO salarié 2,26 % — patronale 4,11 % (non plafonnées)<br/>
        • Allocations familiales 6,4 % (patronal, plafonné CNSS)<br/>
        • Taxe formation professionnelle 1,6 % (patronal, non plafonnée)<br/>
        • L'export PDF de la déclaration DAMANCOM sera disponible en V2.
      </div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text-sub)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: .5, borderBottom: '1px solid var(--bd-1)' }
const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text-main)' }
const tdNum: React.CSSProperties = { padding: '8px 10px', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', textAlign: 'right' }
