'use client'
import {useLanguage} from '@/lib/i18n'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { stationConfirmationsComplete, stationRiskLabels, stationRiskStyles, StationRisk } from '@/lib/stationRisk'

export function StationReview({ requestId, readOnly = false, onClose, onDone }: { requestId: string; readOnly?: boolean; onClose: () => void; onDone: (approved: boolean) => void }) {
 const {t:_ui,text:_uiNode,intlLocale:_uiLocale}=useLanguage()

  const [data, setData] = useState<any>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [checks, setChecks] = useState<Record<string, any>>({}), [reason, setReason] = useState('')
  useEffect(() => {
    let stop = false; setData(null); setChecks({}); setError('')
    supabase.rpc('get_treatment_station_review', { p_request: requestId }).abortSignal(AbortSignal.timeout(20000)).then(r => { if (!stop) { if (r.error) setError(r.error.message); else setData(r.data) } })
    return () => { stop = true }
  }, [requestId])
  const lines = data?.snapshot?.lines || []
  const confirm = (id: string, key: string, value: boolean) => setChecks(c => ({ ...c, [id]: { ...c[id], [key]: value } }))
  async function review(approve: boolean) {
    if (busy || !data?.can_review) return
    if (approve && !stationConfirmationsComplete(lines, checks)) { setError('Confirmez chaque accord Station et restriction demandés.'); return }
    if (!approve && reason.trim().length < 3) { setError('Motif de refus obligatoire (3 caractères minimum).'); return }
    setBusy(true); setError('')
    try {
      const r = await supabase.rpc('review_treatment_station', { p_request: requestId, p_approve: approve, p_reason: reason.trim() || null, p_fingerprint: data.fingerprint, p_confirmations: lines.filter((l: any) => ['yellow', 'red'].includes(l.risk)).map((l: any) => ({ line_id: l.line_id, station_agreed: checks[l.line_id]?.station_agreed === true, restrictions_checked: checks[l.line_id]?.restrictions_checked === true })) }).abortSignal(AbortSignal.timeout(25000))
      if (r.error) throw r.error
      onDone(approve)
    } catch (e: any) { setError(`${e.message} Fermez et rechargez la prescription avant de réessayer.`) } finally { setBusy(false) }
  }
  return <Modal title={readOnly ? _ui("HISTORIQUE DES CONFIRMATIONS STATION") : _ui("VALIDATION DU RESPONSABLE D’EXPLOITATION")} size="lg" onClose={() => { if (!busy) onClose() }}>
    <div className="space-y-4">
      <p>{_ui("Une seule validation. Vous attestez avoir obtenu l’accord de la station ; la station n’a aucun accès à ItriX Farm.")}</p>
      {error && <p role="alert" className="text-red-700">{_uiNode(error)}</p>}
      {!data && !error && <p>{_ui("Chargement des produits et couleurs…")}</p>}
      {data && !readOnly && <><p>{_ui("Cible :")}{" "}{data.snapshot.request.target_name} {" "}{_ui("· Prévu le")}{" "}{new Date(data.snapshot.request.planned_at).toLocaleString(_uiLocale)}</p>
        {!data.can_review && <p className="text-red-700">{_ui("Fonction Responsable d’exploitation active et habilitation de validation requises. Le demandeur ne peut pas valider sa propre prescription.")}</p>}
        {lines.map((line: any) => <section key={line.line_id} className="border rounded p-3 space-y-2">
          <h3 className="font-bold">{line.product}</h3><span className={`inline-block border rounded px-2 py-1 text-sm ${stationRiskStyles[line.risk as StationRisk]}`}>{_uiNode(stationRiskLabels[line.risk as StationRisk])}</span>
          <p className="text-sm">{_ui("Cible :")}{" "}{line.prescribed.target_name || data.snapshot.request.target_name}</p>
          <p className="text-sm">{line.prescribed.dose} {line.prescribed.dose_unit} {" "}{_ui("· Quantité prévue :")}{" "}{Number(line.prescribed.planned_quantity).toLocaleString(_uiLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {" "}{_ui("· DAR :")}{" "}{line.prescribed.phi_days ?? '—'} j</p>
          <p className="text-xs">{(line.sources || []).map((s: any) => _ui("Liste {v0}{v1}",{v0:String(s.version),v1:String(s.restriction_until ? ` · validité : ${s.restriction_until}` : '')})).join(' ; ')}</p>
          {line.expired && <p className="text-red-700">{_ui("Restriction expirée à la date prévue. Une consigne actualisée est nécessaire.")}</p>}
          {line.risk === 'unknown' && <p className="text-red-700">{_ui("Contrôler la couleur et le lien cible/produit dans la liste positive avant validation.")}</p>}
          {['yellow', 'red'].includes(line.risk) && <label className="flex items-start gap-2"><input type="checkbox" disabled={busy || !data.can_review} checked={checks[line.line_id]?.station_agreed === true} onChange={e => confirm(line.line_id, 'station_agreed', e.target.checked)} /><span>{_ui("Je confirme avoir obtenu l’accord")}{" "}{line.risk === 'yellow' ? _ui("du service Food Safety de la station") : _ui("de la station")} {" "}{_ui("pour")}{" "}{line.product}.</span></label>}
          {line.risk === 'red' && <label className="flex items-start gap-2"><input type="checkbox" disabled={busy || !data.can_review} checked={checks[line.line_id]?.restrictions_checked === true} onChange={e => confirm(line.line_id, 'restrictions_checked', e.target.checked)} /><span>{_ui("Je confirme avoir vérifié les restrictions applicables et leurs conditions de validité pour")}{" "}{line.product}.</span></label>}
        </section>)}
        <label className="block">{_ui("Commentaire / motif du refus")}<textarea className="block w-full border rounded p-2" value={reason} onChange={e => setReason(e.target.value)} maxLength={2000} /></label>
        <div className="flex gap-3"><button className="border rounded px-3 py-2" disabled={busy || !data.can_review} onClick={() => review(false)}>{_ui("Refuser")}</button><button className="bg-green-800 text-white rounded px-3 py-2 disabled:opacity-50" disabled={busy || !data.can_review || !stationConfirmationsComplete(lines, checks)} onClick={() => review(true)}>{busy ? _ui("Enregistrement…") : _ui("Valider la prescription")}</button></div>
      </>}
      {data && <details open={readOnly}><summary>{_ui("Historique des attestations (")}{data.history.length})</summary>{!data.history.length && <p>{_ui("Aucune attestation enregistrée.")}</p>}{data.history.map((h: any) => <div key={h.id} className="border rounded p-3 mt-2"><p>{h.actor} · {new Date(h.created_at).toLocaleString(_uiLocale)}</p>{h.snapshot.lines.map((l: any) => { const c = h.confirmations.find((x: any) => x.line_id === l.line_id); return <p key={l.line_id}>{l.product} — {_uiNode(stationRiskLabels[l.risk as StationRisk])}{c?.station_agreed ? _ui("· accord Station attesté") : ''}{c?.restrictions_checked ? _ui("· restrictions vérifiées") : ''} · {(l.sources || []).map((s: any) => _ui("liste {v0}",{v0:String(s.version)})).join(', ')}</p> })}</div>)}</details>}
    </div>
  </Modal>
}
