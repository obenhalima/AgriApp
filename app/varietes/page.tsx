'use client'
import { useEffect, useState } from 'react'
import { getVarietes, createVariete, deleteVariete } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { genCode } from '@/lib/utils'

export default function VarietesPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({ code:'', commercial_name:'', type:'ronde', destination:'mixte', theoretical_yield_per_m2:'', theoretical_cost_per_m2:'', avg_price_local:'', avg_price_export:'', estimated_cycle_days:'', technical_notes:'' })
  const s = (k:string) => (e:any) => setForm(f=>({...f,[k]:e.target.value}))

  useEffect(()=>{ getVarietes().then(d=>{setItems(d);setLoading(false)}).catch(()=>setLoading(false)) },[])

  const openModal = () => {
    const codes = items.map(i=>i.code)
    setForm(f=>({...f, code:genCode('V',codes)}))
    setModal(true)
  }

  const save = async () => {
    if (!form.commercial_name) return
    setSaving(true)
    try {
      const n = await createVariete({ ...form, theoretical_yield_per_m2:Number(form.theoretical_yield_per_m2)||0, theoretical_cost_per_m2:Number(form.theoretical_cost_per_m2)||0, avg_price_local:Number(form.avg_price_local)||0, avg_price_export:Number(form.avg_price_export)||0, estimated_cycle_days:form.estimated_cycle_days?Number(form.estimated_cycle_days):undefined })
      setItems(p=>[n,...p]); setDone(true)
      setTimeout(()=>{ setModal(false); setDone(false) }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  const del = async (id:string,name:string) => {
    if(!confirm(`Archiver "${name}" ?`)) return
    await deleteVariete(id); setItems(p=>p.filter(i=>i.id!==id))
  }

  const DEST_COLORS: Record<string,string> = { export:'#f07050', local:'#00e87a', mixte:'#f5a623', grande_distribution:'#00b4d8', industrie:'#9b5de5' }

  return (
    <div style={{background:'#030a07',minHeight:'100vh'}}>
      {modal && (
        <Modal title="NOUVELLE VARIÉTÉ" onClose={()=>{setModal(false);setDone(false)}}>
          {done ? <SuccessMessage message="Variété créée !" /> : (<>
            <FormRow>
              <FormGroup label="Code (auto-généré)">
                <Input value={form.code} onChange={s('code')} />
              </FormGroup>
              <FormGroup label="Nom commercial *">
                <Input value={form.commercial_name} onChange={s('commercial_name')} placeholder="ex: Vitalia" autoFocus />
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Type">
                <Select value={form.type} onChange={s('type')}>{['ronde','grappe','cerise','allongee','cocktail','beef','olivette','autre'].map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}</Select>
              </FormGroup>
              <FormGroup label="Destination">
                <Select value={form.destination} onChange={s('destination')}>{['mixte','export','local','grande_distribution','industrie'].map(d=><option key={d} value={d}>{d.charAt(0).toUpperCase()+d.slice(1).replace('_',' ')}</option>)}</Select>
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Rendement théorique (kg/m²)"><Input type="number" value={form.theoretical_yield_per_m2} onChange={s('theoretical_yield_per_m2')} placeholder="45" /></FormGroup>
              <FormGroup label="Coût théorique (MAD/m²)"><Input type="number" value={form.theoretical_cost_per_m2} onChange={s('theoretical_cost_per_m2')} placeholder="120" /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Prix local (MAD/kg)"><Input type="number" value={form.avg_price_local} onChange={s('avg_price_local')} placeholder="3.50" /></FormGroup>
              <FormGroup label="Prix export (EUR/kg)"><Input type="number" value={form.avg_price_export} onChange={s('avg_price_export')} placeholder="0.60" /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Cycle estimé (jours)"><Input type="number" value={form.estimated_cycle_days} onChange={s('estimated_cycle_days')} placeholder="200" /></FormGroup>
              <FormGroup label=""><div /></FormGroup>
            </FormRow>
            <FormGroup label="Notes techniques"><Textarea rows={2} value={form.technical_notes} onChange={s('technical_notes')} /></FormGroup>
            <ModalFooter onCancel={()=>setModal(false)} onSave={save} loading={saving} disabled={!form.commercial_name} saveLabel="CRÉER LA VARIÉTÉ" />
          </>)}
        </Modal>
      )}

      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24}}>
        <div><div className="page-title">VARIÉTÉS</div><div className="page-sub">{items.length} variété(s) active(s)</div></div>
        <button className="btn-primary" onClick={openModal}>+ NEW VARIÉTÉ</button>
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:60,color:'#3d6b52',fontFamily:'DM Mono,monospace',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">✦</div>
          <div className="empty-title">Aucune variété</div>
          <div className="empty-sub">Ajoutez vos premières variétés de tomates.</div>
          <button className="btn-primary" onClick={openModal}>+ NEW VARIÉTÉ</button>
        </div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table className="tbl">
              <thead><tr>
                {['Code','Nom','Type','Destination','Rend. Th.','Coût/m²','Prix Local','Prix Export','Actions'].map(h=>(
                  <th key={h}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {items.map((v:any)=>{
                  const dc = DEST_COLORS[v.destination]||'#3d6b52'
                  return (
                    <tr key={v.id}>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#3d6b52'}}>{v.code}</span></td>
                      <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#e8f5ee'}}>{v.commercial_name}</span></td>
                      <td><span className="tag tag-blue">{v.type}</span></td>
                      <td><span className="tag" style={{background:`${dc}18`,color:dc,border:`1px solid ${dc}40`}}>{v.destination}</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#7aab90'}}>{v.theoretical_yield_per_m2||'—'} kg/m²</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#7aab90'}}>{v.theoretical_cost_per_m2||'—'} MAD</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#00e87a'}}>{v.avg_price_local||'—'} MAD</span></td>
                      <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#00ffc8'}}>{v.avg_price_export||'—'} EUR</span></td>
                      <td>
                        <button onClick={()=>del(v.id,v.commercial_name)} className="btn-danger" style={{fontSize:11,padding:'4px 9px'}}>🗑</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
