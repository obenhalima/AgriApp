'use client'
import { useEffect, useState } from 'react'
import { getVarietes, createVariete, deleteVariete } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

export default function VarietesPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({ code:'', commercial_name:'', type:'ronde', destination:'mixte', theoretical_yield_per_m2:'', theoretical_cost_per_m2:'', avg_price_local:'', avg_price_export:'', estimated_cycle_days:'', technical_notes:'' })
  const s = (k:string) => (e:any) => setForm(f=>({...f,[k]:e.target.value}))

  useEffect(() => { getVarietes().then(d=>{setItems(d);setLoading(false)}).catch(()=>setLoading(false)) }, [])

  const save = async () => {
    if (!form.code||!form.commercial_name) return
    setSaving(true)
    try {
      const n = await createVariete({ ...form, theoretical_yield_per_m2:Number(form.theoretical_yield_per_m2)||0, theoretical_cost_per_m2:Number(form.theoretical_cost_per_m2)||0, avg_price_local:Number(form.avg_price_local)||0, avg_price_export:Number(form.avg_price_export)||0, estimated_cycle_days:Number(form.estimated_cycle_days)||undefined })
      setItems(p=>[n,...p]); setDone(true)
      setTimeout(()=>{setModal(false);setDone(false);setForm({code:'',commercial_name:'',type:'ronde',destination:'mixte',theoretical_yield_per_m2:'',theoretical_cost_per_m2:'',avg_price_local:'',avg_price_export:'',estimated_cycle_days:'',technical_notes:''})},1400)
    } catch(e:any){alert('Erreur: '+e.message)}
    setSaving(false)
  }

  const del = async (id:string,name:string) => {
    if(!confirm(`Archiver "${name}" ?`)) return
    await deleteVariete(id); setItems(p=>p.filter(i=>i.id!==id))
  }

  const DEST: Record<string,string> = { export:'#3d1a0d|#f07050', local:'#1a4a24|#3fb950', mixte:'#3d2e0a|#d29922', grande_distribution:'#0d2149|#388bfd', industrie:'#2d1a4a|#a371f7' }
  const destStyle = (d:string) => { const [bg,color]=(DEST[d]||'#f4f9f4|#5a7a66').split('|'); return {background:bg,color,padding:'2px 8px',borderRadius:10,fontSize:10,fontWeight:600,display:'inline-block'} }

  return (
    <div style={{padding:'22px 26px',background:'#f4f9f4',minHeight:'100vh'}}>
      {modal && (
        <Modal title="Nouvelle variété" onClose={()=>{setModal(false);setDone(false)}}>
          {done ? <SuccessMessage message="Variété créée !" /> : (<>
            <FormRow>
              <FormGroup label="Code *"><Input value={form.code} onChange={s('code')} placeholder="ex: V001" /></FormGroup>
              <FormGroup label="Nom commercial *"><Input value={form.commercial_name} onChange={s('commercial_name')} placeholder="ex: Vitalia" /></FormGroup>
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
              <FormGroup label="Rendement théorique (kg/m²)"><Input type="number" value={form.theoretical_yield_per_m2} onChange={s('theoretical_yield_per_m2')} placeholder="ex: 45" /></FormGroup>
              <FormGroup label="Coût théorique (MAD/m²)"><Input type="number" value={form.theoretical_cost_per_m2} onChange={s('theoretical_cost_per_m2')} placeholder="ex: 120" /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Prix local moyen (MAD/kg)"><Input type="number" value={form.avg_price_local} onChange={s('avg_price_local')} placeholder="ex: 3.50" /></FormGroup>
              <FormGroup label="Prix export moyen (EUR/kg)"><Input type="number" value={form.avg_price_export} onChange={s('avg_price_export')} placeholder="ex: 0.60" /></FormGroup>
            </FormRow>
            <FormGroup label="Cycle estimé (jours)"><Input type="number" value={form.estimated_cycle_days} onChange={s('estimated_cycle_days')} placeholder="ex: 200" /></FormGroup>
            <FormGroup label="Notes techniques"><Textarea rows={2} value={form.technical_notes} onChange={s('technical_notes')} /></FormGroup>
            <ModalFooter onCancel={()=>setModal(false)} onSave={save} loading={saving} disabled={!form.code||!form.commercial_name} saveLabel="Créer la variété" />
          </>)}
        </Modal>
      )}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
        <div><h2 style={{fontFamily:'Syne,sans-serif',fontSize:20,fontWeight:700,color:'#1b3a2d',marginBottom:4}}>Référentiel Variétés</h2><p style={{fontSize:13,color:'#5a7a66'}}>{items.length} variété(s)</p></div>
        <button onClick={()=>setModal(true)} style={{padding:'8px 16px',borderRadius:8,border:'none',background:'#2d6a4f',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Nouvelle variété</button>
      </div>
      {loading ? <div style={{textAlign:'center',padding:60,color:'#5a7a66'}}>Chargement...</div>
      : items.length===0 ? (
        <div style={{textAlign:'center',padding:60,background:'#fff',border:'1px solid #cce5d4',borderRadius:12}}>
          <div style={{fontSize:40,marginBottom:12}}>🌱</div>
          <div style={{fontFamily:'Syne,sans-serif',fontSize:16,fontWeight:700,color:'#1b3a2d',marginBottom:8}}>Aucune variété enregistrée</div>
          <button onClick={()=>setModal(true)} style={{padding:'9px 20px',borderRadius:8,border:'none',background:'#2d6a4f',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Nouvelle variété</button>
        </div>
      ) : (
        <div style={{background:'#fff',border:'1px solid #cce5d4',borderRadius:12,overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>{['Code','Variété','Type','Destination','Rend. Th.','Coût/m²','Prix Local','Prix Export','Actions'].map(h=><th key={h} style={{padding:'10px 14px',fontSize:10.5,fontWeight:600,color:'#5a7a66',textTransform:'uppercase',letterSpacing:'.5px',borderBottom:'1px solid #e8f5ec',textAlign:'left',background:'#f9fdf9',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
              <tbody>
                {items.map((v:any)=>(
                  <tr key={v.id} style={{borderBottom:'1px solid #e8f5ec'}}>
                    <td style={{padding:'11px 14px',fontFamily:'monospace',fontSize:12,color:'#5a7a66'}}>{v.code}</td>
                    <td style={{padding:'11px 14px',fontWeight:600,color:'#1b3a2d'}}>{v.commercial_name}</td>
                    <td style={{padding:'11px 14px'}}><span style={{background:'#dbeafe',color:'#1e3a8a',padding:'2px 8px',borderRadius:10,fontSize:10,fontWeight:600}}>{v.type}</span></td>
                    <td style={{padding:'11px 14px'}}><span style={destStyle(v.destination)}>{v.destination}</span></td>
                    <td style={{padding:'11px 14px',fontFamily:'monospace',fontSize:12}}>{v.theoretical_yield_per_m2} kg/m²</td>
                    <td style={{padding:'11px 14px',fontFamily:'monospace',fontSize:12}}>{v.theoretical_cost_per_m2} MAD</td>
                    <td style={{padding:'11px 14px',fontFamily:'monospace',fontSize:12}}>{v.avg_price_local} MAD</td>
                    <td style={{padding:'11px 14px',fontFamily:'monospace',fontSize:12}}>{v.avg_price_export} EUR</td>
                    <td style={{padding:'11px 14px'}}>
                      <div style={{display:'flex',gap:5}}>
                        <button style={{padding:'4px 10px',borderRadius:6,border:'1px solid #fcc',background:'#fff1f1',color:'#9b1d1d',fontSize:11,cursor:'pointer'}} onClick={()=>del(v.id,v.commercial_name)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
