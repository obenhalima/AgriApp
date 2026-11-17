'use client'

import {useEffect, useState} from 'react'
import Link from 'next/link'
import {Users, ClipboardCheck, Banknote, Wallet, Clock, LayoutDashboard, RefreshCw, ArrowRight} from 'lucide-react'
import {useAuth} from '@/lib/auth'
import {useLanguage} from '@/lib/i18n'
import {hrNavigation} from '@/lib/hrWorkflow'
import {listClientWorkerFarms, listClientWorkers, type WorkerFarm} from '@/lib/workerScope'
import {listAttendanceHistory} from '@/lib/attendanceApi'
import {listPayrollPreparationHistory} from '@/lib/payrollPreparationApi'
import {attendancePaymentSummary} from '@/lib/attendanceHistory'
import {supabase} from '@/lib/supabase'
import {rhPeriodMatches, rhPayrollTotals, rhFortnightChecks, expectedCampaignFortnights, type RhCampaign} from '@/lib/rhDashboard'
import {PageHeader} from '@/components/ui/PageHeader'
import {Card} from '@/components/ui/Card'
import {Button} from '@/components/ui/Button'
import {KPICard} from '@/components/ui/KPICard'
import {FilterableTable} from '@/components/ui/FilterableTable'

export default function FortnightRhDashboard({domain, client}: {domain: string; client: string}) {
  const {t, intlLocale} = useLanguage()
  const {hasPermission} = useAuth()
  const canWorkers = hasPermission('rh_employes'), canAttendance = hasPermission('pointage'), canPayroll = hasPermission('rh_paie')
  const [farms, setFarms] = useState<WorkerFarm[]>([])
  const [workers, setWorkers] = useState<Awaited<ReturnType<typeof listClientWorkers>> | null>(null)
  const [attendance, setAttendance] = useState<Awaited<ReturnType<typeof listAttendanceHistory>> | null>(null)
  const [payroll, setPayroll] = useState<Awaited<ReturnType<typeof listPayrollPreparationHistory>> | null>(null)
  const [farm, setFarm] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState('')
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<string[]>([])
  const [refresh, setRefresh] = useState(0)
  const [incompleteOnly, setIncompleteOnly] = useState(true)
  const [campaigns, setCampaigns] = useState<RhCampaign[] | null>(null)
  const [campaignId, setCampaignId] = useState('')
  useEffect(() => {
    let cancelled = false
    setLoading(true); setErrors([]); setWorkers(null); setAttendance(null); setPayroll(null); setCampaigns(null)
    async function readCampaigns() {
      const result: RhCampaign[] = []
      for (let offset = 0; ; offset += 500) {
        const page = await supabase.from('campaigns').select('id,code,name,farm_id,status,preparation_start,planting_start,harvest_start,campaign_end')
          .eq('domain_id', domain).order('id').range(offset, offset + 499)
        if (page.error) throw page.error
        result.push(...(page.data || []))
        if (!page.data || page.data.length < 500) return result
      }
    }
    Promise.allSettled([
      listClientWorkerFarms(domain),
      canWorkers ? listClientWorkers(domain) : Promise.resolve(null),
      canAttendance ? listAttendanceHistory(domain, false) : Promise.resolve(null),
      canPayroll ? listPayrollPreparationHistory(domain) : Promise.resolve(null),
      canAttendance && canPayroll ? readCampaigns() : Promise.resolve(null),
    ]).then(([farmResult, workerResult, attendanceResult, payrollResult, campaignResult]) => {
      if (cancelled) return
      if (farmResult.status === 'fulfilled') setFarms(farmResult.value)
      if (workerResult.status === 'fulfilled') setWorkers(workerResult.value)
      if (attendanceResult.status === 'fulfilled') setAttendance(attendanceResult.value)
      if (payrollResult.status === 'fulfilled') setPayroll(payrollResult.value)
      if (campaignResult.status === 'fulfilled') setCampaigns(campaignResult.value)
      setErrors([farmResult, workerResult, attendanceResult, payrollResult, campaignResult].flatMap(result => result.status === 'rejected' ? [result.reason.message || String(result.reason)] : []))
      setLoading(false)
    })
    return () => {cancelled = true}
  }, [domain, canWorkers, canAttendance, canPayroll, refresh])

  const periods = attendance?.periods.filter(item => rhPeriodMatches(item, farm, year, month)) || []
  const preparations = payroll?.preparations.filter(item => rhPeriodMatches(item, farm, year, month)) || []
  const totals = payroll ? rhPayrollTotals(preparations, payroll.payments) : null
  const selectedCampaigns = campaigns?.filter(item => (!farm || item.farm_id === farm) && (campaignId ? item.id === campaignId : item.status === 'en_cours')) || []
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date())
  const expected = expectedCampaignFortnights(selectedCampaigns, today)
  const checks = attendance && payroll && campaigns ? rhFortnightChecks(attendance.periods, payroll.preparations, payroll.payments, expected.periods) : null
  const pending = checks?.filter(item => !item.complete)
  const shownChecks = incompleteOnly ? pending : checks
  const active = workers?.filter(worker => worker.is_active && (!farm || worker.farm_id === farm)).length
  const money = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString(intlLocale, {style: 'currency', currency: 'MAD'})
  const date = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString(intlLocale, {timeZone: 'UTC'})
  const farmName = (id: string) => farms.find(item => item.id === id)?.name || id
  const href = (path: string, item: {farm_id: string; start_date: string}) => {
    const [y, m, d] = item.start_date.split('-').map(Number)
    return `${path}?farm=${item.farm_id}&year=${y}&month=${m}&half=${d === 1 ? 'first' : 'second'}`
  }
  const control = 'rounded-md border border-border bg-surface-input px-3 py-2 text-body-sm focus:ring-2 focus:ring-brand'
  const entries = hrNavigation(client).find(group => group.section === 'RESSOURCES HUMAINES')!.items.filter(item => item.href !== '/rh' && hasPermission(item.moduleCode))
  return <main className="space-y-lg">
    <PageHeader title={t('Ressources humaines')} subtitle={`${t('Parcours quinzaine')} · ${client}`} icon={LayoutDashboard} iconColor="#ec4899" actions={<Button variant="ghost" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={14}/>{t('Actualiser')}</Button>}/>
    <Card className="flex flex-wrap items-end gap-md">
      <label className="text-body-sm">{t('Ferme')}<select className={`${control} block mt-1`} aria-label={t('Ferme')} value={farm} onChange={event => {setFarm(event.target.value); setCampaignId('')}}><option value="">{t('Toutes les fermes')}</option>{farms.map(item => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label>
      <label className="text-body-sm">{t('Année')}<select className={`${control} block mt-1`} aria-label={t('Année')} value={year} onChange={event => setYear(Number(event.target.value))}>{[...new Set([new Date().getFullYear(), ...Array.from({length: 6}, (_, index) => new Date().getFullYear() - index), ...(payroll?.preparations || []).map(item => Number(item.start_date.slice(0, 4))), ...(attendance?.periods || []).map(item => Number(item.start_date.slice(0, 4)))])].sort().map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="text-body-sm">{t('Mois')}<select className={`${control} block mt-1`} aria-label={t('Mois')} value={month} onChange={event => setMonth(event.target.value)}><option value="">{t('Tous les mois')}</option>{Array.from({length: 12}, (_, index) => <option key={index} value={String(index + 1)}>{new Date(2026, index, 1).toLocaleString(intlLocale, {month: 'long'})}</option>)}</select></label>
      <p className="text-caption text-fg-secondary">{t('Montants des paies validées de la période sélectionnée. Effectif actif actuel.')}</p>
    </Card>
    {!!errors.length && <div role="alert" className="rounded-md border border-danger/30 bg-danger/10 p-md text-danger"><p>{t('Certaines données RH sont indisponibles.')}</p>{errors.map((error, index) => <p key={index}>{t(error)}</p>)}</div>}
    {loading && <p role="status" className="text-info">{t('Chargement…')}</p>}
    {canAttendance && canPayroll && <Card role="region" aria-label={t('Contrôle des quinzaines')} className="space-y-md">
      <div className="flex flex-wrap justify-between items-center gap-md"><h2 className="font-display font-bold text-heading-sm">{t('Contrôle des quinzaines')} · {pending?.length ?? '—'} {t('à compléter')}</h2><label className="flex items-center gap-2 text-body-sm"><input type="checkbox" checked={incompleteOnly} onChange={event => setIncompleteOnly(event.target.checked)}/>{t('Afficher seulement les quinzaines à compléter')}</label></div>
      <label className="block text-body-sm">{t('Campagne à contrôler')}<select className={`${control} block mt-1 max-w-full`} aria-label={t('Campagne à contrôler')} value={campaignId} onChange={event => setCampaignId(event.target.value)}><option value="">{t('Campagnes en cours')}</option>{campaigns?.filter(item => !farm || item.farm_id === farm).map(item => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label>
      <p className="text-body-sm text-fg-secondary">{t('Toutes les quinzaines échues depuis le début de campagne sont contrôlées, y compris sans saisie. Les filtres année et mois concernent les indicateurs ci-dessous.')}</p>
      {selectedCampaigns.map(item => <p key={item.id} className="text-caption text-fg-secondary">{item.name} · {t('Début du contrôle')} · {item.preparation_start || '—'}</p>)}
      {!!expected.missingDates.length && <p role="alert" className="rounded-md bg-warning/10 p-md text-warning">{t('Date de début de campagne à renseigner')} · {expected.missingDates.join(', ')}</p>}
      {!loading && campaigns && !selectedCampaigns.length && <p role="status" className="rounded-md bg-warning/10 p-md text-warning">{t('Sélectionnez une campagne avec une date de début pour lancer le contrôle.')}</p>}
      {checks ? <><div className="overflow-x-auto"><FilterableTable className="w-full text-body-sm"><thead className="bg-surface-input"><tr>{['Ferme', 'Quinzaine', 'Pointage', 'Paie', 'Paiement', 'Reste à payer', 'Statut', 'Actions'].map(label => <th key={label} className="p-md text-start whitespace-nowrap">{t(label)}</th>)}</tr></thead><tbody>{shownChecks?.map(item => <tr key={item.key} className="border-t border-border hover:bg-surface-hover">
        <td className="p-md">{farmName(item.farm_id)}</td><td className="p-md whitespace-nowrap">{date(item.start_date)} — {date(item.end_date)}</td>
        {[[item.attendanceOk, item.attendanceLabel], [item.payrollOk, item.payrollLabel], [item.paymentOk, item.paymentLabel]].map(([ok, label], index) => <td key={index} className="p-md"><span className={`rounded-md px-2 py-1 whitespace-nowrap ${ok ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{ok && '✓ '}{t(String(label))}</span></td>)}
        <td className="p-md whitespace-nowrap">{money(item.remaining)}</td><td className="p-md"><span className={`rounded-md px-2 py-1 whitespace-nowrap ${item.complete ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{t(item.complete ? 'Complète' : item.unrecorded ? 'Non saisie' : 'À compléter')}</span></td>
        <td className="p-md"><div className="flex flex-col gap-2 whitespace-nowrap"><Link className="text-brand underline" href={href('/pointage', item)}>{t('Vérifier le pointage')}</Link><Link className="text-brand underline" href={href('/rh/paie', item)}>{t('Vérifier la paie')}</Link></div></td>
      </tr>)}</tbody></FilterableTable></div>{!shownChecks?.length && selectedCampaigns.length > 0 && !expected.missingDates.length && <p role="status" className="rounded-md bg-success/10 p-md text-success">{t(checks.length ? 'Toutes les quinzaines échues de la campagne sont complètes.' : 'Aucune quinzaine échue depuis le début de campagne.')}</p>}</> : !loading && <p role="alert" className="rounded-md bg-warning/10 p-md text-warning">{t('Contrôle indisponible : rechargez les données de pointage et de paie.')}</p>}
    </Card>}
    <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-3">
      {canWorkers && <KPICard label={t('Employés actifs')} value={active ?? '—'} icon={Users} accent="#0ea5e9"/>}
      {canAttendance && <KPICard label={t('Pointages à valider')} value={attendance ? periods.filter(item => item.status === 'draft').length : '—'} icon={ClipboardCheck} accent="#f59e0b" sub={t('Quinzaines en brouillon')}/>}
      {canPayroll && <><KPICard label={t('Paies en brouillon')} value={totals?.drafts ?? '—'} icon={Clock} accent="#8b5cf6"/><KPICard label={t('Net validé')} value={money(totals?.net)} icon={Banknote} accent="#10b981"/><KPICard label={t('Montant payé')} value={money(totals?.paid)} icon={Wallet} accent="#0ea5e9"/><KPICard label={t('Reste à payer')} value={money(totals?.remaining)} icon={Wallet} accent="#f59e0b"/></>}
    </div>
    <div className="grid gap-md md:grid-cols-3">{entries.map(item => <Link key={item.href} href={item.href}><Card interactive className="h-full flex items-start gap-md"><item.icon size={24} className="text-brand shrink-0"/><div className="flex-1"><h2 className="font-display font-bold text-heading-sm">{t(item.label)}</h2><p className="text-body-sm text-fg-secondary mt-1">{t(item.description || '')}</p></div><ArrowRight size={16} className="text-fg-tertiary"/></Card></Link>)}</div>
    {canPayroll && <Card padding="none" className="overflow-hidden">
      <div className="p-md border-b border-border flex flex-wrap justify-between gap-3"><h2 className="font-display font-bold text-heading-sm">{t('Suivi des paies')}</h2><span className="text-body-sm text-fg-secondary">{t('Coût employeur')} · {money(totals?.cost)}</span></div>
      <div className="overflow-x-auto"><FilterableTable className="w-full text-body-sm"><thead className="bg-surface-input"><tr>{['Ferme', 'Quinzaine', 'Paiement', 'Net à payer', 'Montant payé', 'Reste à payer', 'Actions'].map(label => <th key={label} className="p-md text-start whitespace-nowrap">{t(label)}</th>)}</tr></thead><tbody>{preparations.map(item => {
        const summary = attendancePaymentSummary(item, payroll?.payments || [])
        return <tr key={item.id} className="border-t border-border hover:bg-surface-hover"><td className="p-md">{farmName(item.farm_id)}</td><td className="p-md whitespace-nowrap">{date(item.start_date)} — {date(item.end_date)}</td><td className="p-md"><span className={`rounded-md px-2 py-1 whitespace-nowrap ${summary.label === 'Payé' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{t(summary.label)}</span></td><td className="p-md whitespace-nowrap">{money(summary.net)}</td><td className="p-md whitespace-nowrap">{money(summary.paid)}</td><td className="p-md whitespace-nowrap">{money(summary.remaining)}</td><td className="p-md"><Link href={href('/rh/paie', item)} className="text-brand underline whitespace-nowrap">{t('Ouvrir la paie')}</Link></td></tr>
      })}</tbody></FilterableTable></div>
      {!loading && !preparations.length && <p className="p-lg text-fg-secondary">{t(payroll ? 'Aucune paie enregistrée' : 'Données indisponibles')}</p>}
    </Card>}
    {canAttendance && <Card padding="none" className="overflow-hidden"><h2 className="p-md font-display font-bold text-heading-sm border-b border-border">{t('Suivi des pointages')}</h2><div className="overflow-x-auto"><FilterableTable className="w-full text-body-sm"><thead className="bg-surface-input"><tr>{['Ferme', 'Quinzaine', 'Pointage', 'Actions'].map(label => <th key={label} className="p-md text-start">{t(label)}</th>)}</tr></thead><tbody>{periods.map(item => <tr key={item.id} className="border-t border-border hover:bg-surface-hover"><td className="p-md">{farmName(item.farm_id)}</td><td className="p-md whitespace-nowrap">{date(item.start_date)} — {date(item.end_date)}</td><td className="p-md"><span className={`rounded-md px-2 py-1 ${item.status === 'validated' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{t(item.status === 'validated' ? 'Validé' : 'Brouillon')}</span></td><td className="p-md"><Link className="text-brand underline whitespace-nowrap" href={href('/pointage', item)}>{t('Ouvrir le pointage')}</Link></td></tr>)}</tbody></FilterableTable></div>{!loading && !periods.length && <p className="p-lg text-fg-secondary">{t(attendance ? 'Aucun pointage enregistré' : 'Données indisponibles')}</p>}</Card>}
  </main>
}
