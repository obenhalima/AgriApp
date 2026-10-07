'use client'
import {useLanguage} from '@/lib/i18n'

import { useRef, useState } from 'react'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import {
  parseBudgetFile, validateAndResolve, commitImport,
  ImportReport, downloadBlob, generateBudgetTemplate,
} from '@/lib/budgetImport'

export function BudgetImportModal(props: {
  versionId: string
  versionLabel: string
  editable: boolean                    // false si la version est figée
  onClose: () => void
  onImported: () => void | Promise<void>
}) {
 const {t:_ui,text:_uiNode}=useLanguage()

  const { versionId, versionLabel, editable, onClose, onImported } = props

  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [deleteAll, setDeleteAll] = useState(false)
  const [committing, setCommitting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const onFileChange = async (f: File | null) => {
    setFile(f); setReport(null); setErr('')
    if (!f) return
    setBusy(true)
    try {
      const buffer = await f.arrayBuffer()
      const rows = parseBudgetFile(buffer)
      const rep = await validateAndResolve(rows)
      setReport(rep)
    } catch (e: any) {
      setErr(e.message ?? 'Erreur de lecture du fichier')
    } finally { setBusy(false) }
  }

  const doCommit = async () => {
    if (!report || report.resolved.length === 0) return
    if (report.summary.errors > 0) {
      alert(_ui("Corrigez d'abord les erreurs avant d'importer."))
      return
    }
    if (deleteAll && !confirm(_ui("Remplacement TOTAL : toutes les lignes de la version \"{v0}\" seront supprimées avant l'import. Continuer ?",{v0:String(versionLabel)}))) return

    setCommitting(true)
    try {
      const res = await commitImport(versionId, report.resolved, { deleteBeforeImport: deleteAll })
      alert(_ui("Import terminé : {v0} ligne(s) insérée(s), {v1} ligne(s) remplacée(s).",{v0:String(res.inserted),v1:String(res.deleted)}))
      await onImported()
      onClose()
    } catch (e: any) {
      alert(_ui("Erreur à l'import :") + e.message)
    } finally { setCommitting(false) }
  }

  const downloadTemplate = async () => {
    try {
      const blob = await generateBudgetTemplate()
      downloadBlob(blob, `template-budget-${new Date().toISOString().slice(0,10)}.xlsx`)
    } catch (e: any) {
      alert(_ui("Erreur génération template :") + e.message)
    }
  }

  const errCount = report?.summary.errors ?? 0
  const canCommit = editable && report !== null && errCount === 0 && report.resolved.length > 0

  return (
    <Modal title={_ui("IMPORT EXCEL — {v0}",{v0:String(versionLabel)})} onClose={onClose} size="lg">
      {!editable && (
        <div style={{ padding: 10, marginBottom: 10, background: 'var(--amber-dim, rgba(245,158,11,.12))', border: '1px solid color-mix(in srgb, var(--amber) 40%, transparent)', borderRadius: 6, color: 'var(--amber)', fontSize: 12 }}>
          {" "}{_ui("⚠ La version actuelle est")}{" "}<strong>{_ui("figée")}</strong>{_ui(". Vous pouvez simuler l'import mais pas le valider. Dupliquez la version pour créer un brouillon amendable.")}{" "}</div>
      )}

      {/* Téléchargement template */}
      <div style={{ padding: 12, marginBottom: 12, background: 'var(--bg-deep)', border: '1px solid var(--bd-1)', borderRadius: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--tx-1)', fontWeight: 600, marginBottom: 2 }}>{_ui("📥 Template Excel")}</div>
          <div style={{ fontSize: 11, color: 'var(--tx-3)' }}>
            {" "}{_ui("Télécharge un fichier pré-rempli avec les codes de tes fermes, serres et catégories.")}{" "}</div>
        </div>
        <button onClick={downloadTemplate}
          style={{ padding: '7px 14px', background: 'transparent', border: '1px solid var(--neon)40', color: 'var(--neon)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
          {" "}{_ui("TÉLÉCHARGER")}{" "}</button>
      </div>

      {/* Upload */}
      <div style={{ padding: 16, border: '2px dashed var(--bd-1)', borderRadius: 8, textAlign: 'center', marginBottom: 12 }}>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={e => onFileChange(e.target.files?.[0] ?? null)}
        />
        {!file ? (
          <button onClick={() => fileInput.current?.click()} className="btn-primary">
            {" "}{_ui("📤 Choisir un fichier .xlsx")}{" "}</button>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: 'var(--tx-2)', marginBottom: 6 }}>
              📎 <strong>{file.name}</strong> <span style={{ color: 'var(--tx-3)' }}>({(file.size/1024).toFixed(1)} {" "}{_ui("KB)")}</span>
            </div>
            <button onClick={() => { setFile(null); setReport(null); setErr(''); if (fileInput.current) fileInput.current.value = '' }}
              style={{ padding: '4px 10px', background: 'transparent', border: '1px solid var(--bd-1)', color: 'var(--tx-3)', borderRadius: 5, cursor: 'pointer', fontSize: 11 }}>
              {" "}{_ui("Changer de fichier")}{" "}</button>
          </div>
        )}
      </div>

      {busy && <div style={{ padding: 20, textAlign: 'center', color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{_ui("ANALYSE EN COURS...")}</div>}
      {err && <div style={{ padding: 10, background: 'var(--red-dim)', color: 'var(--red)', borderRadius: 6, fontSize: 11 }}>⚠ {err}</div>}

      {/* Prévisualisation */}
      {report && (
        <>
          {/* Résumé */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
            <SummaryKPI label={_ui("Lignes totales")} value={report.summary.totalRows} color="var(--tx-2)" />
            <SummaryKPI label={_ui("Valides")} value={report.summary.validRows} color="var(--neon)" />
            <SummaryKPI label={_ui("Erreurs")} value={report.summary.errors} color={errCount > 0 ? 'var(--red)' : 'var(--tx-3)'} />
            <SummaryKPI label={_ui("Montant total")} value={`${report.summary.grandTotal.toLocaleString('fr')} MAD`} color="var(--amber)" />
          </div>

          {/* Erreurs / warnings */}
          {report.issues.length > 0 && (
            <div style={{ marginBottom: 12, maxHeight: 180, overflowY: 'auto', border: '1px solid var(--bd-1)', borderRadius: 6 }}>
              <table className="tbl" style={{ width: '100%' }}>
                <thead><tr><th style={{ width: 50 }}>{_ui("Ligne")}</th><th style={{ width: 80 }}>{_ui("Type")}</th><th>{_ui("Message")}</th></tr></thead>
                <tbody>
                  {report.issues.map((i, idx) => (
                    <tr key={idx}>
                      <td><code style={{ fontSize: 10 }}>{i.rowIndex}</code></td>
                      <td>
                        <span style={{ background: i.severity === 'error' ? 'var(--red-dim)' : 'color-mix(in srgb, var(--amber) 15%, transparent)', color: i.severity === 'error' ? 'var(--red)' : 'var(--amber)', padding: '1px 6px', borderRadius: 4, fontSize: 9, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                          {i.severity === 'error' ? _ui("Erreur") : _ui("Warning")}
                        </span>
                      </td>
                      <td style={{ fontSize: 11 }}>{_uiNode(i.message)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Options de commit */}
          {editable && report.resolved.length > 0 && (
            <div style={{ padding: 10, background: 'var(--bg-deep)', border: '1px solid var(--bd-1)', borderRadius: 6, marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={deleteAll} onChange={e => setDeleteAll(e.target.checked)} style={{ marginTop: 3 }} />
                <div>
                  <div style={{ fontSize: 12, color: 'var(--tx-1)', fontWeight: 600 }}>{_ui("Remplacement total de la version")}</div>
                  <div style={{ fontSize: 11, color: 'var(--tx-3)', marginTop: 2 }}>
                    {deleteAll
                      ? _ui("⚠ Toutes les lignes existantes de cette version seront supprimées avant l'import.")
                      : _ui("Par défaut : seules les lignes correspondant à l'import (ferme × serre × catégorie × mois) seront remplacées.")}
                  </div>
                </div>
              </label>
            </div>
          )}
        </>
      )}

      <ModalFooter
        onCancel={onClose}
        onSave={doCommit}
        loading={committing}
        disabled={!canCommit || committing}
        saveLabel={canCommit ? _ui("IMPORTER {v0} LIGNE(S)",{v0:String(report?.resolved.length)}) : _ui("IMPORTER")}
      />
    </Modal>
  )
}

function SummaryKPI({ label, value, color }: { label: string; value: string | number; color: string }) {
 const {t:_ui,text:_uiNode}=useLanguage()

  return (
    <div style={{ padding: 10, background: 'var(--bg-deep)', border: '1px solid var(--bd-1)', borderRadius: 6 }}>
      <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase' }}>{_uiNode(label)}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: 'var(--font-mono)', marginTop: 2 }}>{value}</div>
    </div>
  )
}
