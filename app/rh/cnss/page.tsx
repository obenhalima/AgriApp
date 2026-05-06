'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Building, Settings2, CheckCircle2, Info, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect, Field } from '@/components/ui/Input'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'

type Declaration = {
  id: string; declaration_year: number; declaration_month: number; status: string
  nb_workers: number; total_gross: number
  total_cnss_employee: number; total_cnss_employer: number
  total_amo_employee: number; total_amo_employer: number
  total_family_allowance: number; total_prof_training: number; total_due: number
  declaration_number: string | null; declared_at: string | null
}

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

export default function CNSSPage() {
  const [declarations, setDeclarations] = useState<Declaration[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const load = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('cnss_declarations').select('*').order('declaration_year', { ascending: false }).order('declaration_month', { ascending: false })
      if (error) throw error
      setDeclarations((data ?? []) as any)
    } catch (e: any) { toast.error(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const generateDeclaration = async () => {
    setGenerating(true)
    try {
      const { data: periods, error: pe } = await supabase.from('payroll_periods').select('id').eq('period_year', year).eq('period_month', month)
      if (pe) throw pe
      const periodIds = (periods ?? []).map((p: any) => p.id)
      if (periodIds.length === 0) {
        toast.error(`Aucune période de paie trouvée pour ${MONTHS[month - 1]} ${year}`)
        setGenerating(false); return
      }
      const { data: payslips, error: pse } = await supabase.from('payslips')
        .select('worker_id, gross_salary, cnss_employee, cnss_employer, amo_employee, amo_employer, family_allowance_employer, prof_training_employer')
        .in('period_id', periodIds)
      if (pse) throw pse
      const ps = (payslips ?? []) as any[]
      const agg = ps.reduce((acc, x) => ({
        total_gross: acc.total_gross + Number(x.gross_salary || 0),
        total_cnss_employee: acc.total_cnss_employee + Number(x.cnss_employee || 0),
        total_cnss_employer: acc.total_cnss_employer + Number(x.cnss_employer || 0),
        total_amo_employee: acc.total_amo_employee + Number(x.amo_employee || 0),
        total_amo_employer: acc.total_amo_employer + Number(x.amo_employer || 0),
        total_family_allowance: acc.total_family_allowance + Number(x.family_allowance_employer || 0),
        total_prof_training: acc.total_prof_training + Number(x.prof_training_employer || 0),
      }), { total_gross: 0, total_cnss_employee: 0, total_cnss_employer: 0, total_amo_employee: 0, total_amo_employer: 0, total_family_allowance: 0, total_prof_training: 0 })
      const distinctWorkers = new Set(ps.map(x => x.worker_id)).size
      const total_due = agg.total_cnss_employee + agg.total_cnss_employer + agg.total_amo_employee + agg.total_amo_employer + agg.total_family_allowance + agg.total_prof_training
      const { error: ue } = await supabase.from('cnss_declarations').upsert({
        declaration_year: year, declaration_month: month, status: 'brouillon',
        nb_workers: distinctWorkers, ...agg, total_due,
      }, { onConflict: 'declaration_year,declaration_month' })
      if (ue) throw ue
      toast.success(`Déclaration ${MONTHS[month - 1]} ${year} générée`)
      load()
    } catch (e: any) { toast.error(e.message) }
    setGenerating(false)
  }

  const markDeclared = async (id: string) => {
    const num = prompt('Numéro DAMANCOM (optionnel) :')
    try {
      const { error } = await supabase.from('cnss_declarations').update({
        status: 'declaree', declaration_number: num || null, declared_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error
      toast.success('Déclaration marquée déclarée')
      load()
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
  }

  return (
    <div>
      <PageHeader
        title="Déclarations CNSS" subtitle="Ressources humaines" icon={Building} iconColor="#6366f1"
        description="Récap mensuel des cotisations CNSS — agrégé depuis les bulletins de paie validés"
      />

      {/* Génération */}
      <Card animate delay={0.1} className="mb-md">
        <div className="flex items-center gap-md flex-wrap">
          <span className="font-display text-body font-semibold text-fg-primary flex items-center gap-2">
            <Settings2 size={14} className="text-info" /> Générer / mettre à jour :
          </span>
          <TSelect value={month} onChange={(e) => setMonth(Number(e.target.value))} className="h-9 w-auto min-w-[140px]">
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </TSelect>
          <TInput type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24" />
          <Button onClick={generateDeclaration} loading={generating} variant="primary" size="sm">
            <Settings2 size={12} strokeWidth={2.2} /> Calculer
          </Button>
        </div>
      </Card>

      <Card animate delay={0.2} padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-md space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : declarations.length === 0 ? (
          <EmptyState icon={Building} title="Aucune déclaration" description="Génère ta première déclaration CNSS." />
        ) : (
          <DataTable minWidth={1400}>
            <THead>
              <TR>
                <TH>Période</TH><TH>Statut</TH><TH right>Salariés</TH><TH right>Brut total</TH>
                <TH right>CNSS sal.</TH><TH right>CNSS pat.</TH><TH right>AMO sal.</TH><TH right>AMO pat.</TH>
                <TH right>Alloc. fam.</TH><TH right>Form. pro.</TH><TH right>Total dû</TH>
                <TH>N° DAMANCOM</TH><TH right>Actions</TH>
              </TR>
            </THead>
            <tbody>
              {declarations.map((d, i) => (
                <TR key={d.id} animate delay={0.04 + i * 0.02}>
                  <TD className="font-display font-semibold text-fg-primary">{MONTHS[d.declaration_month - 1]} {d.declaration_year}</TD>
                  <TD><Badge variant={d.status === 'declaree' ? 'success' : 'warning'} size="sm">{d.status}</Badge></TD>
                  <TD right mono>{d.nb_workers}</TD>
                  <TD right mono>{Math.round(d.total_gross).toLocaleString('fr-FR')}</TD>
                  <TD right mono>{Math.round(d.total_cnss_employee).toLocaleString('fr-FR')}</TD>
                  <TD right mono>{Math.round(d.total_cnss_employer).toLocaleString('fr-FR')}</TD>
                  <TD right mono>{Math.round(d.total_amo_employee).toLocaleString('fr-FR')}</TD>
                  <TD right mono>{Math.round(d.total_amo_employer).toLocaleString('fr-FR')}</TD>
                  <TD right mono>{Math.round(d.total_family_allowance).toLocaleString('fr-FR')}</TD>
                  <TD right mono>{Math.round(d.total_prof_training).toLocaleString('fr-FR')}</TD>
                  <TD right mono className="text-success font-bold">{Math.round(d.total_due).toLocaleString('fr-FR')}</TD>
                  <TD mono className="text-caption text-fg-tertiary">{d.declaration_number ?? '—'}</TD>
                  <TD right>
                    {d.status === 'brouillon' && (
                      <Button onClick={() => markDeclared(d.id)} variant="primary" size="xs"><CheckCircle2 size={11} /> Déclarer</Button>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>

      <Card variant="ghost" className="mt-md border-info/30 bg-info/5">
        <div className="flex items-start gap-sm text-body-sm text-fg-secondary">
          <Info size={14} className="text-info flex-shrink-0 mt-0.5" />
          <div>
            <strong className="text-fg-primary">Taux appliqués (Maroc, en vigueur)</strong>
            <ul className="mt-2 space-y-1 list-disc list-inside text-caption">
              <li>CNSS salarié <strong>4,48 %</strong> (plafonné à 6 000 MAD/mois) — patronale <strong>8,98 %</strong></li>
              <li>AMO salarié <strong>2,26 %</strong> — patronale <strong>4,11 %</strong> (non plafonnées)</li>
              <li>Allocations familiales <strong>6,4 %</strong> (patronal, plafonné CNSS)</li>
              <li>Taxe formation professionnelle <strong>1,6 %</strong> (patronal, non plafonnée)</li>
              <li>Export PDF DAMANCOM en V2</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  )
}
