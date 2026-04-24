'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { useAuth } from '@/lib/auth'
import { IMPORT_TARGETS, getTarget } from '@/lib/imports/registry'
import {
  readWorkbookSheets, readSheetRows, autoMap, parseRows,
  validateAndResolve, commitReport, downloadBlob,
} from '@/lib/imports/engine'
import {
  ImportTarget, SheetInfo, ColumnMapping, ValidationReport,
} from '@/lib/imports/types'

type Tab = 'templates' | 'dynamic'

export default function ImportsPage() {
  const { canAccessModule, hasPermission, loading: authLoading } = useAuth()
  const [tab, setTab] = useState<Tab>('templates')

  if (authLoading) return <div style={{ padding: 40, color: 'var(--text-sub)' }}>Chargement…</div>
  if (!canAccessModule('imports')) {
    return (
      <div style={{ padding: 40, color: 'var(--text-main)' }}>
        <h2>Accès refusé</h2>
        <p>Vous n'avez pas la permission d'accéder au module Imports.</p>
      </div>
    )
  }

  const canCreate = hasPermission('imports', 'create')

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400 }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-main)' }}>
          📥 Imports
        </h1>
        <div style={{ color: 'var(--text-sub)', fontSize: 12.5, marginTop: 4 }}>
          Import de données via templates standardisés ou mapping dynamique depuis un Excel quelconque.
        </div>
      </header>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--bd-1)', marginBottom: 18 }}>
        {[
          { k: 'templates', label: '📄 Templates (guidé)', desc: 'Télécharger un modèle pré-rempli et le ré-uploader' },
          { k: 'dynamic',   label: '🔀 Import dynamique',   desc: 'Uploader un Excel quelconque et mapper les colonnes' },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as Tab)}
            style={{
              padding: '10px 16px', border: 'none',
              background: tab === t.k ? 'var(--bg-2)' : 'transparent',
              color: tab === t.k ? 'var(--text-main)' : 'var(--text-sub)',
              borderBottom: tab === t.k ? '2px solid var(--neon)' : '2px solid transparent',
              cursor: 'pointer', fontSize: 13, fontWeight: 500,
            }}
            title={t.desc}>
            {t.label}
          </button>
        ))}
      </div>

      {!canCreate && (
        <div style={{ padding: 12, marginBottom: 14, background: 'var(--amber-dim)', border: '1px solid var(--amber)', borderRadius: 6, color: 'var(--text-main)', fontSize: 12.5 }}>
          ℹ️ Vous avez l'accès <strong>lecture seule</strong>. Vous pouvez télécharger les templates mais pas commiter un import.
        </div>
      )}

      {tab === 'templates' && <TemplatesTab canCreate={canCreate} />}
      {tab === 'dynamic'   && <DynamicTab   canCreate={canCreate} />}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 1 : TEMPLATES
// ═════════════════════════════════════════════════════════════════════
function TemplatesTab({ canCreate }: { canCreate: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 14 }}>
      {IMPORT_TARGETS.map(t => (
        <TargetCard key={t.key} target={t} canCreate={canCreate} />
      ))}
      {/* Placeholder pour futur */}
      <ComingSoonCard icon="🛒" label="Achats" description="Bons d'achat + lignes (phase suivante)" />
    </div>
  )
}

function ComingSoonCard({ icon, label, description }: { icon: string; label: string; description: string }) {
  return (
    <div style={{
      padding: 18, background: 'var(--bg-1)', border: '1px dashed var(--bd-2)',
      borderRadius: 10, opacity: .55,
    }}>
      <div style={{ fontSize: 26, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-main)' }}>{label}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-sub)', marginTop: 4 }}>{description}</div>
      <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        BIENTÔT DISPONIBLE
      </div>
    </div>
  )
}

function TargetCard({ target, canCreate }: { target: ImportTarget; canCreate: boolean }) {
  const [downloading, setDownloading] = useState(false)
  const [flowOpen, setFlowOpen] = useState(false)

  const download = async () => {
    setDownloading(true)
    try {
      const blob = await target.buildTemplate()
      downloadBlob(blob, `template_${target.key}.xlsx`)
    } catch (e: any) {
      alert('Erreur : ' + e.message)
    }
    setDownloading(false)
  }

  return (
    <>
      <div style={{
        padding: 18, background: 'var(--bg-1)', border: '1px solid var(--bd-1)',
        borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 26, marginBottom: 6 }}>{target.icon}</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-main)' }}>{target.label}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-sub)', marginTop: 4 }}>{target.description}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
          <button onClick={download} disabled={downloading}
            style={{
              flex: 1, padding: '8px 10px', background: 'transparent',
              border: '1px solid var(--bd-2)', borderRadius: 6, color: 'var(--text-main)',
              cursor: downloading ? 'wait' : 'pointer', fontSize: 12,
            }}>
            {downloading ? '…' : '⬇ Template'}
          </button>
          <button onClick={() => setFlowOpen(true)} disabled={!canCreate}
            style={{
              flex: 1, padding: '8px 10px', background: canCreate ? 'var(--neon-dim)' : 'var(--bg-2)',
              border: `1px solid ${canCreate ? 'var(--neon)' : 'var(--bd-2)'}`, borderRadius: 6,
              color: canCreate ? 'var(--neon)' : 'var(--text-muted)',
              cursor: canCreate ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600,
            }}>
            ⬆ Importer
          </button>
        </div>
      </div>
      {flowOpen && (
        <ImportFlowModal target={target} mode="template" onClose={() => setFlowOpen(false)} />
      )}
    </>
  )
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 2 : DYNAMIC
// ═════════════════════════════════════════════════════════════════════
function DynamicTab({ canCreate }: { canCreate: boolean }) {
  const [targetKey, setTargetKey] = useState('')
  const [flowOpen, setFlowOpen] = useState(false)
  const target = getTarget(targetKey)

  return (
    <div>
      <div style={{ padding: 16, background: 'var(--bg-1)', border: '1px solid var(--bd-1)', borderRadius: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 14, color: 'var(--text-main)', marginBottom: 8, fontWeight: 600 }}>
          Étape 1 — Choisir la cible
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-sub)', marginBottom: 12 }}>
          Dans quelle table de données ces lignes vont-elles être importées ? Les contrôles appliqués seront les mêmes qu'une saisie manuelle.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
          {IMPORT_TARGETS.map(t => (
            <button key={t.key} onClick={() => setTargetKey(t.key)}
              style={{
                padding: 14, textAlign: 'left',
                background: targetKey === t.key ? 'var(--neon-dim)' : 'var(--bg-2)',
                border: `1px solid ${targetKey === t.key ? 'var(--neon)' : 'var(--bd-1)'}`,
                borderRadius: 8, cursor: 'pointer', color: 'var(--text-main)',
              }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{t.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 2 }}>{t.description}</div>
            </button>
          ))}
        </div>
      </div>

      {target && (
        <div style={{ padding: 16, background: 'var(--bg-1)', border: '1px solid var(--bd-1)', borderRadius: 10 }}>
          <div style={{ fontSize: 14, color: 'var(--text-main)', marginBottom: 4, fontWeight: 600 }}>
            Étape 2 — Uploader votre fichier Excel
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-sub)', marginBottom: 12 }}>
            Cible sélectionnée : <strong>{target.icon} {target.label}</strong>. Le moteur va détecter les onglets et proposer un mapping automatique des colonnes.
          </div>
          <button onClick={() => setFlowOpen(true)} disabled={!canCreate}
            style={{
              padding: '10px 18px', background: canCreate ? 'var(--neon-dim)' : 'var(--bg-2)',
              border: `1px solid ${canCreate ? 'var(--neon)' : 'var(--bd-2)'}`, borderRadius: 6,
              color: canCreate ? 'var(--neon)' : 'var(--text-muted)', cursor: canCreate ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 600,
            }}>
            Commencer l'import
          </button>
        </div>
      )}

      {flowOpen && target && (
        <ImportFlowModal target={target} mode="dynamic" onClose={() => setFlowOpen(false)} />
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════
//  IMPORT FLOW — modale d'orchestration (file → sheet → mapping → preview → commit)
// ═════════════════════════════════════════════════════════════════════
type FlowMode = 'template' | 'dynamic'

function ImportFlowModal({ target, mode, onClose }: { target: ImportTarget; mode: FlowMode; onClose: () => void }) {
  const [step, setStep] = useState<'upload' | 'sheet' | 'mapping' | 'preview' | 'committing' | 'done'>('upload')
  const [wb, setWb] = useState<XLSX.WorkBook | null>(null)
  const [sheets, setSheets] = useState<SheetInfo[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>('')
  const [headerRowIndex, setHeaderRowIndex] = useState(0)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [report, setReport] = useState<ValidationReport | null>(null)
  const [committing, setCommitting] = useState(false)
  const [commitResult, setCommitResult] = useState<any>(null)
  const [error, setError] = useState<string>('')
  const [validating, setValidating] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setError('')
    try {
      const buf = await file.arrayBuffer()
      const { wb, sheets } = readWorkbookSheets(buf)
      setWb(wb); setSheets(sheets)
      if (sheets.length === 0) { setError('Aucun onglet détecté.'); return }
      // Auto-sélection : si le mode est "template", on cherche la feuille canonique
      const canonical = sheets.find(s => s.name.toLowerCase() === target.sheetName.toLowerCase())
      const pick = canonical ?? sheets[0]
      setSelectedSheet(pick.name)
      setHeaderRowIndex(0)
      // Si mode template ET feuille canonique trouvée : on skip l'étape "sheet"
      if (mode === 'template' && canonical) {
        prepareMapping(wb, canonical.name, 0)
        setStep('mapping')
      } else {
        setStep('sheet')
      }
    } catch (e: any) {
      setError('Lecture impossible : ' + e.message)
    }
  }

  const prepareMapping = (wb: XLSX.WorkBook, sheetName: string, headerIdx: number) => {
    const { headers, rows } = readSheetRows(wb, sheetName, headerIdx)
    setHeaders(headers); setRawRows(rows)
    const autoMapping = autoMap(headers, target.fields)
    setMapping(autoMapping)
  }

  const goMapping = () => {
    if (!wb || !selectedSheet) return
    prepareMapping(wb, selectedSheet, headerRowIndex)
    setStep('mapping')
  }

  const validateMapping = async () => {
    setError('')
    // Vérifier que tous les champs required sont mappés
    const mapped = new Set(Object.values(mapping).filter(Boolean))
    const missing = target.fields.filter(f => f.required && !mapped.has(f.key))
    if (missing.length > 0) {
      setError(`Champs obligatoires non mappés : ${missing.map(f => f.label).join(', ')}`)
      return
    }
    if (rawRows.length === 0) {
      setError(`Aucune ligne de données trouvée dans la feuille (seule la ligne d'en-tête a été lue). Vérifiez que vous avez bien rempli au moins une ligne.`)
      return
    }
    setValidating(true)
    try {
      console.log('[Import] parseRows:', rawRows.length, 'rows, mapping:', mapping)
      const parsed = parseRows(rawRows, mapping, target.fields, headerRowIndex)
      console.log('[Import] parsed:', parsed.length, 'rows. Resolvers loading…')
      const rep = await validateAndResolve(parsed, target)
      console.log('[Import] validation report:', rep.summary)
      setReport(rep)
      setStep('preview')
    } catch (e: any) {
      console.error('[Import] validateMapping error:', e)
      setError(`Erreur pendant la validation : ${e?.message || e?.toString() || 'inconnue (voir console F12)'}`)
    } finally {
      setValidating(false)
    }
  }

  const doCommit = async () => {
    if (!report) return
    setCommitting(true); setStep('committing')
    try {
      const res = await commitReport(target, report)
      setCommitResult(res)
      setStep('done')
    } catch (e: any) {
      setError('Erreur commit : ' + e.message)
      setStep('preview')
    }
    setCommitting(false)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 1100, width: '95%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            {target.icon} Import {target.label} — <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-sub)' }}>{
              mode === 'template' ? 'Mode template' : 'Mode dynamique'
            }</span>
          </div>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <div className="modal-body" style={{ flex: 1, overflow: 'auto' }}>
          {/* Stepper */}
          <StepIndicator step={step} />

          {error && (
            <div style={{ margin: '12px 0', padding: 10, background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 6, color: 'var(--text-main)', fontSize: 12 }}>
              ⚠ {error}
            </div>
          )}

          {step === 'upload' && (
            <UploadStep target={target} onFile={handleFile} fileInputRef={fileInputRef} />
          )}
          {step === 'sheet' && (
            <SheetStep sheets={sheets} selected={selectedSheet} onSelect={setSelectedSheet}
              headerRowIndex={headerRowIndex} setHeaderRowIndex={setHeaderRowIndex}
              onNext={goMapping} onBack={() => setStep('upload')} />
          )}
          {step === 'mapping' && (
            <MappingStep target={target} headers={headers} mapping={mapping} setMapping={setMapping}
              onValidate={validateMapping} onBack={() => setStep(mode === 'template' ? 'upload' : 'sheet')}
              previewRows={rawRows.slice(0, 3)} validating={validating} dataRowCount={rawRows.length} />
          )}
          {step === 'preview' && report && (
            <PreviewStep report={report} onCommit={doCommit} onBack={() => setStep('mapping')} target={target} />
          )}
          {step === 'committing' && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 30, marginBottom: 10 }}>⏳</div>
              <div style={{ color: 'var(--text-main)' }}>Import en cours…</div>
            </div>
          )}
          {step === 'done' && commitResult && (
            <DoneStep result={commitResult} target={target} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sous-composants ───────────────────────────────────────────────────

function StepIndicator({ step }: { step: string }) {
  const steps = [
    { k: 'upload',  label: 'Fichier' },
    { k: 'sheet',   label: 'Onglet' },
    { k: 'mapping', label: 'Mapping' },
    { k: 'preview', label: 'Aperçu' },
    { k: 'done',    label: 'Terminé' },
  ]
  const activeIdx = steps.findIndex(s => s.k === step || (step === 'committing' && s.k === 'preview'))
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
      {steps.map((s, i) => (
        <div key={s.k} style={{
          flex: 1, padding: '6px 8px', textAlign: 'center', fontSize: 11,
          background: i <= activeIdx ? 'var(--neon-dim)' : 'var(--bg-2)',
          color: i <= activeIdx ? 'var(--neon)' : 'var(--text-muted)',
          borderRadius: 4, fontWeight: i === activeIdx ? 600 : 400,
          border: `1px solid ${i <= activeIdx ? 'var(--neon)' : 'var(--bd-1)'}`,
        }}>
          {i + 1}. {s.label}
        </div>
      ))}
    </div>
  )
}

function UploadStep({ target, onFile, fileInputRef }: {
  target: ImportTarget
  onFile: (f: File) => void
  fileInputRef: React.RefObject<HTMLInputElement>
}) {
  const [dragOver, setDragOver] = useState(false)
  return (
    <div>
      <div style={{ marginBottom: 14, fontSize: 12.5, color: 'var(--text-sub)' }}>
        {target.instructions.map((line, i) => (
          <div key={i} style={{ marginBottom: 4 }}>• {line}</div>
        ))}
      </div>
      <div
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
        style={{
          padding: 40, textAlign: 'center', cursor: 'pointer',
          border: `2px dashed ${dragOver ? 'var(--neon)' : 'var(--bd-2)'}`,
          background: dragOver ? 'var(--neon-dim)' : 'var(--bg-2)',
          borderRadius: 10, color: 'var(--text-sub)',
        }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
        <div style={{ fontSize: 14, color: 'var(--text-main)', marginBottom: 4 }}>
          Glissez un fichier Excel ici, ou cliquez pour parcourir
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Formats acceptés : .xlsx, .xls</div>
      </div>
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
    </div>
  )
}

function SheetStep({ sheets, selected, onSelect, headerRowIndex, setHeaderRowIndex, onNext, onBack }: {
  sheets: SheetInfo[]
  selected: string
  onSelect: (s: string) => void
  headerRowIndex: number
  setHeaderRowIndex: (i: number) => void
  onNext: () => void
  onBack: () => void
}) {
  const sel = sheets.find(s => s.name === selected)
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-main)', marginBottom: 10, fontWeight: 600 }}>
        {sheets.length} onglet(s) détecté(s) — sélectionnez celui à importer :
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8, marginBottom: 16 }}>
        {sheets.map(s => (
          <button key={s.name} onClick={() => onSelect(s.name)}
            style={{
              padding: 10, textAlign: 'left',
              background: selected === s.name ? 'var(--neon-dim)' : 'var(--bg-2)',
              border: `1px solid ${selected === s.name ? 'var(--neon)' : 'var(--bd-1)'}`,
              borderRadius: 6, cursor: 'pointer', color: 'var(--text-main)',
            }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
            <div style={{ fontSize: 10.5, color: 'var(--text-sub)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
              {s.rowCount} lignes × {s.columnCount} col.
            </div>
          </button>
        ))}
      </div>

      {sel && (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-sub)', marginBottom: 6 }}>
            Ligne d'en-tête (base 1) :
            <input type="number" min={1} max={10} value={headerRowIndex + 1}
              onChange={e => setHeaderRowIndex(Math.max(0, Number(e.target.value) - 1))}
              style={{
                width: 60, marginLeft: 8, padding: '3px 6px',
                background: 'var(--bg-2)', color: 'var(--text-main)',
                border: '1px solid var(--bd-1)', borderRadius: 4,
              }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-main)', marginTop: 12, marginBottom: 4 }}>
            Aperçu des 5 premières lignes :
          </div>
          <div style={{ overflow: 'auto', maxHeight: 260, border: '1px solid var(--bd-1)', borderRadius: 6 }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--bg-2)', position: 'sticky', top: 0 }}>
                <tr>
                  {sel.headers.map((h, i) => (
                    <th key={i} style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--bd-1)', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>{h || <em style={{ color: 'var(--text-muted)' }}>(vide)</em>}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sel.preview.map((row, ri) => (
                  <tr key={ri}>
                    {sel.headers.map((_, ci) => (
                      <td key={ci} style={{ padding: '5px 8px', borderBottom: '1px solid var(--bd-1)', color: 'var(--text-sub)', whiteSpace: 'nowrap' }}>
                        {row[ci] !== undefined && row[ci] !== '' ? String(row[ci]) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 16 }}>
        <button onClick={onBack} className="btn-ghost">← Retour</button>
        <button onClick={onNext} className="btn-primary" disabled={!selected}>Continuer →</button>
      </div>
    </div>
  )
}

function MappingStep({ target, headers, mapping, setMapping, onValidate, onBack, previewRows, validating, dataRowCount }: {
  target: ImportTarget
  headers: string[]
  mapping: ColumnMapping
  setMapping: (m: ColumnMapping) => void
  onValidate: () => void
  onBack: () => void
  previewRows: Record<string, any>[]
  validating: boolean
  dataRowCount: number
}) {
  const usedFields = useMemo(() => {
    const s = new Set<string>()
    for (const v of Object.values(mapping)) if (v) s.add(v)
    return s
  }, [mapping])

  const autoMapped = useMemo(() =>
    Object.entries(mapping).filter(([, v]) => v !== null).length, [mapping])

  const changeMapping = (col: string, field: string | null) => {
    setMapping({ ...mapping, [col]: field })
  }

  return (
    <div>
      <div style={{ fontSize: 12.5, color: 'var(--text-sub)', marginBottom: 10 }}>
        <strong style={{ color: 'var(--text-main)' }}>{autoMapped}/{headers.length}</strong> colonnes auto-mappées.
        Vérifiez chaque ligne et corrigez si besoin. Les champs <strong>obligatoires</strong> sont marqués ✱.
        <br/>
        <span style={{ color: dataRowCount > 0 ? 'var(--neon)' : 'var(--red)', fontWeight: 600 }}>
          {dataRowCount} ligne(s) de données détectée(s).
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.5fr', gap: 10, padding: '6px 10px', background: 'var(--bg-2)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 11, color: 'var(--text-sub)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: .5 }}>
        <div>Colonne Excel</div><div>→ Champ cible</div><div>Aperçu / description</div>
      </div>
      <div style={{ border: '1px solid var(--bd-1)', borderTop: 'none', borderRadius: '0 0 6px 6px', maxHeight: 380, overflowY: 'auto' }}>
        {headers.map((h, i) => {
          const targetKey = mapping[h]
          const field = target.fields.find(f => f.key === targetKey)
          const preview = previewRows.map(r => r[h]).filter(v => v !== '' && v !== null && v !== undefined).slice(0, 2)
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.5fr', gap: 10, padding: '8px 10px', borderBottom: '1px solid var(--bd-1)', alignItems: 'center', background: targetKey ? 'transparent' : 'var(--amber-dim)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
                {h || <em style={{ color: 'var(--text-muted)' }}>(col.{i + 1})</em>}
              </div>
              <select value={targetKey ?? ''} onChange={e => changeMapping(h, e.target.value || null)}
                style={{
                  padding: '5px 8px', background: 'var(--bg-2)', color: 'var(--text-main)',
                  border: '1px solid var(--bd-1)', borderRadius: 4, fontSize: 12,
                }}>
                <option value="">— ignorer —</option>
                {target.fields.map(f => (
                  <option key={f.key} value={f.key} disabled={!!targetKey && targetKey !== f.key && usedFields.has(f.key)}>
                    {f.required ? '✱ ' : ''}{f.label} ({f.type})
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>
                {field?.help ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 10.5, marginBottom: 3 }}>{field.help}</div>
                ) : null}
                {preview.length > 0 && (
                  <div style={{ fontFamily: 'var(--font-mono)' }}>
                    {preview.map((p, pi) => (
                      <span key={pi} style={{ marginRight: 6, padding: '1px 5px', background: 'var(--bg-2)', borderRadius: 3 }}>{String(p).slice(0, 30)}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Champs requis non mappés */}
      {(() => {
        const missing = target.fields.filter(f => f.required && !usedFields.has(f.key))
        if (missing.length === 0) return null
        return (
          <div style={{ marginTop: 10, padding: 8, background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 6, fontSize: 12, color: 'var(--text-main)' }}>
            ⚠ Champs obligatoires non mappés : <strong>{missing.map(f => f.label).join(', ')}</strong>
          </div>
        )
      })()}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 16 }}>
        <button onClick={onBack} className="btn-ghost" disabled={validating}>← Retour</button>
        <button onClick={onValidate} className="btn-primary" disabled={validating}>
          {validating ? '⏳ Validation en cours…' : 'Valider le mapping →'}
        </button>
      </div>
    </div>
  )
}

function PreviewStep({ report, onCommit, onBack, target }: {
  report: ValidationReport
  onCommit: () => void
  onBack: () => void
  target: ImportTarget
}) {
  const { summary, validated, issues } = report
  const errorsList = issues.filter(i => i.severity === 'error')
  const warningsList = issues.filter(i => i.severity === 'warning')
  const [showOnly, setShowOnly] = useState<'all' | 'errors' | 'valid'>('all')

  const visible = validated.filter(v => {
    if (showOnly === 'errors') return v.issues.some(i => i.severity === 'error')
    if (showOnly === 'valid')  return v.resolved !== null
    return true
  })

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
        <StatCard label="Lignes" value={summary.totalRows} />
        <StatCard label="Valides" value={summary.validRows} color="var(--neon)" />
        <StatCard label="Erreurs" value={summary.errors} color="var(--red)" />
        <StatCard label="Warnings" value={summary.warnings} color="var(--amber)" />
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {[
          { k: 'all',    label: `Toutes (${validated.length})` },
          { k: 'errors', label: `Avec erreurs (${validated.filter(v => v.issues.some(i => i.severity === 'error')).length})` },
          { k: 'valid',  label: `Valides (${summary.validRows})` },
        ].map(f => (
          <button key={f.k} onClick={() => setShowOnly(f.k as any)}
            style={{
              padding: '4px 10px', fontSize: 11, borderRadius: 4,
              border: '1px solid var(--bd-1)',
              background: showOnly === f.k ? 'var(--neon-dim)' : 'var(--bg-2)',
              color: showOnly === f.k ? 'var(--neon)' : 'var(--text-sub)',
              cursor: 'pointer',
            }}>
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ border: '1px solid var(--bd-1)', borderRadius: 6, maxHeight: 380, overflow: 'auto' }}>
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--bg-2)', position: 'sticky', top: 0 }}>
            <tr>
              <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--bd-1)', color: 'var(--text-main)' }}>Ligne</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--bd-1)', color: 'var(--text-main)' }}>État</th>
              {target.fields.filter(f => f.required).slice(0, 4).map(f => (
                <th key={f.key} style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--bd-1)', color: 'var(--text-main)' }}>{f.label}</th>
              ))}
              <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--bd-1)', color: 'var(--text-main)' }}>Issues</th>
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, 200).map(v => {
              const hasErr = v.issues.some(i => i.severity === 'error')
              return (
                <tr key={v.rowIndex}>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--bd-1)', fontFamily: 'var(--font-mono)', color: 'var(--text-sub)' }}>{v.rowIndex}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--bd-1)' }}>
                    {hasErr
                      ? <span style={{ padding: '1px 6px', background: 'var(--red-dim)', color: 'var(--red)', borderRadius: 3, fontSize: 10 }}>✗ ERREUR</span>
                      : <span style={{ padding: '1px 6px', background: 'var(--neon-dim)', color: 'var(--neon)', borderRadius: 3, fontSize: 10 }}>✓ OK</span>}
                  </td>
                  {target.fields.filter(f => f.required).slice(0, 4).map(f => (
                    <td key={f.key} style={{ padding: '5px 8px', borderBottom: '1px solid var(--bd-1)', color: 'var(--text-sub)' }}>
                      {v.resolved?.[f.key] ?? report.rows.find(r => r.rowIndex === v.rowIndex)?.raw[f.key] ?? '—'}
                    </td>
                  ))}
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--bd-1)' }}>
                    {v.issues.length === 0
                      ? <span style={{ color: 'var(--text-muted)' }}>—</span>
                      : v.issues.map((is, i) => (
                          <div key={i} style={{ fontSize: 10.5, color: is.severity === 'error' ? 'var(--red)' : 'var(--amber)' }}>
                            {is.severity === 'error' ? '✗' : '⚠'} {is.message}
                          </div>
                        ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {visible.length > 200 && (
        <div style={{ padding: 8, fontSize: 11, color: 'var(--text-muted)' }}>
          Affichage limité aux 200 premières lignes (sur {visible.length} filtrées).
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 16, alignItems: 'center' }}>
        <button onClick={onBack} className="btn-ghost">← Mapping</button>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>
            {summary.validRows} ligne(s) seront importée(s)
          </span>
          <button onClick={onCommit} disabled={summary.validRows === 0} className="btn-primary">
            ⬆ Importer {summary.validRows} ligne(s)
          </button>
        </div>
      </div>
    </div>
  )
}

function DoneStep({ result, target, onClose }: { result: any; target: ImportTarget; onClose: () => void }) {
  const hasErrors = (result.errors?.length ?? 0) > 0
  return (
    <div style={{ textAlign: 'center', padding: 30 }}>
      <div style={{ fontSize: 50, marginBottom: 12 }}>{hasErrors ? '⚠' : '✓'}</div>
      <div style={{ fontSize: 18, color: 'var(--text-main)', marginBottom: 6, fontWeight: 600 }}>
        Import terminé
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 16 }}>
        <strong style={{ color: 'var(--neon)' }}>{result.inserted}</strong> ligne(s) créée(s) dans {target.label}.
        {hasErrors && <span> {result.errors.length} erreur(s) lors de l'insertion.</span>}
      </div>
      {hasErrors && (
        <div style={{ textAlign: 'left', border: '1px solid var(--red)', borderRadius: 6, padding: 10, marginBottom: 14, maxHeight: 200, overflow: 'auto', background: 'var(--red-dim)' }}>
          {result.errors.slice(0, 20).map((e: any, i: number) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--text-main)', marginBottom: 2 }}>
              Ligne {e.rowIndex} : {e.message}
            </div>
          ))}
        </div>
      )}
      <button onClick={onClose} className="btn-primary">Fermer</button>
    </div>
  )
}

function StatCard({ label, value, color = 'var(--text-main)' }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ padding: 10, background: 'var(--bg-2)', border: '1px solid var(--bd-1)', borderRadius: 6 }}>
      <div style={{ fontSize: 10, color: 'var(--text-sub)', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}
