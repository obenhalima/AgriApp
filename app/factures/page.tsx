'use client'
import { useState } from 'react'

const FACTURES = [
  { num:'FV-2026-0089', client:'Souss Export SARL',     date:'12/03/2026', echeance:'11/04/2026', montant:48500, statut:'en_attente' },
  { num:'FV-2026-0088', client:'Marjane Distribution',   date:'08/03/2026', echeance:'07/04/2026', montant:32800, statut:'part_paye'  },
  { num:'FV-2026-0087', client:'EuroVeggie BV',          date:'05/03/2026', echeance:'04/04/2026', montant:67200, statut:'en_attente' },
  { num:'FV-2026-0086', client:'Groupe Carrefour',       date:'01/03/2026', echeance:'31/03/2026', montant:41000, statut:'en_retard'  },
  { num:'FV-2026-0085', client:'Atlas Fresh Ltd',        date:'25/02/2026', echeance:'26/03/2026', montant:29500, statut:'paye'       },
  { num:'FV-2026-0084', client:'Marche Central Agadir',  date:'20/02/2026', echeance:'21/03/2026', montant:12800, statut:'paye'       },
]
const ST: Record<string,{ cls:string; label:string }> = {
  paye:       { cls:'tag-blue',  label:'● Paye'          },
  en_attente: { cls:'tag-amber', label:'● En attente'    },
  part_paye:  { cls:'tag-amber', label:'● Part. paye'    },
  en_retard:  { cls:'tag-red',   label:'● En retard'     },
}

function Modal({ title, onClose, children }:{ title:string; onClose:()=>void; children:React.ReactNode }) {
  return (
    <div className="modal-overlay" onClick={e=>{ if(e.target===e.currentTarget) onClose() }}>
      <div className="modal-box" onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><span className="modal-title">{title}</span><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export default function FacturesPage() {
  const [modal, setModal] = useState<string|null>(null)
  const [form, setForm] = useState({ client:'', date:'', echeance:'', montant:'', variete:'', notes:'' })
  const [done, setDone] = useState(false)
  const set=(k:string,v:string)=>setForm(f=>({...f,[k]:v}))
  const save=()=>{ setDone(true); setTimeout(()=>{ setModal(null); setDone(false) },1400) }

  const totalFact = FACTURES.reduce((s,f)=>s+f.montant,0)
  const totalPaye = FACTURES.filter(f=>f.statut==='paye').reduce((s,f)=>s+f.montant,0)
  const totalAttente = FACTURES.filter(f=>f.statut==='en_attente'||f.statut==='part_paye').reduce((s,f)=>s+f.montant,0)
  const totalRetard = FACTURES.filter(f=>f.statut==='en_retard').reduce((s,f)=>s+f.montant,0)

  return (
    <div style={{ padding:'22px 26px', background:'#f4f9f4', minHeight:'100vh' }}>
      {modal==='facture' && (
        <Modal title="Nouvelle facture client" onClose={()=>setModal(null)}>
          {done ? <div style={{ textAlign:'center', padding:'28px 0' }}><div style={{ fontSize:44, marginBottom:10 }}>✅</div><div style={{ fontSize:16, fontWeight:700, color:'#2d6a4f' }}>Facture creee !</div></div> : (<>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Client</label>
                <select className="form-input" value={form.client} onChange={e=>set('client',e.target.value)}>
                  <option value="">-- Selectionner --</option>
                  {['Souss Export SARL','Marjane Distribution','EuroVeggie BV','Groupe Carrefour','Atlas Fresh Ltd'].map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Montant (MAD)</label><input type="number" className="form-input" placeholder="0.00" value={form.montant} onChange={e=>set('montant',e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Date facture</label><input type="date" className="form-input" value={form.date} onChange={e=>set('date',e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Date echeance</label><input type="date" className="form-input" value={form.echeance} onChange={e=>set('echeance',e.target.value)} /></div>
            </div>
            <div className="form-group"><label className="form-label">Variete / Produit</label>
              <select className="form-input" value={form.variete} onChange={e=>set('variete',e.target.value)}>
                <option value="">Tous produits</option>
                {['Vitalia','Torero','Cherry Sun','Grappe Premium','Brillante'].map(v=><option key={v}>{v}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Notes</label><textarea className="form-input" rows={2} placeholder="Conditions, remarques..." value={form.notes} onChange={e=>set('notes',e.target.value)} style={{ resize:'vertical' }} /></div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={()=>setModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={save} disabled={!form.client||!form.montant||!form.date}>Creer la facture</button>
            </div>
          </>)}
        </Modal>
      )}
      {modal==='paiement' && (
        <Modal title="Enregistrer un paiement" onClose={()=>setModal(null)}>
          {done ? <div style={{ textAlign:'center', padding:'28px 0' }}><div style={{ fontSize:44, marginBottom:10 }}>✅</div><div style={{ fontSize:16, fontWeight:700, color:'#2d6a4f' }}>Paiement enregistre !</div></div> : (<>
            <div className="form-group"><label className="form-label">Facture</label>
              <select className="form-input"><option>FV-2026-0086 · Carrefour · 41 000 MAD</option>{FACTURES.filter(f=>f.statut!=='paye').map(f=><option key={f.num}>{f.num} · {f.client} · {f.montant.toLocaleString('fr')} MAD</option>)}</select>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Montant recu (MAD)</label><input type="number" className="form-input" placeholder="0.00" /></div>
              <div className="form-group"><label className="form-label">Date paiement</label><input type="date" className="form-input" /></div>
            </div>
            <div className="form-group"><label className="form-label">Mode de paiement</label>
              <select className="form-input"><option>Virement bancaire</option><option>Cheque</option><option>Especes</option></select>
            </div>
            <div className="form-group"><label className="form-label">Reference bancaire</label><input className="form-input" placeholder="ex: VIR-20260315-001" /></div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={()=>setModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={save}>Enregistrer le paiement</button>
            </div>
          </>)}
        </Modal>
      )}

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          <h2 style={{ fontFamily:'Syne,sans-serif', fontSize:20, fontWeight:700, color:'#1b3a2d', marginBottom:4 }}>Factures Clients</h2>
          <p style={{ fontSize:13, color:'#5a7a66' }}>6 factures · Encours : {totalAttente.toLocaleString('fr')} MAD</p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn-secondary" onClick={()=>setModal('paiement')}>💳 Encaissement</button>
          <button className="btn-primary" onClick={()=>setModal('facture')}>+ Nouvelle facture</button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:18 }}>
        {[
          { label:'Total facture',  val:`${(totalFact/1000).toFixed(0)} k`, sub:'MAD ce mois', color:'#2d6a4f' },
          { label:'Encaisse',       val:`${(totalPaye/1000).toFixed(0)} k`, sub:'MAD recuperes', color:'#40916c' },
          { label:'En attente',     val:`${(totalAttente/1000).toFixed(0)} k`, sub:'MAD a encaisser', color:'#e9a820' },
          { label:'En retard',      val:`${(totalRetard/1000).toFixed(0)} k`, sub:'MAD — 1 facture', color:'#e63946' },
        ].map((k,i)=>(
          <div key={i} className="kpi-card" style={{ borderTop:`3px solid ${k.color}` }}>
            <div style={{ fontSize:10, fontWeight:600, color:'#5a7a66', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:5 }}>{k.label}</div>
            <div style={{ fontFamily:'Syne,sans-serif', fontSize:22, fontWeight:800, color:'#1b3a2d', marginBottom:3 }}>{k.val} <span style={{ fontSize:12, fontWeight:500, color:'#5a7a66' }}>{k.sub}</span></div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <div style={{ display:'flex', gap:8 }}>
            <input placeholder="Rechercher..." className="form-input" style={{ width:220, padding:'7px 12px' }} />
            <select className="form-input" style={{ width:'auto', padding:'7px 12px' }}><option>Tous statuts</option><option>En attente</option><option>En retard</option><option>Paye</option></select>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn-secondary">📥 Excel</button>
            <button className="btn-secondary">🖨️ PDF</button>
          </div>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table>
            <thead><tr>{['N° Facture','Client','Date','Echeance','Montant (MAD)','Statut','Actions'].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {FACTURES.map(f=>(
                <tr key={f.num}>
                  <td style={{ fontFamily:'monospace', fontSize:12, fontWeight:600, color:'#1b3a2d' }}>{f.num}</td>
                  <td style={{ fontWeight:500, color:'#1b3a2d' }}>{f.client}</td>
                  <td style={{ color:'#5a7a66', fontSize:12 }}>{f.date}</td>
                  <td style={{ fontSize:12, fontWeight: f.statut==='en_retard' ? 700 : 400, color: f.statut==='en_retard' ? '#e63946' : '#5a7a66' }}>{f.echeance}</td>
                  <td style={{ fontWeight:600, color:'#1b3a2d', fontFamily:'monospace' }}>{f.montant.toLocaleString('fr')}</td>
                  <td><span className={ST[f.statut].cls}>{ST[f.statut].label}</span></td>
                  <td>
                    <div style={{ display:'flex', gap:5 }}>
                      <button className="btn-ghost" style={{ padding:'4px 9px', fontSize:11 }}>👁 Voir</button>
                      <button className="btn-secondary" style={{ padding:'4px 9px', fontSize:11 }}>🖨 PDF</button>
                      {f.statut!=='paye' && <button className="btn-primary" style={{ padding:'4px 9px', fontSize:11 }} onClick={()=>setModal('paiement')}>💳 Payer</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
