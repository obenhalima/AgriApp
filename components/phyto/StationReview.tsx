'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { stationConfirmationsComplete, stationRiskLabels, stationRiskStyles, StationRisk } from '@/lib/stationRisk'

export function StationReview({ requestId, readOnly = false, onClose, onDone }: { requestId: string; readOnly?: boolean; onClose: () => void; onDone: (approved: boolean) => void }) {
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
  return <Modal title={readOnly ? 'HISTORIQUE DES CONFIRMATIONS STATION' : 'VALIDATION DU RESPONSABLE D’EXPLOITATION'} size="lg" onClose={() => { if (!busy) onClose() }}>
    <div className="space-y-4">
      <p>Une seule validation. Vous attestez avoir obtenu l’accord de la station ; la station n’a aucun accès à FarmPilot.</p>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {!data && !error && <p>Chargement des produits et couleurs…</p>}
      {data && !readOnly && <><p>Cible : {data.snapshot.request.target_name} · Prévu le {new Date(data.snapshot.request.planned_at).toLocaleString('fr-FR')}</p>
        {!data.can_review && <p className="text-red-700">Fonction Responsable d’exploitation active et habilitation de validation requises. Le demandeur ne peut pas valider sa propre prescription.</p>}
        {lines.map((line: any) => <section key={line.line_id} className="border rounded p-3 space-y-2">
          <h3 className="font-bold">{line.product}</h3><span className={`inline-block border rounded px-2 py-1 text-sm ${stationRiskStyles[line.risk as StationRisk]}`}>{stationRiskLabels[line.risk as StationRisk]}</span>
          <p className="text-sm">{line.prescribed.dose} {line.prescribed.dose_unit} · Quantité prévue : {Number(line.prescribed.planned_quantity).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · DAR : {line.prescribed.phi_days ?? '—'} j</p>
          <p className="text-xs">{(line.sources || []).map((s: any) => `Liste ${s.version}${s.restriction_until ? ` · validité : ${s.restriction_until}` : ''}`).join(' ; ')}</p>
          {line.expired && <p className="text-red-700">Restriction expirée à la date prévue. Une consigne actualisée est nécessaire.</p>}
          {line.risk === 'unknown' && <p className="text-red-700">Contrôler la couleur et le lien cible/produit dans la liste positive avant validation.</p>}
          {['yellow', 'red'].includes(line.risk) && <label className="flex items-start gap-2"><input type="checkbox" disabled={busy || !data.can_review} checked={checks[line.line_id]?.station_agreed === true} onChange={e => confirm(line.line_id, 'station_agreed', e.target.checked)} /><span>Je confirme avoir obtenu l’accord {line.risk === 'yellow' ? 'du service Food Safety de la station' : 'de la station'} pour {line.product}.</span></label>}
          {line.risk === 'red' && <label className="flex items-start gap-2"><input type="checkbox" disabled={busy || !data.can_review} checked={checks[line.line_id]?.restrictions_checked === true} onChange={e => confirm(line.line_id, 'restrictions_checked', e.target.checked)} /><span>Je confirme avoir vérifié les restrictions applicables et leurs conditions de validité pour {line.product}.</span></label>}
        </section>)}
        <label className="block">Commentaire / motif du refus<textarea className="block w-full border rounded p-2" value={reason} onChange={e => setReason(e.target.value)} maxLength={2000} /></label>
        <div className="flex gap-3"><button className="border rounded px-3 py-2" disabled={busy || !data.can_review} onClick={() => review(false)}>Refuser</button><button className="bg-green-800 text-white rounded px-3 py-2 disabled:opacity-50" disabled={busy || !data.can_review || !stationConfirmationsComplete(lines, checks)} onClick={() => review(true)}>{busy ? 'Enregistrement…' : 'Valider la prescription'}</button></div>
      </>}
      {data && <details open={readOnly}><summary>Historique des attestations ({data.history.length})</summary>{!data.history.length && <p>Aucune attestation enregistrée.</p>}{data.history.map((h: any) => <div key={h.id} className="border rounded p-3 mt-2"><p>{h.actor} · {new Date(h.created_at).toLocaleString('fr-FR')}</p>{h.snapshot.lines.map((l: any) => { const c = h.confirmations.find((x: any) => x.line_id === l.line_id); return <p key={l.line_id}>{l.product} — {stationRiskLabels[l.risk as StationRisk]}{c?.station_agreed ? ' · accord Station attesté' : ''}{c?.restrictions_checked ? ' · restrictions vérifiées' : ''} · {(l.sources || []).map((s: any) => `liste ${s.version}`).join(', ')}</p> })}</div>)}</details>}
    </div>
  </Modal>
}
