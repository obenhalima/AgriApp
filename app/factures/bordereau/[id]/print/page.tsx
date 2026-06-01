'use client'
/**
 * Vue imprimable d'un bordereau station.
 *
 * Layout type facture professionnelle :
 *   - En-tête (logo, identité de la ferme, identité station)
 *   - Métadonnées bordereau (code, période, date de réception, échéance)
 *   - Tableau détaillé des lignes (marché × variété × ferme × qté × prix × montant)
 *   - Total global
 *   - Mentions légales / cachet
 *
 * Ouvre dans un onglet séparé, Ctrl+P du navigateur pour export PDF natif.
 */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface PrintData {
  settlement: any
  lines: any[]
}

export default function BordereauPrintPage() {
  const params = useParams()
  const id = params?.id as string

  const [data, setData] = useState<PrintData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    ;(async () => {
      const [sRes, lRes] = await Promise.all([
        supabase
          .from('station_settlements')
          .select('*')
          .eq('id', id)
          .single(),
        supabase
          .from('station_settlement_lines')
          .select(`
            id, qty_kg, price_per_kg, amount, notes,
            markets ( name, code, currency ),
            varieties ( commercial_name, code ),
            farms ( name, code )
          `)
          .eq('settlement_id', id)
          .order('created_at'),
      ])
      if (sRes.error) {
        setError(sRes.error.message)
        return
      }
      if (lRes.error) {
        setError(lRes.error.message)
        return
      }
      setData({ settlement: sRes.data, lines: lRes.data ?? [] })
      // Auto-trigger print dialog after render (avec léger délai pour le rendu)
      setTimeout(() => window.print(), 600)
    })()
  }, [id])

  if (error) {
    return (
      <div style={{ padding: 40, fontFamily: 'system-ui', color: '#dc2626' }}>
        Erreur : {error}
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ padding: 40, fontFamily: 'system-ui' }}>
        Chargement du bordereau…
      </div>
    )
  }

  const s = data.settlement
  const totalKg = data.lines.reduce((acc, l) => acc + Number(l.qty_kg || 0), 0)
  const totalAmount = data.lines.reduce((acc, l) => acc + Number(l.amount || 0), 0)
  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')
  const fmt2 = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const dateFmt = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'

  return (
    <>
      <style>{`
        @page { size: A4; margin: 18mm 15mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
        body {
          font-family: 'Helvetica Neue', Arial, sans-serif;
          background: #f3f4f6;
          color: #111827;
          margin: 0;
          padding: 0;
        }
        .sheet {
          max-width: 210mm;
          margin: 12mm auto;
          background: white;
          padding: 18mm 15mm;
          box-shadow: 0 4px 20px rgba(0,0,0,.06);
          font-size: 11pt;
        }
        h1 { font-size: 22pt; margin: 0; color: #111827; letter-spacing: -.5px; }
        h2 { font-size: 11pt; text-transform: uppercase; color: #6b7280; letter-spacing: 1.5px; margin: 0 0 4px; font-weight: 600; }
        .header {
          display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2px solid #111827; padding-bottom: 14px; margin-bottom: 22px;
        }
        .meta {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px;
          margin-bottom: 26px;
        }
        .meta div { font-size: 10pt; }
        .meta label { display: block; text-transform: uppercase; font-size: 8pt; color: #9ca3af; letter-spacing: 1px; margin-bottom: 2px; font-weight: 600; }
        .meta strong { font-size: 11pt; color: #111827; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th { text-align: left; padding: 8px 10px; font-size: 9pt; text-transform: uppercase; letter-spacing: .8px; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb; }
        td { padding: 9px 10px; font-size: 10.5pt; border-bottom: 1px solid #f3f4f6; }
        td.num { text-align: right; font-variant-numeric: tabular-nums; }
        tr.total td { border-top: 2px solid #111827; border-bottom: none; font-weight: 700; font-size: 11pt; padding-top: 12px; }
        .pill {
          display: inline-block; padding: 2px 8px; border-radius: 10px;
          font-size: 9pt; font-weight: 600; letter-spacing: .5px;
        }
        .pill.valid { background: #dcfce7; color: #166534; }
        .pill.draft { background: #fef3c7; color: #92400e; }
        .footer {
          margin-top: 40px; padding-top: 18px; border-top: 1px solid #e5e7eb;
          font-size: 9.5pt; color: #6b7280;
          display: flex; justify-content: space-between; gap: 20px;
        }
        .footer .sig { text-align: center; min-width: 180px; }
        .footer .sig-line { border-top: 1px solid #111827; margin-top: 44px; padding-top: 6px; }
        .print-toolbar {
          position: sticky; top: 0; background: #111827; color: white;
          padding: 10px 16px; display: flex; gap: 12px; align-items: center;
          font-size: 10pt; z-index: 10;
        }
        .print-toolbar button {
          background: #3b82f6; color: white; border: none; padding: 7px 14px;
          border-radius: 5px; font-size: 10.5pt; font-weight: 600; cursor: pointer;
        }
        .print-toolbar button.secondary {
          background: transparent; border: 1px solid rgba(255,255,255,.3);
        }
      `}</style>

      <div className="print-toolbar no-print">
        <span>Vue imprimable bordereau {s.code}</span>
        <button onClick={() => window.print()}>🖨️ Imprimer / PDF</button>
        <button className="secondary" onClick={() => window.close()}>Fermer</button>
        <span style={{ marginLeft: 'auto', fontSize: '9pt', opacity: .7 }}>
          Astuce : dans la boîte d'impression, choisir "Enregistrer en PDF" pour télécharger.
        </span>
      </div>

      <div className="sheet">
        {/* En-tête */}
        <div className="header">
          <div>
            <div style={{ fontSize: '8pt', textTransform: 'uppercase', letterSpacing: 1.5, color: '#9ca3af', marginBottom: 6 }}>
              Bordereau de paiement station
            </div>
            <h1>{s.code}</h1>
            <div style={{ fontSize: '10pt', color: '#6b7280', marginTop: 4 }}>
              Émis le {dateFmt(s.received_date)} ·{' '}
              <span className={`pill ${s.status === 'valide' ? 'valid' : 'draft'}`}>
                {s.status === 'valide' ? 'VALIDÉ' : 'BROUILLON'}
              </span>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '10pt', lineHeight: 1.5 }}>
            <div style={{ fontWeight: 700, fontSize: '12pt', color: '#111827' }}>Domaine BENHALIMA</div>
            <div style={{ color: '#6b7280' }}>Production maraîchère</div>
            <div style={{ color: '#6b7280' }}>Maroc</div>
          </div>
        </div>

        {/* Métadonnées */}
        <div className="meta">
          <div>
            <label>Période</label>
            <strong>
              {dateFmt(s.period_start)}<br />
              → {dateFmt(s.period_end)}
            </strong>
          </div>
          <div>
            <label>Reçu le</label>
            <strong>{dateFmt(s.received_date)}</strong>
          </div>
          <div>
            <label>Échéance prévue</label>
            <strong style={{ color: '#3b82f6' }}>{dateFmt(s.expected_payment_date)}</strong>
          </div>
          <div>
            <label>Total à encaisser</label>
            <strong style={{ fontSize: '14pt', color: '#10b981' }}>
              {fmt2(totalAmount)} MAD
            </strong>
          </div>
        </div>

        {/* Tableau lignes */}
        <h2>Détail des paiements ({data.lines.length} ligne{data.lines.length > 1 ? 's' : ''})</h2>
        <table>
          <thead>
            <tr>
              <th>Marché</th>
              <th>Variété</th>
              <th>Ferme</th>
              <th className="num">Quantité (kg)</th>
              <th className="num">Prix / kg</th>
              <th className="num">Montant (MAD)</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.markets?.name ?? '—'}</td>
                <td>
                  {l.varieties?.code && (
                    <span style={{ fontFamily: 'monospace', background: '#f3f4f6', padding: '1px 6px', borderRadius: 3, fontSize: '9.5pt', marginRight: 6 }}>
                      {l.varieties.code}
                    </span>
                  )}
                  {l.varieties?.commercial_name}
                </td>
                <td>{l.farms?.name ?? <span style={{ color: '#9ca3af' }}>Toutes</span>}</td>
                <td className="num">{fmt(Number(l.qty_kg))}</td>
                <td className="num">{fmt2(Number(l.price_per_kg))}</td>
                <td className="num" style={{ fontWeight: 600 }}>{fmt2(Number(l.amount))}</td>
              </tr>
            ))}
            <tr className="total">
              <td colSpan={3}>TOTAL</td>
              <td className="num">{fmt(totalKg)} kg</td>
              <td className="num">—</td>
              <td className="num" style={{ color: '#10b981' }}>{fmt2(totalAmount)} MAD</td>
            </tr>
          </tbody>
        </table>

        {/* Notes éventuelles */}
        {s.notes && (
          <div style={{ marginTop: 26, padding: 12, background: '#f9fafb', borderLeft: '3px solid #3b82f6', fontSize: '10pt' }}>
            <strong style={{ color: '#6b7280', textTransform: 'uppercase', fontSize: '8.5pt', letterSpacing: 1 }}>Notes</strong>
            <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{s.notes}</div>
          </div>
        )}

        {/* Footer + signature */}
        <div className="footer">
          <div style={{ flex: 1 }}>
            <strong style={{ display: 'block', color: '#111827', marginBottom: 4 }}>Conditions de paiement</strong>
            Échéance prévue : <strong>{dateFmt(s.expected_payment_date)}</strong><br />
            Pour toute question, contacter la comptabilité.
          </div>
          <div className="sig">
            <div className="sig-line">Cachet et signature station</div>
          </div>
          <div className="sig">
            <div className="sig-line">Domaine BENHALIMA</div>
          </div>
        </div>
      </div>
    </>
  )
}
