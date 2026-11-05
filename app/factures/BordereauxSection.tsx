'use client'
import {useLanguage} from '@/lib/i18n'

/**
 * BordereauxSection — sous-onglet de /factures dédié aux Bordereaux station.
 *
 * Fonctionnalités :
 *   - Liste des bordereaux (brouillon + validés)
 *   - Création nouveau bordereau (auto semaine ISO courante)
 *   - Édition matrice (market × variety × farm × qty × prix)
 *   - Validation FIFO via RPC admin_validate_station_settlement
 *   - Annulation validation (admin_unvalidate_station_settlement)
 *   - Vue des allocations FIFO créées
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  FileBarChart, Plus, CheckCircle2, RotateCcw, Trash2, AlertTriangle, Pencil, X, Info,
  ChevronLeft, ChevronRight, FileText, Printer, CalendarClock,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { Input as TInput, Textarea, Field } from '@/components/ui/Input'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'
import { MoneyDisplay, DateDisplay } from '@/components/display'

import {
  type Settlement,
  type MatrixRow,
  listSettlements,
  createSettlementForWeek,
  buildMatrix,
  saveSettlementLines,
  validateSettlement,
  unvalidateSettlement,
  deleteSettlement,
  marketWeekLabel,
  isoWeekStringToRange,
  dateToIsoWeekString,
  computeExpectedPaymentDate,
  updateSettlement,
  generateSettlementInvoice,
} from '@/lib/stationSettlements'

// ────────────────────────────────────────────────────────────

export function BordereauxSection() {
 const {activeDomain}=useAuth()
 return <BordereauxContent key={activeDomain?.domain_id || 'none'}/>
}
function BordereauxContent() {
 const {t:_ui,text:_uiNode,intlLocale:_uiLocale}=useLanguage()
 const {activeDomain}=useAuth()

  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [markets, setMarkets] = useState<Array<{ id: string; code: string; name: string; week1_start_date: string | null }>>([])
  const [selectedMarketId, setSelectedMarketId] = useState<string>('')
  const [editTarget, setEditTarget] = useState<Settlement | null>(null)
  // Sélecteur de période (input HTML5 type=week, format 'YYYY-Www')
  const [selectedWeek, setSelectedWeek] = useState<string>(() => dateToIsoWeekString(new Date()))

  const load = async () => {
    if (!activeDomain?.domain_id) { setSettlements([]); setMarkets([]); setLoading(false); return }
    setLoading(true)
    try {
      const [list, mRes] = await Promise.all([
        listSettlements(50,activeDomain?.domain_id),
        supabase.from('markets').select('id, code, name, week1_start_date').eq('domain_id',activeDomain.domain_id).eq('is_active', true).order('name'),
      ])
      if (mRes.error) throw mRes.error
      setSettlements(list)
      setMarkets((mRes.data ?? []) as any[])
    } catch (e: any) {
      toast.error(_ui("Chargement échoué : {v0}",{v0:String(e.message ?? e)}))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const selectedMarket = useMemo(
    () => markets.find((m) => m.id === selectedMarketId) ?? null,
    [markets, selectedMarketId],
  )

  // Aperçu de la période sélectionnée (lundi → dimanche + numéro S du marché)
  const weekPreview = useMemo(() => {
    const r = isoWeekStringToRange(selectedWeek)
    if (!r) return null
    return {
      label: marketWeekLabel(r.monday, selectedMarket?.week1_start_date ?? null),
      isoLabel: `S${String(r.week).padStart(2, '0')}`,
      year: r.year,
      monday: r.monday,
      sunday: r.sunday,
    }
  }, [selectedWeek, selectedMarket])

  // Bordereau existant pour la semaine × marché sélectionnés (badge "déjà créé")
  const existingForSelected = useMemo(() => {
    if (!weekPreview) return null
    const ps = weekPreview.monday.toISOString().slice(0, 10)
    return settlements.find(
      (s) => s.period_start === ps && (s.market_id ?? '') === (selectedMarketId || ''),
    ) ?? null
  }, [weekPreview, settlements, selectedMarketId])

  const handleCreate = async () => {
    if (!weekPreview) {
      toast.error(_ui("Sélectionnez une semaine valide"))
      return
    }
    if (!activeDomain?.domain_id || !selectedMarket) {
      toast.error(_ui("Sélectionnez d'abord un marché"))
      return
    }
    // Si déjà existant, on l'ouvre direct sans appel API
    if (existingForSelected) {
      setEditTarget(existingForSelected)
      return
    }
    setCreating(true)
    try {
      const s = await createSettlementForWeek(selectedWeek, selectedMarketId,activeDomain?.domain_id || '')
      toast.success(_ui("Bordereau {v0} créé ({v1} · {v2})",{v0:String(s.code),v1:String(weekPreview.label),v2:String(selectedMarket?.name ?? '')}))
      await load()
      setEditTarget(s)
    } catch (e: any) {
      toast.error(_ui("Création échouée : {v0}",{v0:String(e.message ?? e)}))
    } finally {
      setCreating(false)
    }
  }

  const shiftWeek = (delta: number) => {
    if (!weekPreview) return
    const next = new Date(weekPreview.monday)
    next.setUTCDate(next.getUTCDate() + delta * 7)
    setSelectedWeek(dateToIsoWeekString(next))
  }

  const handleDelete = async (s: Settlement) => {
    if (s.status === 'valide') {
      toast.error(_ui("Annulez la validation avant de supprimer"))
      return
    }
    if (!confirm(_ui("Supprimer le bordereau {v0} ? (irréversible)",{v0:String(s.code)}))) return
    try {
      await deleteSettlement(s.id)
      toast.success(_ui("Bordereau supprimé"))
      await load()
    } catch (e: any) {
      toast.error(_ui("Suppression échouée : {v0}",{v0:String(e.message ?? e)}))
    }
  }

  const totalDraft = useMemo(
    () => settlements.filter(s => s.status === 'brouillon').reduce((acc, s) => acc + Number(s.total_amount || 0), 0),
    [settlements],
  )
  const totalValide = useMemo(
    () => settlements.filter(s => s.status === 'valide').reduce((acc, s) => acc + Number(s.total_amount || 0), 0),
    [settlements],
  )

  return (
    <div>
      {/* En-tête + Sélecteur de période */}
      <Card animate delay={0.1} className="mb-md">
        <div className="flex flex-col gap-md">
          {/* Titre + description */}
          <div>
            <div className="flex items-center gap-sm mb-1">
              <FileBarChart size={16} className="text-warning" strokeWidth={2.5} />
              <h2 className="font-display text-heading-sm font-bold text-fg-primary">{_ui("Bordereaux station")}</h2>
            </div>
            <p className="text-body-sm text-fg-secondary max-w-2xl">
              {" "}{_ui("Saisissez le bordereau hebdomadaire envoyé par la station de conditionnement. À la validation, le système alloue FIFO les paiements sur les dispatches non encore tarifés.")}{" "}</p>
          </div>

          {/* Sélecteur de période */}
          <div className="rounded-md border border-border bg-surface-sunk p-md">
            <div className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary font-semibold mb-sm">
              {" "}{_ui("Choisir la période du bordereau")}{" "}</div>
            <div className="flex flex-wrap items-end gap-md">
              {/* Navigation rapide */}
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => shiftWeek(-1)} title={_ui("Semaine précédente")}>
                  <ChevronLeft size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedWeek(dateToIsoWeekString(new Date()))}
                  title={_ui("Revenir à la semaine en cours")}
                >
                  {" "}{_ui("Aujourd'hui")}{" "}</Button>
                <Button variant="ghost" size="sm" onClick={() => shiftWeek(1)} title={_ui("Semaine suivante")}>
                  <ChevronRight size={14} />
                </Button>
              </div>

              {/* Sélecteur de marché (B1 : un bordereau par marché) */}
              <Field label={_ui("Marché *")}>
                <select
                  value={selectedMarketId}
                  onChange={(e) => setSelectedMarketId(e.target.value)}
                  className="form-input"
                  style={{ minWidth: 180 }}
                >
                  <option value="">{_ui("— choisir un marché —")}</option>
                  {markets.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </Field>

              {/* Input semaine */}
              <Field label={_ui("Semaine ISO")}>
                <input
                  type="week"
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(e.target.value)}
                  className="form-input"
                  style={{ minWidth: 180 }}
                />
              </Field>

              {/* Aperçu */}
              {weekPreview && (
                <div className="flex-1 min-w-[280px]">
                  <div className="flex items-center gap-sm mb-1">
                    <span
                      className="inline-flex items-center px-sm py-1 rounded font-mono text-body-sm font-bold"
                      style={{ background: '#8b5cf615', color: '#8b5cf6', border: '1px solid #8b5cf640' }}
                    >
                      {_uiNode(weekPreview.label)} · {weekPreview.year}
                    </span>
                    {existingForSelected && (
                      <Badge variant={existingForSelected.status === 'valide' ? 'success' : 'warning'} size="xs">
                        {existingForSelected.status === 'valide' ? _ui("Déjà validé") : _ui("Déjà en brouillon")}
                      </Badge>
                    )}
                  </div>
                  <div className="text-body-sm text-fg-secondary">
                    {" "}{_ui("Du")}{" "}<strong className="text-fg-primary">
                      {weekPreview.monday.toLocaleDateString(_uiLocale, { weekday: 'long', day: 'numeric', month: 'long' })}
                    </strong>{' '}
                    {" "}{_ui("au")}{" "}<strong className="text-fg-primary">
                      {weekPreview.sunday.toLocaleDateString(_uiLocale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </strong>
                  </div>
                  {selectedMarket && !selectedMarket.week1_start_date && (
                    <div className="text-[10.5px] text-fg-tertiary mt-0.5">
                      {" "}{_ui("S1 non paramétrée pour")}{" "}<strong>{selectedMarket.name}</strong> {" "}{_ui("→ numérotation ISO. Configure-la dans")}{" "}<strong>{_ui("Marchés → Début S1")}</strong>.
                    </div>
                  )}
                  {selectedMarket?.week1_start_date && (
                    <div className="text-[10.5px] text-fg-tertiary mt-0.5">
                      {_uiNode(weekPreview.label)} {" "}{_ui("selon la S1 de")}{" "}<strong>{selectedMarket.name}</strong> {" "}{_ui("(ISO")}{" "}{weekPreview.isoLabel}).
                    </div>
                  )}
                </div>
              )}

              {/* Action */}
              <Button onClick={handleCreate} variant="primary" disabled={creating || !weekPreview || !selectedMarketId}>
                <Plus size={14} strokeWidth={2.5} />
                {creating
                  ? _ui("Création…")
                  : existingForSelected
                    ? _ui("Ouvrir")
                    : _ui("Créer le bordereau")}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* KPI ligne */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-sm mb-md">
          {[
            { label: 'Bordereaux', value: settlements.length, isCount: true, color: '#3b82f6' },
            { label: 'En brouillon', value: totalDraft, color: '#f59e0b' },
            { label: 'Validés', value: totalValide, color: '#10b981' },
          ].map((kpi, i) => (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.04 }}
              className="rounded-md border bg-surface-raised p-md"
              style={{ borderTopColor: kpi.color, borderTopWidth: 3 }}
            >
              <div className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary font-semibold mb-1">
                {_uiNode(kpi.label)}
              </div>
              <div className="font-display text-display-sm font-extrabold" style={{ color: kpi.color }}>
                {kpi.isCount ? (
                  String(kpi.value)
                ) : (
                  <MoneyDisplay value={kpi.value as number} compact="auto" showCurrency={false} className="!text-current" />
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Liste */}
      <Card animate delay={0.25} padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-md space-y-sm">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : settlements.length === 0 ? (
          <EmptyState
            icon={FileBarChart}
            title={_ui("Aucun bordereau")}
            description={_ui("Choisissez une semaine ci-dessus et créez le premier bordereau pour commencer.")}
          />
        ) : (
          <DataTable minWidth={900}>
            <THead>
              <TR>
                <TH>{_ui("Code")}</TH>
                <TH>{_ui("Marché")}</TH>
                <TH>{_ui("Période")}</TH>
                <TH>{_ui("Reçu le")}</TH>
                <TH right>{_ui("Quantité (kg)")}</TH>
                <TH right>{_ui("Montant")}</TH>
                <TH>{_ui("Statut")}</TH>
                <TH right>{_ui("Actions")}</TH>
              </TR>
            </THead>
            <tbody>
              {settlements.map((s) => {
                const wLabel = marketWeekLabel(new Date(s.period_start), s.markets?.week1_start_date ?? null)
                return (
                  <TR key={s.id}>
                    <TD>
                      <div className="font-mono text-body-sm font-semibold">{s.code}</div>
                      <div className="font-mono text-[10px] text-fg-tertiary">{wLabel}</div>
                    </TD>
                    <TD>
                      {s.markets?.name
                        ? <span className="text-body-sm">{s.markets.name}</span>
                        : <span className="text-body-sm text-fg-tertiary italic">{_ui("tous marchés")}</span>}
                    </TD>
                    <TD>
                      <div className="text-body-sm">
                        <DateDisplay value={s.period_start} /> → <DateDisplay value={s.period_end} />
                      </div>
                    </TD>
                    <TD>
                      <DateDisplay value={s.received_date} />
                    </TD>
                    <TD right>
                      <span className="font-mono">{Number(s.total_qty_kg).toLocaleString(_uiLocale)} kg</span>
                    </TD>
                    <TD right>
                      <MoneyDisplay value={Number(s.total_amount)} />
                    </TD>
                    <TD>
                      {s.status === 'valide' ? (
                        <Badge variant="success">
                          <CheckCircle2 size={10} strokeWidth={2.5} /> {" "}{_ui("Validé")}{" "}</Badge>
                      ) : (
                        <Badge variant="warning">{_ui("Brouillon")}</Badge>
                      )}
                    </TD>
                    <TD right>
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => setEditTarget(s)}>
                          {s.status === 'brouillon' ? (
                            <><Pencil size={12} /> {" "}{_ui("Saisir")}</>
                          ) : (
                            <><Info size={12} /> {" "}{_ui("Voir")}</>
                          )}
                        </Button>
                        {s.status === 'brouillon' && (
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(s)}>
                            <Trash2 size={12} />
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </tbody>
          </DataTable>
        )}
      </Card>

      {/* Modal d'édition / consultation */}
      {editTarget && (
        <SettlementMatrixModal
          settlement={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={async () => { await load() }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Modal matrice
// ════════════════════════════════════════════════════════════

function SettlementMatrixModal({
  settlement,
  onClose,
  onSaved,
}: {
  settlement: Settlement
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
 const {t:_ui,text:_uiNode,intlLocale:_uiLocale}=useLanguage()
 const {activeDomain}=useAuth()

  const router = useRouter()
  const [rows, setRows] = useState<MatrixRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [generatingInvoice, setGeneratingInvoice] = useState(false)
  const [matrixError, setMatrixError] = useState('')
  // Date prévue d'encaissement (initialisée depuis settlement, écrasée par calcul auto)
  const [expectedPaymentDate, setExpectedPaymentDate] = useState<string>(
    settlement.expected_payment_date ?? ''
  )
  const [paymentInfo, setPaymentInfo] = useState<{ maxDays: number; perMarket: Array<{ market_name: string; days: number }> }>({ maxDays: 30, perMarket: [] })
  const isReadOnly = settlement.status === 'valide'
  const hasInvoice = !!settlement.invoice_id

  const refresh = async () => {
    setLoading(true)
    setMatrixError('')
    try {
      const m = await buildMatrix(settlement.id, settlement.market_id ?? null, activeDomain?.domain_id || '')
      setRows(m)
    } catch (e: any) {
      setRows([])
      setMatrixError(String(e.message ?? e))
      toast.error(_ui("Chargement matrice : {v0}",{v0:String(e.message ?? e)}))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [settlement.id])

  // Auto-calcul de la date prévue d'encaissement à partir des marchés des lignes saisies
  useEffect(() => {
    let cancelled = false
    if (!settlement.id) return
    computeExpectedPaymentDate(settlement.id, settlement.received_date)
      .then((res) => {
        if (cancelled) return
        setPaymentInfo({ maxDays: res.maxDays, perMarket: res.perMarket })
        // Si l'utilisateur n'a pas encore saisi de date, on pré-remplit avec le calcul auto
        if (!expectedPaymentDate) setExpectedPaymentDate(res.date)
      })
      .catch(() => { /* silent */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settlement.id, settlement.received_date, rows.length])

  // Sauvegarde la date prévue dès qu'elle change (debounce léger)
  useEffect(() => {
    if (!expectedPaymentDate || isReadOnly) return
    if (expectedPaymentDate === settlement.expected_payment_date) return
    const t = setTimeout(() => {
      updateSettlement(settlement.id, { expected_payment_date: expectedPaymentDate })
        .catch((e: any) => toast.error(_ui("Date prévue : {v0}",{v0:String(e.message ?? e)})))
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expectedPaymentDate,_ui])

  const handleGenerateInvoice = async () => {
    if (!confirm(_ui("Générer la facture pour {v0} ? Client : Station de conditionnement Montant : {v1} MAD Échéance : {v2} La facture apparaîtra dans l'onglet \"Crédit clients\".",{v0:String(settlement.code),v1:String(totalAmount.toLocaleString(_uiLocale)),v2:String(expectedPaymentDate || '?')}))) return
    setGeneratingInvoice(true)
    try {
      const res = await generateSettlementInvoice(settlement.id)
      if (res.created) {
        toast.success(_ui("Facture {v0} créée — {v1} MAD échéance {v2}",{v0:String(res.invoice_number),v1:String((res.amount ?? 0).toLocaleString(_uiLocale)),v2:String(res.due_date)}), { duration: 8000 })
      } else {
        toast.info(res.message ?? _ui("Facture déjà existante"))
      }
      // Déclenche un reload sur toutes les pages qui ecoutent app:refresh-data
      // (notamment /factures pour que la facture apparaisse dans Credit clients)
      window.dispatchEvent(new CustomEvent('app:refresh-data'))
      await onSaved()
    } catch (e: any) {
      toast.error(_ui("Génération facture échouée : {v0}",{v0:String(e.message ?? e)}), { duration: 8000 })
    } finally {
      setGeneratingInvoice(false)
    }
  }

  const handlePrint = () => {
    window.open(`/factures/bordereau/${settlement.id}/print`, '_blank')
  }

  const setRow = (key: string, patch: Partial<MatrixRow>) => {
    setRows((prev) => prev.map((r) => {
      if (r.key !== key) return r
      const next = { ...r, ...patch }
      next.amount = Number(next.qty_kg) * Number(next.price_per_kg)
      return next
    }))
  }

  // Remplit la quantité de TOUTES les lignes avec le stock disponible
  const fillAll = () => {
    setRows((prev) => prev.map((r) => {
      const q = Number(r.available_kg) || 0
      return { ...r, qty_kg: q, amount: q * Number(r.price_per_kg || 0) }
    }))
  }

  const totalKg = useMemo(() => rows.reduce((acc, r) => acc + Number(r.qty_kg || 0), 0), [rows])
  const totalAmount = useMemo(() => rows.reduce((acc, r) => acc + Number(r.amount || 0), 0), [rows])

  // Validation côté UI : quantité saisie <= dispo
  const overflowRows = useMemo(
    () => rows.filter((r) => Number(r.qty_kg) > Number(r.available_kg) + 0.01),
    [rows],
  )

  const handleSave = async () => {
    if (overflowRows.length > 0) {
      toast.error(_ui("Certaines quantités dépassent le stock disponible"))
      return
    }
    setSaving(true)
    try {
      await saveSettlementLines(
        settlement.id,
        rows.map((r) => ({
          farm_id: r.farm_id,
          market_id: r.market_id,
          variety_id: r.variety_id,
          qty_kg: Number(r.qty_kg) || 0,
          price_per_kg: Number(r.price_per_kg) || 0,
        })),
        activeDomain?.domain_id || '',
      )
      toast.success(_ui("Lignes enregistrées"))
      await onSaved()
    } catch (e: any) {
      toast.error(_ui("Enregistrement échoué : {v0}",{v0:String(e.message ?? e)}))
    } finally {
      setSaving(false)
    }
  }

  const handleValidate = async () => {
    if (!confirm(_ui("Valider le bordereau {v0} ? Cela va allouer FIFO les paiements sur les dispatches triés non encore tarifés et marquer les lots comme \"priced\" quand totalement payés.",{v0:String(settlement.code)}))) return
    setValidating(true)
    try {
      // Sauvegarde d'abord (au cas où l'utilisateur a modifié)
      await saveSettlementLines(
        settlement.id,
        rows.map((r) => ({
          farm_id: r.farm_id,
          market_id: r.market_id,
          variety_id: r.variety_id,
          qty_kg: Number(r.qty_kg) || 0,
          price_per_kg: Number(r.price_per_kg) || 0,
        })),
        activeDomain?.domain_id || '',
      )
      const res = await validateSettlement(settlement.id)
      toast.success(
        _ui("Bordereau {v0} validé — {v1} allocations, {v2} lots soldés",{v0:String(res.settlement_code),v1:String(res.allocations_created),v2:String(res.lots_fully_priced)}),
      )
      await onSaved()
      onClose()
    } catch (e: any) {
      toast.error(_ui("Validation échouée : {v0}",{v0:String(e.message ?? e)}), { duration: 8000 })
    } finally {
      setValidating(false)
    }
  }

  const handleUnvalidate = async () => {
    if (!confirm(_ui("Annuler la validation du bordereau {v0} ? Cela supprimera toutes les allocations et repassera les lots en \"tried\".",{v0:String(settlement.code)}))) return
    setValidating(true)
    try {
      const res = await unvalidateSettlement(settlement.id)
      toast.success(_ui("{v0} allocations retirées — bordereau repassé en brouillon",{v0:String(res.allocations_removed)}))
      await onSaved()
      onClose()
    } catch (e: any) {
      toast.error(_ui("Annulation échouée : {v0}",{v0:String(e.message ?? e)}), { duration: 8000 })
    } finally {
      setValidating(false)
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={_ui("Bordereau {v0} {v1}",{v0:String(settlement.code),v1:String(isReadOnly ? '(validé)' : '')})}
      size="lg"
    >
      <div className="space-y-md">
        {/* Header info */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-sm">
          <Field label={_ui("Période")}>
            <div className="text-body-sm">
              <DateDisplay value={settlement.period_start} /> → <DateDisplay value={settlement.period_end} />
            </div>
          </Field>
          <Field label={_ui("Statut")}>
            {settlement.status === 'valide'
              ? <Badge variant="success">{_ui("Validé")}</Badge>
              : <Badge variant="warning">{_ui("Brouillon")}</Badge>}
          </Field>
          <Field label={_ui("Total quantité")}>
            <div className="font-mono text-body-sm font-semibold">
              {totalKg.toLocaleString(_uiLocale, { maximumFractionDigits: 2 })} kg
            </div>
          </Field>
          <Field label={_ui("Total montant")}>
            <div className="font-mono text-body-sm font-semibold">
              <MoneyDisplay value={totalAmount} />
            </div>
          </Field>
        </div>

        {/* ─── Date prévue d'encaissement ─── */}
        <div className="rounded-md border border-border bg-surface-sunk p-md">
          <div className="flex flex-wrap items-center gap-md">
            <CalendarClock size={18} className="text-info flex-shrink-0" />
            <Field label={_ui("Date prévue d'encaissement")}>
              <input
                type="date"
                value={expectedPaymentDate}
                onChange={(e) => setExpectedPaymentDate(e.target.value)}
                disabled={isReadOnly && hasInvoice}
                className="form-input"
                style={{ minWidth: 160 }}
              />
            </Field>
            <div className="text-body-sm text-fg-secondary flex-1 min-w-[200px]">
              <div>
                {" "}{_ui("Calcul auto :")}{" "}<strong>{_ui("reçu +")}{" "}{paymentInfo.maxDays}j</strong>
                {paymentInfo.perMarket.length > 0 && (
                  <span className="text-fg-tertiary ml-1">
                    {" "}{_ui("(max parmi")}{" "}{paymentInfo.perMarket.map((m) => `${m.market_name}: ${m.days}j`).join(', ')})
                  </span>
                )}
              </div>
              <div className="text-[10.5px] text-fg-tertiary mt-0.5">
                {" "}{_ui("Configure le délai dans")}{" "}<strong>{_ui("Marchés → payment_terms_days")}</strong>{_ui(". Modifiable manuellement.")}{" "}</div>
            </div>
          </div>
        </div>

        {/* Warning overflow */}
        {/* Warning overflow : uniquement en mode édition (brouillon).
            Sur un bordereau validé, "Dispo" reflète le stock restant maintenant,
            pas celui au moment de la validation — la comparaison serait trompeuse. */}
        {!isReadOnly && overflowRows.length > 0 && (
          <div className="rounded-md border border-warning bg-warning/10 px-md py-sm flex items-start gap-sm">
            <AlertTriangle size={16} className="text-warning flex-shrink-0 mt-px" />
            <div className="text-body-sm text-fg-primary">
              <span className="font-semibold">{overflowRows.length} {" "}{_ui("ligne(s)")}</span> {" "}{_ui("dépasse(nt) le stock disponible. La validation échouera tant que ce n'est pas corrigé.")}{" "}</div>
          </div>
        )}

        {/* Info clarification quand on consulte un bordereau validé */}
        {isReadOnly && (
          <div className="rounded-md border border-info bg-info/10 px-md py-sm flex items-start gap-sm">
            <Info size={16} className="text-info flex-shrink-0 mt-px" />
            <div className="text-body-sm text-fg-primary">
              {" "}{_ui("Bordereau validé. La colonne")}{" "}<strong>{_ui("Dispo")}</strong> {" "}{_ui("affiche le stock encore disponible aujourd'hui pour la combinaison marché × variété × ferme (pas celui au moment de la validation).")}{" "}</div>
          </div>
        )}

        {/* Matrice */}
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : matrixError ? (
          <div role="alert" className="rounded-md border border-red-300 p-4 text-red-700">
            <p>Impossible de charger les lots du bordereau. Ce message ne signifie pas qu’aucun lot n’est disponible.</p>
            <p className="text-sm">{matrixError}</p>
            <Button variant="secondary" onClick={refresh}>Réessayer</Button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Info}
            title={_ui("Aucun dispatch éligible")}
            description={
              <span>
                {" "}{_ui("Pour qu'un dispatch apparaisse ici, il doit être au statut")}{' '}
                <strong>{_ui("« trié » (tri_status = 'tried')")}</strong> {" "}{_ui("avec une qté acceptée et sans prix final.")}{" "}<br />
                {" "}{_ui("Les dispatches déjà tarifés via le bouton classique \"Tarifer\" ne peuvent pas être re-payés par bordereau.")}{" "}<br />
                {" "}{_ui("Saisissez d'abord les tris dans")}{" "}<strong>{_ui("Récoltes → À trier")}</strong>.
              </span> as any
            }
          />
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-md border border-border">
            <DataTable minWidth={900}>
              <THead>
                <TR>
                  <TH>{_ui("Marché")}</TH>
                  <TH>{_ui("Variété")}</TH>
                  <TH>{_ui("Ferme")}</TH>
                  <TH right>{_ui("Dispo (kg)")}</TH>
                  <TH right>{_ui("Qté payée (kg)")}</TH>
                  <TH right>{_ui("Prix / kg")}</TH>
                  <TH right>{_ui("Montant")}</TH>
                </TR>
              </THead>
              <tbody>
                {rows.map((r) => {
                  const overflow = Number(r.qty_kg) > Number(r.available_kg) + 0.01
                  return (
                    <TR key={r.key}>
                      <TD>{r.market_name}</TD>
                      <TD>{r.variety_name}</TD>
                      <TD>{r.farm_name ?? <span className="text-fg-tertiary italic">{_ui("— toutes —")}</span>}</TD>
                      <TD right>
                        <span className="font-mono">{Number(r.available_kg).toLocaleString(_uiLocale)}</span>
                      </TD>
                      <TD right>
                        {isReadOnly ? (
                          <span className="font-mono">{Number(r.qty_kg).toLocaleString(_uiLocale)}</span>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setRow(r.key, { qty_kg: Number(r.available_kg) })}
                              disabled={Number(r.available_kg) <= 0}
                              title={_ui("Remplir avec toute la quantité disponible")}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-border text-fg-secondary hover:text-fg-primary hover:border-info disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {" "}{_ui("tout")}{" "}</button>
                            <TInput
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              value={r.qty_kg || ''}
                              onChange={(e) => setRow(r.key, { qty_kg: Number(e.target.value) })}
                              className={`h-7 text-right w-28 font-mono ${overflow ? 'border-danger' : ''}`}
                            />
                          </div>
                        )}
                      </TD>
                      <TD right>
                        {isReadOnly ? (
                          <span className="font-mono">{Number(r.price_per_kg).toFixed(4)}</span>
                        ) : (
                          <TInput
                            type="number"
                            inputMode="decimal"
                            step="0.0001"
                            min="0"
                            value={r.price_per_kg || ''}
                            onChange={(e) => setRow(r.key, { price_per_kg: Number(e.target.value) })}
                            className="h-7 text-right w-24 font-mono"
                          />
                        )}
                      </TD>
                      <TD right>
                        <span className="font-mono font-semibold">
                          <MoneyDisplay value={Number(r.amount)} />
                        </span>
                      </TD>
                    </TR>
                  )
                })}
              </tbody>
            </DataTable>
          </div>
        )}

        <div className="flex flex-wrap gap-sm justify-end pt-md border-t border-border">
          <Button variant="ghost" onClick={onClose}>
            <X size={14} /> {" "}{_ui("Fermer")}{" "}</Button>

          {isReadOnly ? (
            <>
              <Button variant="ghost" onClick={handlePrint} title={_ui("Ouvrir une vue imprimable")}>
                <Printer size={14} /> {" "}{_ui("Imprimer")}{" "}</Button>
              {hasInvoice ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    onClose()  // ferme le modal
                    // Next.js : router.push met a jour les searchParams,
                    // ce qui declenche le useEffect dans /factures pour switch tab + highlight
                    router.push(`/factures?tab=clients&invoice=${settlement.invoice_id ?? ''}`)
                    // Force un reload des donnees au cas ou Realtime n'aurait pas declenche
                    window.dispatchEvent(new CustomEvent('app:refresh-data'))
                  }}
                  title={_ui("Voir la facture liée dans l'onglet Crédit clients")}
                >
                  <FileText size={14} /> {" "}{_ui("Voir facture")}{" "}</Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={handleGenerateInvoice}
                  disabled={generatingInvoice}
                  title={_ui("Crée une facture dans /factures avec ce total et cette échéance")}
                >
                  <FileText size={14} strokeWidth={2.5} />
                  {generatingInvoice ? _ui("Génération…") : _ui("Générer facture")}
                </Button>
              )}
              <Button variant="secondary" onClick={handleUnvalidate} disabled={validating || hasInvoice} title={hasInvoice ? _ui("Supprimez d'abord la facture liée") : undefined}>
                <RotateCcw size={14} />
                {validating ? _ui("Annulation…") : _ui("Annuler validation")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={fillAll} disabled={rows.length === 0} title={_ui("Remplir chaque ligne avec toute la quantité disponible")}>
                {" "}{_ui("Tout remplir (dispo)")}{" "}</Button>
              <Button variant="secondary" onClick={handleSave} disabled={saving || rows.length === 0}>
                {saving ? _ui("Enregistrement…") : _ui("Enregistrer brouillon")}
              </Button>
              <Button
                variant="primary"
                onClick={handleValidate}
                disabled={validating || rows.length === 0 || overflowRows.length > 0}
              >
                <CheckCircle2 size={14} strokeWidth={2.5} />
                {validating ? _ui("Validation…") : _ui("Valider (FIFO)")}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
