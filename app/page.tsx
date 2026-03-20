'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ProductionChart } from '@/components/dashboard/ProductionChart'
import { CostChart, MarketPieChart } from '@/components/dashboard/CostChart'

/* ── données démo ── */
const SERRES = [
  { code:'S01', nom:'Nord A',   var:'Vitalia, Torero',  rend:44.2, th:47, color:'#40916c' },
  { code:'S02', nom:'Nord B',   var:'Torero',            rend:48.8, th:50, color:'#2d6a4f' },
  { code:'S03', nom:'Sud A',    var:'Grappe Premium',    rend:38.5, th:40, color:'#74c69d' },
  { code:'S04', nom:'Sud B',    var:'Cherry Sun',        rend:33.2, th:35, color:'#e9c46a' },
  { code:'S05', nom:'Est A',    var:'Vitalia',           rend:43.0, th:45, color:'#f4a261' },
  { code:'S06', nom:'Est B',    var:'-',                 rend:0,    th:0,  color:'#aaa', prep:true } as any,
]
const VARS = [
  { nom:'Cherry Sun',    pct:61, color:'#74c69d' },
  { nom:'Grappe Premium',pct:55, color:'#40916c' },
  { nom:'Brillante',     pct:52, color:'#2d6a4f' },
  { nom:'Torero',        pct:48, color:'#e9c46a' },
  { nom:'Vitalia',       pct:42, color:'#f4a261' },
]
const ALERTES = [
  { type:'err',  titre:'Facture en retard',     msg:'Carrefour · FV-2026-0086 · 41 000 MAD' },
  { type:'warn', titre:'Stock critique',         msg:'Filets 1kg cerise · 4 800 / min 5 000' },
  { type:'warn', titre:'Budget engrais depasse', msg:'412k vs 380k prevu (+8.4%)' },
]

/* ── composant modal générique ── */
function Modal({ title, onClose, children }: { title:string; onClose:()=>void; children:React.ReactNode }) {
  return (
    <div className="modal-overlay" onClick={(e)=>{ if(e.target===e.currentTarget) onClose() }}>
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

/* ── modal saisie récolte ── */
function ModalRecolte({ onClose }:{ onClose:()=>void }) {
  const [form, setForm] = useState({ serre:'S01', variete:'Vitalia', date:'', poids:'', cat1:'', cat2:'', notes:'' })
  const [done, setDone] = useState(false)
  const set = (k:string,v:string) => setForm(f=>({...f,[k]:v}))
  const save = () => { setDone(true); setTimeout(onClose, 1400) }
  if(done) return (
    <Modal title="Recolte" onClose={onClose}>
      <div style={{ textAlign:'center', padding:'28px 0' }}>
        <div style={{ fontSize:44, marginBottom:10 }}>✅</div>
        <div style={{ fontSize:16, fontWeight:700, color:'#2d6a4f', marginBottom:4 }}>Recolte enregistree !</div>
        <div style={{ fontSize:13, color:'#5a7a66' }}>Les donnees ont ete sauvegardees avec succes.</div>
      </div>
    </Modal>
  )
  return (
    <Modal title="Saisir une recolte" onClose={onClose}>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Serre</label>
          <select className="form-input" value={form.serre} onChange={e=>set('serre',e.target.value)}>
            {SERRES.filter(s=>!s.prep).map(s=><option key={s.code} value={s.code}>{s.code} · {s.nom}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Variete</label>
          <select className="form-input" value={form.variete} onChange={e=>set('variete',e.target.value)}>
            {VARS.map(v=><option key={v.nom}>{v.nom}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Date de recolte</label>
          <input type="date" className="form-input" value={form.date} onChange={e=>set('date',e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Poids total (kg)</label>
          <input type="number" className="form-input" placeholder="ex: 1250" value={form.poids} onChange={e=>set('poids',e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Categorie 1 — Export (kg)</label>
          <input type="number" className="form-input" placeholder="0" value={form.cat1} onChange={e=>set('cat1',e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Categorie 2 — Local (kg)</label>
          <input type="number" className="form-input" placeholder="0" value={form.cat2} onChange={e=>set('cat2',e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Observations</label>
        <textarea className="form-input" rows={2} placeholder="Qualite, conditions, remarques..." value={form.notes} onChange={e=>set('notes',e.target.value)} style={{ resize:'vertical' }} />
      </div>
      <div className="modal-footer">
        <button className="btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={save} disabled={!form.date || !form.poids}>
          Enregistrer la recolte
        </button>
      </div>
    </Modal>
  )
}

/* ── page dashboard ── */
export default function DashboardPage() {
  const [modal, setModal] = useState<string|null>(null)

  return (
    <div style={{ padding:'22px 26px', background:'#f4f9f4', minHeight:'100vh' }}>

      {/* Modales */}
      {modal==='recolte' && <ModalRecolte onClose={()=>setModal(null)} />}

      {/* Barre filtres */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', marginBottom:18, background:'#fff', border:'1px solid #cce5d4', borderRadius:10, boxShadow:'0 1px 3px rgba(27,58,45,0.05)' }}>
        <span style={{ fontSize:10, fontWeight:600, color:'#5a7a66', textTransform:'uppercase', letterSpacing:'.5px', marginRight:4 }}>Filtrer :</span>
        {[['Toutes les serres', ['S01 Nord A','S02 Nord B','S03 Sud A','S04 Sud B','S05 Est A']], ['Toutes varietes', ['Vitalia','Torero','Cherry Sun','Grappe','Brillante']], ['Mars 2026', ['Fev. 2026','Jan. 2026','Dec. 2025']]].map(([label, opts], i) => (
          <select key={i} className="form-input" style={{ width:'auto', padding:'5px 10px', fontSize:12 }}>
            <option>{label}</option>
            {(opts as string[]).map(o=><option key={o}>{o}</option>)}
          </select>
        ))}
        <button className="btn-primary" style={{ marginLeft:'auto' }} onClick={()=>setModal('recolte')}>
          + Saisir recolte
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:18 }}>
        {([
          { label:'Recolte cumulee',  val:'1 124', unit:'t',     sub:'61% de l\'objectif 1 850t', tag:'tag-green', color:'#2d6a4f', progress:61, icon:'🍅' },
          { label:'Rendement moyen',  val:'42.8',  unit:'kg/m²', sub:'+1.3% vs objectif',          tag:'tag-green', color:'#40916c', icon:'☀️' },
          { label:'Chiffre affaires', val:'3.01',  unit:'M MAD', sub:'+8.2% vs an dernier',         tag:'tag-green', color:'#e9c46a', icon:'💰' },
          { label:'Marge nette',      val:'38.4',  unit:'%',     sub:'Budget consomme a 68%',        tag:'tag-amber', color:'#f4a261', icon:'📊' },
        ] as any[]).map((k,i)=>(
          <div key={i} className="kpi-card" style={{ borderTop:`3px solid ${k.color}` }}>
            <div style={{ fontSize:18, marginBottom:8 }}>{k.icon}</div>
            <div style={{ fontSize:10, fontWeight:600, color:'#5a7a66', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:4 }}>{k.label}</div>
            <div style={{ fontFamily:'Syne,sans-serif', fontSize:26, fontWeight:800, lineHeight:1, marginBottom:6, color:'#1b3a2d' }}>
              {k.val}<span style={{ fontSize:13, fontWeight:500, color:'#5a7a66', marginLeft:3 }}>{k.unit}</span>
            </div>
            <span className={k.tag}>{k.sub}</span>
            {k.progress && <div style={{ height:4, background:'#e8f5ec', borderRadius:2, marginTop:10, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${k.progress}%`, background:k.color, borderRadius:2 }} />
            </div>}
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display:'grid', gridTemplateColumns:'1.55fr 1fr', gap:16, marginBottom:16 }}>
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <h3 style={{ fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:700, color:'#1b3a2d' }}>Production hebdomadaire (t)</h3>
            <Link href="/production" style={{ fontSize:11, color:'#40916c', fontWeight:600, textDecoration:'none' }}>Voir detail →</Link>
          </div>
          <ProductionChart />
        </div>
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <h3 style={{ fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:700, color:'#1b3a2d' }}>Serres actives</h3>
            <Link href="/serres" style={{ fontSize:11, color:'#40916c', fontWeight:600, textDecoration:'none' }}>Gerer →</Link>
          </div>
          {SERRES.map(s=>{
            const pct = s.th>0 ? Math.round(s.rend/s.th*100) : 0
            return (
              <div key={s.code} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #e8f5ec' }}>
                <div style={{ width:34, height:34, borderRadius:8, background:`${s.color}20`, color:s.color, fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, border:`1px solid ${s.color}40` }}>
                  {s.code}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12.5, fontWeight:600, color:'#1b3a2d' }}>{s.nom}</div>
                  <div style={{ fontSize:11, color:'#5a7a66', marginTop:1 }}>{s.var}</div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  {s.prep ? <span className="tag-amber">prep.</span>
                    : <><div style={{ fontSize:12.5, fontWeight:600, color: pct>=93 ? '#2d6a4f' : '#d97706' }}>{s.rend} kg/m²</div>
                        <div style={{ fontSize:10, color:'#5a7a66' }}>{pct}% obj.</div></>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Bas de page */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16 }}>
        <div className="card">
          <h3 style={{ fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:700, color:'#1b3a2d', marginBottom:14 }}>Debouches commerciaux</h3>
          <MarketPieChart />
        </div>
        <div className="card">
          <h3 style={{ fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:700, color:'#1b3a2d', marginBottom:14 }}>Marge par variete</h3>
          {VARS.map(v=>(
            <div key={v.nom} style={{ marginBottom:11 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12.5, marginBottom:4 }}>
                <span style={{ fontWeight:500, color:'#1b3a2d' }}>{v.nom}</span>
                <span style={{ color:v.color, fontWeight:700 }}>{v.pct}%</span>
              </div>
              <div style={{ height:7, background:'#e8f5ec', borderRadius:4, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${v.pct}%`, background:v.color, borderRadius:4 }} />
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <h3 style={{ fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:700, color:'#1b3a2d' }}>Alertes recentes</h3>
            <Link href="/alertes" style={{ fontSize:11, color:'#40916c', fontWeight:600, textDecoration:'none' }}>Voir tout →</Link>
          </div>
          {ALERTES.map((a,i)=>(
            <div key={i} style={{
              display:'flex', alignItems:'flex-start', gap:9,
              padding:'10px 12px', borderRadius:9, marginBottom:7,
              background: a.type==='err' ? '#fff1f1' : '#fffbec',
              border: `1px solid ${a.type==='err' ? '#fcc' : '#f0e0a0'}`,
            }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background: a.type==='err' ? '#e63946' : '#e9c46a', flexShrink:0, marginTop:4, display:'block' }} />
              <div>
                <div style={{ fontSize:12.5, fontWeight:600, color: a.type==='err' ? '#7a1010' : '#7a5500', marginBottom:2 }}>{a.titre}</div>
                <div style={{ fontSize:11.5, color: a.type==='err' ? '#9b3030' : '#8a6200', opacity:.85 }}>{a.msg}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
