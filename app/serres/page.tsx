'use client'
import { useState } from 'react'

const SERRES = [
  { code:'S01', nom:'Serre Nord A',    sup:6200, exp:5800, statut:'active',       type:'Tunnel',   vars:['Vitalia','Torero'],  rend_th:47, rend_reel:44.2, prod:256, color:'#40916c' },
  { code:'S02', nom:'Serre Nord B',    sup:6200, exp:5800, statut:'active',       type:'Tunnel',   vars:['Torero'],            rend_th:50, rend_reel:48.8, prod:283, color:'#2d6a4f' },
  { code:'S03', nom:'Serre Sud A',     sup:5500, exp:5100, statut:'active',       type:'Chapelle', vars:['Grappe Premium'],    rend_th:40, rend_reel:38.5, prod:196, color:'#74c69d' },
  { code:'S04', nom:'Serre Sud B',     sup:5500, exp:5000, statut:'active',       type:'Chapelle', vars:['Cherry Sun'],        rend_th:35, rend_reel:33.2, prod:166, color:'#e9c46a' },
  { code:'S05', nom:'Serre Est A',     sup:4800, exp:4400, statut:'active',       type:'Venlo',    vars:['Vitalia'],           rend_th:45, rend_reel:43.0, prod:189, color:'#f4a261' },
  { code:'S06', nom:'Serre Est B',     sup:4800, exp:4200, statut:'preparation',  type:'Venlo',    vars:[],                   rend_th:48, rend_reel:0,    prod:0,   color:'#9dc4b0' },
  { code:'S07', nom:'Serre Ouest A',   sup:5100, exp:4700, statut:'active',       type:'Tunnel',   vars:['Brillante'],        rend_th:35, rend_reel:34.0, prod:160, color:'#d4956a' },
  { code:'S08', nom:'Serre Centrale',  sup:3900, exp:3500, statut:'active',       type:'Chapelle', vars:['Cherry Sun'],       rend_th:30, rend_reel:27.5, prod:96,  color:'#5b9bd5' },
]
const COLORS = ['#40916c','#2d6a4f','#74c69d','#e9c46a','#f4a261']

function Modal({ title, onClose, children }: { title:string; onClose:()=>void; children:React.ReactNode }) {
  return (
    <div className="modal-overlay" onClick={e=>{ if(e.target===e.currentTarget) onClose() }}>
      <div className="modal-box" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export default function SerresPage() {
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ code:'', nom:'', type:'Tunnel', statut:'active', superficie:'', exploitable:'', zone:'Nord', notes:'' })
  const [done, setDone] = useState(false)
  const set = (k:string,v:string) => setForm(f=>({...f,[k]:v}))
  const save = () => { setDone(true); setTimeout(()=>{ setModal(false); setDone(false) }, 1400) }

  return (
    <div style={{ padding:'22px 26px', background:'#f4f9f4', minHeight:'100vh' }}>

      {modal && (
        <Modal title="Nouvelle serre" onClose={()=>setModal(false)}>
          {done ? (
            <div style={{ textAlign:'center', padding:'28px 0' }}>
              <div style={{ fontSize:44, marginBottom:10 }}>✅</div>
              <div style={{ fontSize:16, fontWeight:700, color:'#2d6a4f' }}>Serre creee avec succes !</div>
            </div>
          ) : (
            <>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Code</label><input className="form-input" placeholder="ex: S09" value={form.code} onChange={e=>set('code',e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Nom</label><input className="form-input" placeholder="ex: Serre Nord C" value={form.nom} onChange={e=>set('nom',e.target.value)} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Type</label>
                  <select className="form-input" value={form.type} onChange={e=>set('type',e.target.value)}>
                    {['Tunnel','Chapelle','Venlo','Multispan','Autre'].map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Statut</label>
                  <select className="form-input" value={form.statut} onChange={e=>set('statut',e.target.value)}>
                    <option value="active">Active</option>
                    <option value="preparation">En preparation</option>
                    <option value="hors_service">Hors service</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Superficie totale (m²)</label><input type="number" className="form-input" placeholder="ex: 5000" value={form.superficie} onChange={e=>set('superficie',e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Surface exploitable (m²)</label><input type="number" className="form-input" placeholder="ex: 4600" value={form.exploitable} onChange={e=>set('exploitable',e.target.value)} /></div>
              </div>
              <div className="form-group"><label className="form-label">Zone / Bloc</label>
                <select className="form-input" value={form.zone} onChange={e=>set('zone',e.target.value)}>
                  {['Nord','Sud','Est','Ouest','Centre'].map(z=><option key={z}>{z}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Observations</label><textarea className="form-input" rows={2} placeholder="Notes techniques..." value={form.notes} onChange={e=>set('notes',e.target.value)} style={{ resize:'vertical' }} /></div>
              <div className="modal-footer">
                <button className="btn-ghost" onClick={()=>setModal(false)}>Annuler</button>
                <button className="btn-primary" onClick={save} disabled={!form.code || !form.nom || !form.superficie}>Creer la serre</button>
              </div>
            </>
          )}
        </Modal>
      )}

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h2 style={{ fontFamily:'Syne,sans-serif', fontSize:20, fontWeight:700, color:'#1b3a2d', marginBottom:4 }}>Serres & Infrastructure</h2>
          <p style={{ fontSize:13, color:'#5a7a66' }}>Domaine Souss Agri · 8 serres · 42 000 m² exploitable</p>
        </div>
        <button className="btn-primary" onClick={()=>setModal(true)}>+ Nouvelle serre</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
        {[
          { label:'Serres actives', val:'7', sub:'1 en preparation', color:'#2d6a4f' },
          { label:'Surface totale', val:'42 000 m²', sub:'exploitable', color:'#40916c' },
          { label:'En production', val:'7', sub:'cette campagne', color:'#74c69d' },
          { label:'Rendement moyen', val:'41.4 kg/m²', sub:'campagne 2025-2026', color:'#f4a261' },
        ].map((k,i)=>(
          <div key={i} className="kpi-card" style={{ borderTop:`3px solid ${k.color}` }}>
            <div style={{ fontSize:10, fontWeight:600, color:'#5a7a66', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:5 }}>{k.label}</div>
            <div style={{ fontFamily:'Syne,sans-serif', fontSize:20, fontWeight:800, color:'#1b3a2d', marginBottom:3 }}>{k.val}</div>
            <div style={{ fontSize:11, color:'#5a7a66' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
        {SERRES.map(s=>{
          const pct = s.rend_th>0 ? Math.round(s.rend_reel/s.rend_th*100) : 0
          return (
            <div key={s.code} className="card" style={{ padding:0, overflow:'hidden', cursor:'pointer', transition:'transform .15s, box-shadow .15s' }}
              onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.transform='translateY(-2px)';(e.currentTarget as HTMLDivElement).style.boxShadow='0 6px 20px rgba(27,58,45,0.1)'}}
              onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.transform='';(e.currentTarget as HTMLDivElement).style.boxShadow=''}}>
              <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid #e8f5ec', display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontFamily:'Syne,sans-serif', fontSize:14, fontWeight:700, color:'#1b3a2d', marginBottom:2 }}>{s.nom}</div>
                  <div style={{ fontSize:11, color:'#5a7a66' }}>{s.code} · {s.type}</div>
                </div>
                <span className={s.statut==='active' ? 'tag-green' : 'tag-amber'}>
                  {s.statut==='active' ? '● actif' : '● prep.'}
                </span>
              </div>
              <div style={{ padding:'12px 16px' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                  <div><div style={{ fontSize:10, color:'#5a7a66', marginBottom:2 }}>Superficie</div><div style={{ fontSize:13, fontWeight:600, color:'#1b3a2d' }}>{s.sup.toLocaleString('fr')} m²</div></div>
                  <div><div style={{ fontSize:10, color:'#5a7a66', marginBottom:2 }}>Production</div><div style={{ fontSize:13, fontWeight:600, color: s.prod>0 ? s.color : '#aaa' }}>{s.prod>0 ? `${s.prod} t` : '—'}</div></div>
                  <div><div style={{ fontSize:10, color:'#5a7a66', marginBottom:2 }}>Rend. theorique</div><div style={{ fontSize:13, fontWeight:600, color:'#1b3a2d' }}>{s.rend_th>0 ? `${s.rend_th} kg/m²` : '—'}</div></div>
                  <div><div style={{ fontSize:10, color:'#5a7a66', marginBottom:2 }}>Rend. reel</div><div style={{ fontSize:13, fontWeight:600, color: s.rend_reel>=s.rend_th*0.95 ? '#2d6a4f' : '#d97706' }}>{s.rend_reel>0 ? `${s.rend_reel} kg/m²` : '—'}</div></div>
                </div>
                {s.vars.length>0 && (
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:10, color:'#5a7a66', marginBottom:5 }}>Varietes plantees</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                      {s.vars.map((v,i)=>(
                        <span key={v} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:500, background:'#f4f9f4', border:'1px solid #cce5d4', color:'#1b3a2d' }}>
                          <span style={{ width:6, height:6, borderRadius:'50%', background:COLORS[i%5], display:'inline-block' }} />{v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {s.statut==='active' && s.rend_reel>0 && (
                  <div>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#5a7a66', marginBottom:3 }}>
                      <span>Avancement recolte</span><span>{pct}%</span>
                    </div>
                    <div style={{ height:5, background:'#e8f5ec', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${pct}%`, background:s.color, borderRadius:3 }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
