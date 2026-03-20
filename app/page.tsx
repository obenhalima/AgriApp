'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ProductionChart } from '@/components/dashboard/ProductionChart'
import { CostChart, MarketPieChart } from '@/components/dashboard/CostChart'

const SERRES = [
  { code:'S01', nom:'Nord A', var:'Vitalia, Torero', rend:44.2, th:47, color:'#40916c' },
  { code:'S02', nom:'Nord B', var:'Torero', rend:48.8, th:50, color:'#2d6a4f' },
  { code:'S03', nom:'Sud A', var:'Grappe Premium', rend:38.5, th:40, color:'#74c69d' },
  { code:'S04', nom:'Sud B', var:'Cherry Sun', rend:33.2, th:35, color:'#e9c46a' },
  { code:'S05', nom:'Est A', var:'Vitalia', rend:43.0, th:45, color:'#f4a261' },
  { code:'S06', nom:'Est B', var:'-', rend:0, th:0, color:'#aaa', prep:true } as any,
]

const VARS = [
  { nom:'Cherry Sun', pct:61, color:'#74c69d' },
  { nom:'Grappe Premium', pct:55, color:'#40916c' },
  { nom:'Brillante', pct:52, color:'#2d6a4f' },
  { nom:'Torero', pct:48, color:'#e9c46a' },
  { nom:'Vitalia', pct:42, color:'#f4a261' },
]

const ALERTES = [
  { type:'err', titre:'Facture en retard', msg:'Carrefour - FV-2026-0086 - 41 000 MAD' },
  { type:'warn', titre:'Stock critique', msg:'Filets 1kg cerise - 4 800 / 5 000 min' },
  { type:'warn', titre:'Budget engrais depasse', msg:'412k vs 380k prevu (+8.4%)' },
]

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

function ModalRecolte({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ serre:'S01', variete:'Vitalia', date:'', cat1:'', cat2:'', cat3:'', poids:'', notes:'' })
  const [saved, setSaved] = useState(false)
  const handle = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const submit = () => { setSaved(true); setTimeout(onClose, 1200) }
  return (
    <Modal title="Saisir une recolte" onClose={onClose}>
      {saved ? (
        <div style={{ textAlign:'center', padding:'20px 0' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>ok</div>
          <div style={{ color:'var(--leaf)', fontWeight:600 }}>Recolte enregistree !</div>
        </div>
      ) : (
        <>
          <div className="form-row" style={{ marginBottom:14 }}>
            <div>
              <label className="form-label">Serre</label>
              <select className="form-input" value={form.serre} onChange={e => handle('serre', e.target.value)}>
                {SERRES.filter(s => !s.prep).map(s => <option key={s.code} value={s.code}>{s.code} - {s.nom}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Variete</label>
              <select className="form-input" value={form.variete} onChange={e => handle('variete', e.target.value)}>
                {VARS.map(v => <option key={v.nom}>{v.nom}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row" style={{ marginBottom:14 }}>
            <div>
              <label className="form-label">Date de recolte</label>
              <input type="date" className="form-input" value={form.date} onChange={e => handle('date', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Poids total (kg)</label>
              <input type="number" className="form-input" placeholder="0" value={form.poids} onChange={e => handle('poids', e.target.value)} />
            </div>
          </div>
          <div className="form-row" style={{ marginBottom:14 }}>
            <div>
              <label className="form-label">Cat. 1 - Export (kg)</label>
              <input type="number" className="form-input" placeholder="0" value={form.cat1} onChange={e => handle('cat1', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Cat. 2 - Local (kg)</label>
              <input type="number" className="form-input" placeholder="0" value={form.cat2} onChange={e => handle('cat2', e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom:14 }}>
            <label className="form-label">Observations</label>
            <textarea className="form-input" rows={2} placeholder="Notes qualite, conditions..." value={form.notes} onChange={e => handle('notes', e.target.value)} />
          </div>
          <div className="modal-footer" style={{ padding:0, border:'none', marginTop:4 }}>
            <button className="btn-ghost" onClick={onClose}>Annuler</button>
            <button className="btn-primary" onClick={submit} disabled={!form.date || !form.poids}>
              Enregistrer la recolte
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

export default function DashboardPage() {
  const [modal, setModal] = useState<string | null>(null)

  return (
    <div style={{ padding:'20px 24px' }}>

      {/* Modal recolte */}
      {modal === 'recolte' && <ModalRecolte onClose={() => setModal(null)} />}

      {/* Filtres */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', marginBottom:18, background:'#fff', border:'1px solid var(--border)', borderRadius:10 }}>
        <span style={{ fontSize:10, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.5px' }}>Filtrer :</span>
        {['Toutes les serres','Toutes les varietes','Mars 2026'].map((opt, i) => (
          <select key={i} className="form-input" style={{ width:'auto', padding:'4px 8px', fontSize:11.5 }}>
            <option>{opt}</option>
          </select>
        ))}
        <button onClick={() => setModal('recolte')} className="btn-primary" style={{ marginLeft:'auto', fontSize:12, padding:'6px 14px' }}>
          + Saisir recolte
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label:'Recolte cumulee', val:'1 124', unit:'t', tag:'tag-green', tagTxt:'61% objectif', color:'#2d6a4f', progress:61, icon:'🍅' },
          { label:'Rendement moyen', val:'42.8', unit:'kg/m', tag:'tag-green', tagTxt:'+1.3% vs objectif', color:'#40916c', icon:'☀️' },
          { label:'Chiffre affaires', val:'3.01', unit:'M MAD', tag:'tag-green', tagTxt:'+8.2% an dernier', color:'#e9c46a', icon:'💰' },
          { label:'Marge nette', val:'38.4', unit:'%', tag:'tag-amber', tagTxt:'Budget 68% consomme', color:'#f4a261', icon:'📊' },
        ].map((k, i) => (
          <div key={i} className="kpi-card" style={{ borderTop:`3px solid ${k.color}` }}>
            <div style={{ fontSize:17, marginBottom:8 }}>{k.icon}</div>
            <div style={{ fontSize:10, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:4 }}>{k.label}</div>
            <div style={{ fontFamily:'Syne,sans-serif', fontSize:24, fontWeight:800, lineHeight:1, marginBottom:6 }}>
              {k.val} <span style={{ fontSize:12, fontWeight:500, color:'var(--muted)' }}>{k.unit}</span>
            </div>
            <span className={k.tag}>{k.tagTxt}</span>
            {k.progress && (
              <div style={{ height:4, background:'var(--border)', borderRadius:2, marginTop:8, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${k.progress}%`, background:k.color, borderRadius:2 }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-4 mb-4" style={{ gridTemplateColumns:'1.5fr 1fr' }}>
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 style={{ fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:700 }}>Production hebdomadaire (t)</h3>
            <Link href="/production" style={{ fontSize:11, color:'var(--leaf2)', fontWeight:500 }}>Detail</Link>
          </div>
          <ProductionChart />
        </div>
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 style={{ fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:700 }}>Serres actives</h3>
            <Link href="/serres" style={{ fontSize:11, color:'var(--leaf2)', fontWeight:500 }}>Gerer</Link>
          </div>
          {SERRES.map(s => {
            const pct = s.th > 0 ? Math.round(s.rend / s.th * 100) : 0
            return (
              <div key={s.code} className="flex items-center gap-2.5 py-2" style={{ borderBottom:'1px solid var(--border)' }}>
                <div style={{ width:34, height:34, borderRadius:8, background:`${s.color}22`, color:s.color, fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {s.code}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12.5, fontWeight:600 }}>{s.nom}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>{s.var}</div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  {s.prep
                    ? <span className="tag-amber">prep.</span>
                    : <><div style={{ fontSize:12, fontWeight:600, color: pct>=93 ? '#2d6a4f' : '#c07a00' }}>{s.rend} kg/m</div>
                        <div style={{ fontSize:10, color:'var(--muted)' }}>{pct}% obj.</div></>
                  }
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Bottom */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card">
          <h3 style={{ fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:700, marginBottom:14 }}>Debouches commerciaux</h3>
          <MarketPieChart />
        </div>
        <div className="card">
          <h3 style={{ fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:700, marginBottom:14 }}>Marge par variete</h3>
          {VARS.map(v => (
            <div key={v.nom} style={{ marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}>
                <span style={{ fontWeight:500 }}>{v.nom}</span>
                <span style={{ color:v.color, fontWeight:600 }}>{v.pct}%</span>
              </div>
              <div style={{ height:6, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${v.pct}%`, background:v.color, borderRadius:3 }} />
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <h3 style={{ fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:700 }}>Alertes recentes</h3>
            <Link href="/alertes" style={{ fontSize:11, color:'var(--leaf2)', fontWeight:500 }}>Voir tout</Link>
          </div>
          {ALERTES.map((a, i) => (
            <div key={i} style={{
              display:'flex', alignItems:'flex-start', gap:8,
              padding:'9px 11px', borderRadius:8, marginBottom:6, fontSize:12,
              background: a.type==='err' ? '#fff1f1' : '#fffaed',
              border: `1px solid ${a.type==='err' ? '#fcc' : '#f0e0a0'}`,
              color: a.type==='err' ? '#7a1010' : '#7a5500',
            }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background: a.type==='err' ? '#e63946' : '#e9c46a', flexShrink:0, marginTop:3, display:'block' }} />
              <div>
                <div style={{ fontWeight:600, marginBottom:1 }}>{a.titre}</div>
                <div style={{ opacity:.8, fontSize:11 }}>{a.msg}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
