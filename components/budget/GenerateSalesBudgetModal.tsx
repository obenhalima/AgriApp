'use client'

import { FilterableTable } from '@/components/ui/FilterableTable'
import {useLanguage} from '@/lib/i18n'

import { useEffect, useMemo, useState } from 'react'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { generateSalesBudgetLines, commitSalesBudget, GenerationReport } from '@/lib/salesBudget'
import { generateChargeLinesFromCosts, commitChargeBudget, ChargeGenerationReport } from '@/lib/budgetFromCosts'

type Section = 'revenue' | 'charges' | 'both'

export function GenerateSalesBudgetModal(props: {
  versionId: string
  versionLabel: string
  campaignId: string
  editable: boolean
  onClose: () => void
  onCommitted: () => void | Promise<void>
}) {
 const {t:_ui,text:_uiNode}=useLanguage()

  const { versionId, versionLabel, campaignId, editable, onClose, onCommitted } = props

  const [loading, setLoading] = useState(true)
  const [salesReport, setSalesReport] = useState<GenerationReport | null>(null)
  const [chargesReport, setChargesReport] = useState<ChargeGenerationReport | null>(null)
  const [err, setErr] = useState('')
  const [committing, setCommitting] = useState(false)
  const [section, setSection] = useState<Section>('both')

  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        const [sales, charges] = await Promise.all([
          generateSalesBudgetLines(campaignId),
          generateChargeLinesFromCosts(campaignId),
        ])
        setSalesReport(sales)
        setChargesReport(charges)
      } catch (e: any) {
        setErr(e.message ?? 'Erreur génération')
      } finally { setLoading(false) }
    })()
  }, [campaignId])

  // Pivot CA : par serre × variété × catégorie
  const salesPivot = useMemo(() => {
    if (!salesReport) return []
    const map = new Map<string, {
      greenhouse_code: string; variety_name: string; category_code: 'CA_EXPORT' | 'CA_LOCAL'
      qty: number; amount: number; months: number
    }>()
    for (const l of salesReport.lines) {
      const k = `${l.greenhouse_code}|${l.variety_name}|${l.category_code}`
      const e = map.get(k) ?? { greenhouse_code: l.greenhouse_code, variety_name: l.variety_name, category_code: l.category_code, qty: 0, amount: 0, months: 0 }
      e.qty += l.qty_kg; e.amount += l.amount; e.months += 1
      map.set(k, e)
    }
    return Array.from(map.values()).sort((a, b) =>
      a.greenhouse_code.localeCompare(b.greenhouse_code) ||
      a.variety_name.localeCompare(b.variety_name) ||
      a.category_code.localeCompare(b.category_code)
    )
  }, [salesReport])

  // Pivot Charges : par ferme × serre × catégorie × type
  const chargesPivot = useMemo(() => {
    if (!chargesReport) return []
    const map = new Map<string, {
      farm_code: string; greenhouse_code: string | null
      category_label: string; category_type: string
      amount: number; months: number
    }>()
    for (const l of chargesReport.lines) {
      const k = `${l.farm_code}|${l.greenhouse_code ?? '∅'}|${l.category_code}`
      const e = map.get(k) ?? {
        farm_code: l.farm_code, greenhouse_code: l.greenhouse_code,
        category_label: l.category_label, category_type: l.category_type,
        amount: 0, months: 0,
      }
      e.amount += l.amount; e.months += 1
      map.set(k, e)
    }
    return Array.from(map.values()).sort((a, b) =>
      a.farm_code.localeCompare(b.farm_code) ||
      (a.greenhouse_code ?? '').localeCompare(b.greenhouse_code ?? '') ||
      a.category_label.localeCompare(b.category_label)
    )
  }, [chargesReport])

  const submit = async () => {
    if (!salesReport || !chargesReport) return
    setCommitting(true)
    try {
      let salesRes = { inserted: 0, deleted: 0 }
      let chargesRes = { inserted: 0, deleted: 0 }

      if ((section === 'both' || section === 'revenue') && salesReport.lines.length > 0) {
        salesRes = await commitSalesBudget(versionId, salesReport.lines)
      }
      if ((section === 'both' || section === 'charges') && chargesReport.lines.length > 0) {
        chargesRes = await commitChargeBudget(versionId, chargesReport.lines)
      }

      const msg = [
        `Budget généré :`,
        `• Produits (CA) : ${salesRes.inserted} insérée(s), ${salesRes.deleted} remplacée(s)`,
        `• Charges : ${chargesRes.inserted} insérée(s), ${chargesRes.deleted} remplacée(s)`,
        ``,
        `La vue bascule automatiquement en "Consolidé" pour afficher les lignes.`,
      ].join('\n')
      alert(msg)
      await onCommitted()
      onClose()
    } catch (e: any) {
      alert(_ui("Erreur commit :") + e.message)
    } finally { setCommitting(false) }
  }

  const totalLinesToCommit =
    (section === 'revenue' ? (salesReport?.lines.length ?? 0) :
     section === 'charges' ? (chargesReport?.lines.length ?? 0) :
     (salesReport?.lines.length ?? 0) + (chargesReport?.lines.length ?? 0))

  return (
    <Modal title={_ui("GÉNÉRATION BUDGET — {v0}",{v0:String(versionLabel)})} onClose={onClose} size="lg">
      {!editable && (
        <div style={{ padding: 10, marginBottom: 10, background: 'color-mix(in srgb, var(--amber) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--amber) 40%, transparent)', borderRadius: 6, color: 'var(--amber)', fontSize: 12 }}>
          {" "}{_ui("⚠ La version actuelle n'est pas en brouillon. Prévisualisation uniquement.")}{" "}</div>
      )}

      {loading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{_ui("ANALYSE DES DONNÉES...")}</div>}
      {err && <div style={{ padding: 10, background: 'var(--red-dim)', color: 'var(--red)', borderRadius: 6, fontSize: 11 }}>⚠ {err}</div>}

      {salesReport && chargesReport && (
        <>
          <div style={{ padding: 10, marginBottom: 12, background: 'var(--bg-deep)', border: '1px solid var(--bd-1)', borderRadius: 8, fontSize: 12, color: 'var(--tx-2)' }}>
            <strong>{_ui("Sources :")}</strong><br/>
            • <strong>{_ui("Produits (CA Export + Local)")}</strong> {" "}{_ui("— calculés depuis les plantations (volume × prix, réparti sur la fenêtre de récolte).")}<br/>
            • <strong>{_ui("Charges")}</strong> {" "}{_ui("— agrégées depuis les")}{" "}<strong>{_ui("coûts prévisionnels")}</strong> {" "}{_ui("saisis dans l'onglet \"Budget\" de /couts, groupés par (ferme, serre, catégorie, mois).")}<br/>
            • <strong>{_ui("Amortissements")}</strong> {" "}{_ui("— calculés depuis les")}{" "}<strong>{_ui("actifs immobilisés")}</strong> {" "}{_ui("de /admin/amortissements, dotation mensuelle linéaire répartie sur la fenêtre de la campagne.")}{" "}</div>

          {/* Section selector */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 14, padding: 3, background: 'var(--bg-deep)', borderRadius: 8, border: '1px solid var(--bd-1)' }}>
            {([
              { k: 'both',    l: 'Tout',            count: (salesReport.lines.length + chargesReport.lines.length) },
              { k: 'revenue', l: 'Produits (CA)',   count: salesReport.lines.length },
              { k: 'charges', l: 'Charges',         count: chargesReport.lines.length },
            ] as const).map(t => (
              <button key={t.k} onClick={() => setSection(t.k)}
                style={{
                  flex: 1, padding: '7px 10px', border: 'none',
                  background: section === t.k ? 'var(--bg-base)' : 'transparent',
                  color: section === t.k ? 'var(--neon)' : 'var(--tx-3)',
                  borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)',
                  fontWeight: section === t.k ? 700 : 400, letterSpacing: .5,
                }}>
                {t.l} ({t.count})
              </button>
            ))}
          </div>

          {/* KPIs récap */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
            <KPI label={_ui("CA Export")} value={fmt(salesReport.totalsByCategory.CA_EXPORT)} color="var(--neon)" />
            <KPI label={_ui("CA Local")}  value={fmt(salesReport.totalsByCategory.CA_LOCAL)}  color="var(--blue)" />
            <KPI label={_ui("Charges var.")} value={fmt(chargesReport.totalsByType.charge_variable)} color="var(--amber)" />
            <KPI label={_ui("Charges fixes")} value={fmt(chargesReport.totalsByType.charge_fixe)}    color="var(--purple)" />
            <KPI label={_ui("Amort.")} value={fmt(chargesReport.totalsByType.amortissement)} color="var(--red)" />
          </div>

          {/* Résumé EBITDA prévu */}
          <div style={{ padding: 10, marginBottom: 12, background: 'color-mix(in srgb, var(--neon) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--neon) 30%, transparent)', borderRadius: 8, display: 'flex', gap: 16, fontSize: 12, flexWrap: 'wrap' }}>
            <div>{_ui("Total Produits :")}{" "}<strong style={{ color: 'var(--neon)', fontFamily: 'var(--font-mono)' }}>{fmt(salesReport.totalsByCategory.TOTAL)} MAD</strong></div>
            <div>{_ui("Total Charges :")}{" "}<strong style={{ color: 'var(--amber)', fontFamily: 'var(--font-mono)' }}>{fmt(chargesReport.totalsByType.TOTAL)} MAD</strong></div>
            <div>{_ui("EBITDA prévu :")}{" "}<strong style={{ color: 'var(--tx-1)', fontFamily: 'var(--font-mono)', fontSize: 14 }}>
              {fmt(salesReport.totalsByCategory.TOTAL - chargesReport.totalsByType.TOTAL)} MAD
            </strong></div>
          </div>

          {/* Warnings — visibles d'office si rien à générer */}
          {(salesReport.issues.length + chargesReport.issues.length) > 0 && (() => {
            // Ouvert d'office si pas de lignes générées (= raison d'être)
            const noCALines = salesReport.lines.length === 0
            const noChargeLines = chargesReport.lines.length === 0
            const expandByDefault = noCALines || noChargeLines

            return (
              <details open={expandByDefault} style={{ marginBottom: 12 }}>
                <summary style={{
                  cursor: 'pointer', fontSize: 13,
                  color: expandByDefault ? 'var(--red)' : 'var(--amber)',
                  fontWeight: expandByDefault ? 700 : 500,
                  marginBottom: 6, padding: 8,
                  background: expandByDefault ? 'var(--red-dim)' : 'color-mix(in srgb, var(--amber) 8%, transparent)',
                  border: `1px solid ${expandByDefault ? 'color-mix(in srgb, var(--red) 30%, transparent)' : 'color-mix(in srgb, var(--amber) 30%, transparent)'}`,
                  borderRadius: 6,
                }}>
                  {expandByDefault
                    ? _ui("🚨 Rien à générer — {v0} problème(s) détecté(s) (cliquer pour voir)",{v0:String(salesReport.issues.length + chargesReport.issues.length)})
                    : _ui("⚠ {v0} warning(s) / erreur(s)",{v0:String(salesReport.issues.length + chargesReport.issues.length)})}
                </summary>

                {/* Guide rapide quand il n'y a rien */}
                {expandByDefault && (
                  <div style={{ padding: 10, marginTop: 6, background: 'var(--bg-deep)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 11.5, color: 'var(--tx-2)', lineHeight: 1.6 }}>
                    <strong style={{ color: 'var(--tx-1)' }}>{_ui("Pour que le budget se génère, chaque plantation a besoin de :")}</strong>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                      <li><strong>{_ui("Dates de récolte")}</strong> {" "}{_ui("renseignées (Début + Fin) — édite la plantation dans")}{" "}<code>/production</code></li>
                      <li><strong>{_ui("Surface × Rendement &gt; 0")}</strong> {" "}{_ui("(sinon volume total = 0)")}</li>
                      <li><strong>{_ui("Prix Export")}</strong> {" "}{_ui("sur la variété (EUR/kg) si")}{" "}<code>{_ui("export_share_pct &gt; 0")}</code></li>
                      <li><strong>{_ui("Prix Local")}</strong> {" "}{_ui("sur la variété (MAD/kg) si")}{" "}<code>{_ui("export_share_pct &lt; 100")}</code></li>
                    </ul>
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--bd-1)', fontSize: 11, color: 'var(--tx-3)' }}>
                      💡 <strong>{_ui("Astuce :")}</strong> {" "}{_ui("va dans")}{" "}<code>/admin/demo-reset</code> {" "}{_ui("et clique")}{" "}<strong>{_ui("« 🔧 Réparer ma démo »")}</strong> {" "}{_ui("pour patcher automatiquement.")}{" "}</div>
                  </div>
                )}

                <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--bd-1)', borderRadius: 6, marginTop: 6 }}>
                  <FilterableTable className="tbl" style={{ width: '100%' }}>
                    <thead><tr><th>{_ui("Niveau")}</th><th>{_ui("Message")}</th></tr></thead>
                    <tbody>
                      {salesReport.issues.map((i, idx) => (
                        <tr key={`s${idx}`}>
                          <td style={{ width: 70 }}><span style={{ background: i.severity === 'error' ? 'var(--red-dim)' : 'color-mix(in srgb, var(--amber) 15%, transparent)', color: i.severity === 'error' ? 'var(--red)' : 'var(--amber)', padding: '1px 6px', borderRadius: 4, fontSize: 9, fontFamily: 'var(--font-mono)' }}>{i.severity === 'error' ? _ui("ERR") : _ui("WARN")}</span></td>
                          <td style={{ fontSize: 11 }}>{_ui("[CA]")}{" "}{_uiNode(i.message)}</td>
                        </tr>
                      ))}
                      {chargesReport.issues.map((i, idx) => (
                        <tr key={`c${idx}`}>
                          <td style={{ width: 70 }}><span style={{ background: i.severity === 'error' ? 'var(--red-dim)' : 'color-mix(in srgb, var(--amber) 15%, transparent)', color: i.severity === 'error' ? 'var(--red)' : 'var(--amber)', padding: '1px 6px', borderRadius: 4, fontSize: 9, fontFamily: 'var(--font-mono)' }}>{i.severity === 'error' ? _ui("ERR") : _ui("WARN")}</span></td>
                          <td style={{ fontSize: 11 }}>{_ui("[Charge]")}{" "}{_uiNode(i.message)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </FilterableTable>
                </div>
              </details>
            )
          })()}

          {/* Pivot CA */}
          {(section === 'both' || section === 'revenue') && salesPivot.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginBottom: 6 }}>{_ui("PRODUITS (CA) —")}{" "}{salesPivot.length} {" "}{_ui("ligne(s)")}</div>
              <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--bd-1)', borderRadius: 6 }}>
                <FilterableTable className="tbl" style={{ width: '100%', minWidth: 600 }}>
                  <thead><tr><th>{_ui("Serre")}</th><th>{_ui("Variété")}</th><th>{_ui("Marché")}</th><th style={{ textAlign: 'right' }}>{_ui("Qté (kg)")}</th><th style={{ textAlign: 'right' }}>{_ui("Mois")}</th><th style={{ textAlign: 'right' }}>{_ui("Montant")}</th></tr></thead>
                  <tbody>
                    {salesPivot.map((r, i) => (
                      <tr key={i}>
                        <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.greenhouse_code}</span></td>
                        <td>{r.variety_name}</td>
                        <td><span className="tag" style={{ background: r.category_code === 'CA_EXPORT' ? 'color-mix(in srgb, var(--neon) 15%, transparent)' : 'color-mix(in srgb, var(--blue) 15%, transparent)', color: r.category_code === 'CA_EXPORT' ? 'var(--neon)' : 'var(--blue)', fontSize: 9 }}>{r.category_code === 'CA_EXPORT' ? _ui("EXPORT") : _ui("LOCAL")}</span></td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.qty.toLocaleString('fr', { maximumFractionDigits: 0 })}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>{r.months}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}>{fmt(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </FilterableTable>
              </div>
            </div>
          )}

          {/* Pivot Charges */}
          {(section === 'both' || section === 'charges') && chargesPivot.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginBottom: 6 }}>{_ui("CHARGES —")}{" "}{chargesPivot.length} {" "}{_ui("ligne(s)")}</div>
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--bd-1)', borderRadius: 6 }}>
                <FilterableTable className="tbl" style={{ width: '100%', minWidth: 600 }}>
                  <thead><tr><th>{_ui("Ferme")}</th><th>{_ui("Serre")}</th><th>{_ui("Catégorie")}</th><th>{_ui("Type")}</th><th style={{ textAlign: 'right' }}>{_ui("Mois")}</th><th style={{ textAlign: 'right' }}>{_ui("Montant")}</th></tr></thead>
                  <tbody>
                    {chargesPivot.map((r, i) => {
                      const tColors: Record<string, string> = { charge_variable: 'var(--amber)', charge_fixe: 'var(--purple)', amortissement: 'var(--red)' }
                      const tLabels: Record<string, string> = { charge_variable: 'VAR', charge_fixe: 'FIXE', amortissement: 'AMT' }
                      const c = tColors[r.category_type]
                      return (
                        <tr key={i}>
                          <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.farm_code}</span></td>
                          <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: r.greenhouse_code ? 'var(--tx-2)' : 'var(--tx-3)' }}>{r.greenhouse_code ?? 'ferme'}</span></td>
                          <td>{r.category_label}</td>
                          <td><span className="tag" style={{ background: `${c}18`, color: c, border: `1px solid ${c}40`, fontSize: 9 }}>{_uiNode(tLabels[r.category_type])}</span></td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>{r.months}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}>{fmt(r.amount)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </FilterableTable>
              </div>
            </div>
          )}

          {chargesReport.lines.length === 0 && (section === 'charges' || section === 'both') && (
            <div style={{ padding: 10, marginBottom: 12, background: 'var(--bg-deep)', border: '1px dashed var(--bd-1)', borderRadius: 6, fontSize: 11, color: 'var(--tx-3)' }}>
              {" "}{_ui("Aucune charge prévisionnelle à générer. Saisis des coûts dans l'onglet")}{" "}<strong>{_ui("Budget")}</strong> {" "}{_ui("de")}{" "}<code>/couts</code> {" "}{_ui("pour cette campagne.")}{" "}</div>
          )}
        </>
      )}

      <ModalFooter
        onCancel={onClose}
        onSave={submit}
        loading={committing}
        disabled={!editable || totalLinesToCommit === 0 || committing}
        saveLabel={_ui("GÉNÉRER {v0} LIGNE(S)",{v0:String(totalLinesToCommit)})}
      />
    </Modal>
  )
}

function KPI({ label, value, color }: { label: string; value: string; color: string }) {
 const {t:_ui,text:_uiNode}=useLanguage()

  return (
    <div style={{ padding: 10, background: 'var(--bg-deep)', border: '1px solid var(--bd-1)', borderRadius: 6 }}>
      <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase' }}>{_uiNode(label)}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'var(--font-mono)', marginTop: 2 }}>{value}</div>
    </div>
  )
}

function fmt(v: number): string {
  return v.toLocaleString('fr', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
