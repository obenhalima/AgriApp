'use client'
import { useState } from 'react'

const STOCKS = [
  { code:'ST001', nom:'Plants Vitalia (greffes)', cat:'Plants',    qte:24500, unite:'unite',  min:5000,  cout:1.2,  alerte:false },
  { code:'ST002', nom:'NPK 20-20-20',             cat:'Engrais',   qte:850,   unite:'kg',     min:200,   cout:12.5, alerte:false },
  { code:'ST003', nom:'Nitrate de Calcium',        cat:'Engrais',   qte:320,   unite:'kg',     min:400,   cout:8.2,  alerte:true  },
  { code:'ST004', nom:'Boites export 5kg',         cat:'Emballage', qte:12400, unite:'unite',  min:3000,  cout:2.8,  alerte:false },
  { code:'ST005', nom:'Filets 1kg cerise',         cat:'Emballage', qte:4800,  unite:'unite',  min:5000,  cout:0.85, alerte:true  },
  { code:'ST006', nom:'Azoxystrobin 250SC',        cat:'Phyto',     qte:42,    unite:'L',      min:20,    cout:95,   alerte:false },
  { code:'ST007', nom:'Substrat Coco 70L',         cat:'Substrat',  qte:180,   unite:'sac',    min:50,    cout:45,   alerte:false },
]

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

export default function StocksPage() {
  const [modal, setModal] = useState<string|null>(null)
  const [form, setForm] = useState({ article:'ST001', type:'entree', qte:'', date:'', serre:'', ref:'', notes:'' })
  const [done, setDone] = useState(false)
  const set = (k:string,v:string)=>setForm(f=>({...f,[k]:v}))
  const save=()=>{ setDone(true); setTimeout(()=>{ setModal(null); setDone(false) }, 1400) }
  const total = STOCKS.reduce((s,i)=>s+i.qte*i.cout,0)

  return (
    <div style={{ padding:'22px 26px', background:'#f4f9f4', minHeight:'100vh' }}>
      {modal==='mouvement' && (
        <Modal title="Mouvement de stock" onClose={()=>setModal(null)}>
          {done ? <div style={{ textAlign:'center', padding:'28px 0' }}><div style={{ fontSize:44, marginBottom:10 }}>✅</div><div style={{ fontSize:16, fontWeight:700, color:'#2d6a4f' }}>Mouvement enregistre !</div></div> : (<>
            <div className="form-group"><label className="form-label">Article</label>
              <select className="form-input" value={form.article} onChange={e=>set('article',e.target.value)}>
                {STOCKS.map(s=><option key={s.code} value={s.code}>{s.code} · {s.nom}</option>)}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Type de mouvement</label>
                <select className="form-input" value={form.type} onChange={e=>set('type',e.target.value)}>
                  <option value="entree">Entree (reception)</option>
                  <option value="sortie">Sortie (consommation)</option>
                  <option value="ajustement">Ajustement inventaire</option>
                </select>
              </div>
              <div className="form-group"><label className="form-label">Quantite</label><input type="number" className="form-input" placeholder="0" value={form.qte} onChange={e=>set('qte',e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Date</label><input type="date" className="form-input" value={form.date} onChange={e=>set('date',e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Serre concernee</label>
                <select className="form-input" value={form.serre} onChange={e=>set('serre',e.target.value)}>
                  <option value="">Toutes serres</option>
                  {['S01 Nord A','S02 Nord B','S03 Sud A','S04 Sud B','S05 Est A'].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group"><label className="form-label">Reference / Bon</label><input className="form-input" placeholder="ex: BL-2026-0042" value={form.ref} onChange={e=>set('ref',e.target.value)} /></div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={()=>setModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={save} disabled={!form.qte||!form.date}>Enregistrer</button>
            </div>
          </>)}
        </Modal>
      )}

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
        <div>
          <h2 style={{ fontFamily:'Syne,sans-serif', fontSize:20, fontWeight:700, color:'#1b3a2d', marginBottom:4 }}>Gestion des Stocks</h2>
          <p style={{ fontSize:13, color:'#5a7a66' }}>{STOCKS.filter(s=>s.alerte).length} article(s) en alerte</p>
        </div>
        <button className="btn-primary" onClick={()=>setModal('mouvement')}>+ Mouvement stock</button>
      </div>

      {STOCKS.filter(s=>s.alerte).map(s=>(
        <div key={s.code} style={{ display:'flex', alignItems:'center', gap:9, padding:'10px 14px', borderRadius:9, marginBottom:8, background:'#fffbec', border:'1px solid #f0e0a0', color:'#7a5500', fontSize:12.5 }}>
          ⚠ <strong>{s.nom}</strong> — Stock actuel <strong>{s.qte.toLocaleString('fr')} {s.unite}</strong> sous le seuil minimum ({s.min.toLocaleString('fr')} {s.unite})
        </div>
      ))}

      <div className="card" style={{ marginTop:16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <div style={{ fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:700, color:'#1b3a2d' }}>Articles en stock</div>
          <button className="btn-secondary">📊 Valorisation totale : {Math.round(total/1000)} k MAD</button>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table>
            <thead><tr>
              {['Code','Article','Categorie','Stock actuel','Seuil min.','Cout unit.','Valeur stock','Alerte','Actions'].map(h=><th key={h}>{h}</th>)}
            </tr></thead>
            <tbody>
              {STOCKS.map(s=>(
                <tr key={s.code} style={{ cursor:'pointer' }}>
                  <td style={{ fontFamily:'monospace', fontSize:12, color:'#5a7a66' }}>{s.code}</td>
                  <td style={{ fontWeight:600, color:'#1b3a2d' }}>{s.nom}</td>
                  <td><span className="tag-blue">{s.cat}</span></td>
                  <td style={{ fontWeight:600, color: s.alerte ? '#e63946' : '#1b3a2d' }}>{s.qte.toLocaleString('fr')} {s.unite}</td>
                  <td style={{ color:'#5a7a66' }}>{s.min.toLocaleString('fr')} {s.unite}</td>
                  <td style={{ fontFamily:'monospace', fontSize:12 }}>{s.cout.toFixed(2)} MAD</td>
                  <td style={{ fontWeight:600, color:'#1b3a2d' }}>{(s.qte*s.cout).toLocaleString('fr',{maximumFractionDigits:0})} MAD</td>
                  <td>{s.alerte ? <span className="tag-red">⚠ ALERTE</span> : <span className="tag-green">✓ OK</span>}</td>
                  <td>
                    <div style={{ display:'flex', gap:6 }}>
                      <button className="btn-secondary" style={{ padding:'4px 10px', fontSize:11 }} onClick={()=>setModal('mouvement')}>+ Entree</button>
                      <button className="btn-ghost" style={{ padding:'4px 10px', fontSize:11 }} onClick={()=>setModal('mouvement')}>- Sortie</button>
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
