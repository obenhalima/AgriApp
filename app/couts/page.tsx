'use client'
import { useEffect, useState } from 'react'
import { getCouts, createCout, getCampagnes, getSerres } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

const CATS = ['semences','plants','substrat','engrais','phytosanitaires','irrigation','energie','main_oeuvre','emballage','transport','frais_export','maintenance','location','amortissement','divers']

export default function CoutsPage() {
  const [items, setItems] = useState<any[]>([])
  const [campagnes, setCampagnes] = useState<any[]>([])
  const [serres, setSerres] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({ campaign_id:'', greenhouse_id:'', cost_category:'engrais', amount:'', entry_date:'', description:'', is_planned:'false' })
  const s = (k:string) => (e:any) => setForm(f=>({...f,[k]:e.target.value}))

  useEffect(() => {
    Promise.all([getCouts(), getCampagnes(), getSerres()])
      .then(([c,camp,s])=>{setItems(c);setCampagnes(camp);setSerres(s);setLoading(false)})
      .catch(()=>setLoading(false))
  }, [])

  const save = async () => {
    if (!form.campaign_id||!form.amount||!form.entry_date) return
    setSaving(true)
    try {
      const n = await createCout({ ...form, amount:Number(form.amount), is_planned:form.is_planned==='true', greenhouse_id:form.greenhouse_id||undefined })
      setItems(p=>[n,...p]); setDone(true)
      setTimeout(()=>{setModal(false);setDone(false);setForm({campaign_id:'',greenhouse_id:'',cost_category:'engrais',amount:'',entry_date:'',description:'',is_planned:'false'})},1400)
    } catch(e:any){alert('Erreur: '+e.message)}
    setSaving(false)
  }

  const totalReel = items.filter(i=>!i.is_planned).reduce((s,i)=>s+(i.amount||0),0)
  const totalPrev = items.filter(i=>i.is_planned).reduce((s,i)=>s+(i.amount||0),0)

  return (
    <div style={{padding:'22px 26px',background:'#f4f9f4',minHeight:'100vh'}}>
      {modal && (
        <Modal title="Saisir un coût" onClose={()=>{setModal(false);setDone(false)}}>
          {done ? <SuccessMessage message="Coût enregistré !" /> : (<>
            <FormRow>
              <FormGroup label="Campagne *">
                <Select value={form.campaign_id} onChange={s('campaign_id')}>
                  <option value="">-- Sélectionner --</option>
                  {campagnes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Serre (optionnel)">
                <Select value={form.greenhouse_id} onChange={s('greenhouse_id')}>
                  <option value="">Toutes serres</option>
                  {serres.map(s=><option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
                </Select>
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Catégorie">
                <Select value={form.cost_category} onChange={s('cost_category')}>{CATS.map(c=><option key={c} value={c}>{c.replace('_',' ').charAt(0).toUpperCase()+c.replace('_',' ').slice(1)}</option>)}</Select>
              </FormGroup>
              <FormGroup label="Type">
                <Select value={form.is_planned} onChange={s('is_planned')}>
                  <option value="false">Réel (décaissement)</option>
                  <option value="true">Prévisionnel (budget)</option>
                </Select>
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Montant (MAD) *"><Input type="number" value={form.amount} onChange={s('amount')} placeholder="ex: 15000" /></FormGroup>
              <FormGroup label="Date *"><Input type="date" value={form.entry_date} onChange={s('entry_date')} /></FormGroup>
            </FormRow>
            <FormGroup label="Description"><Input value={form.description} onChange={s('description')} placeholder="ex: Achat NPK 20-20-20 — 500 kg" /></FormGroup>
            <ModalFooter onCancel={()=>setModal(false)} onSave={save} loading={saving} disabled={!form.campaign_id||!form.amount||!form.entry_date} saveLabel="Enregistrer" />
          </>)}
        </Modal>
      )}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16}}>
        <div><h2 style={{fontFamily:'Syne,sans-serif',fontSize:20,fontWeight:700,color:'#1b3a2d',marginBottom:4}}>Coûts & Budget</h2><p style={{fontSize:13,color:'#5a7a66'}}>{items.length} entrée(s) comptabilisée(s)</p></div>
        <button onClick={()=>setModal(true)} style={{padding:'8px 16px',borderRadius:8,border:'none',background:'#2d6a4f',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Saisir un coût</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:18}}>
        {[{l:'Coûts réels',v:`${(totalReel/1000).toFixed(0)} k MAD`,c:'#e05c3b'},{l:'Budget prévu',v:`${(totalPrev/1000).toFixed(0)} k MAD`,c:'#388bfd'},{l:'Entrées totales',v:String(items.length),c:'#2d6a4f'}].map((k,i)=>(
          <div key={i} style={{background:'#fff',border:'1px solid #cce5d4',borderRadius:12,padding:'14px 16px',borderTop:`3px solid ${k.c}`}}>
            <div style={{fontSize:10,fontWeight:600,color:'#5a7a66',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:4}}>{k.l}</div>
            <div style={{fontFamily:'Syne,sans-serif',fontSize:22,fontWeight:800,color:'#1b3a2d'}}>{k.v}</div>
          </div>
        ))}
      </div>
      {loading ? <div style={{textAlign:'center',padding:60,color:'#5a7a66'}}>Chargement...</div>
      : items.length===0 ? (
        <div style={{textAlign:'center',padding:60,background:'#fff',border:'1px solid #cce5d4',borderRadius:12}}>
          <div style={{fontSize:40,marginBottom:12}}>💰</div>
          <div style={{fontFamily:'Syne,sans-serif',fontSize:16,fontWeight:700,color:'#1b3a2d',marginBottom:8}}>Aucun coût saisi</div>
          <button onClick={()=>setModal(true)} style={{padding:'9px 20px',borderRadius:8,border:'none',background:'#2d6a4f',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Saisir un coût</button>
        </div>
      ) : (
        <div style={{background:'#fff',border:'1px solid #cce5d4',borderRadius:12,overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>{['Date','Catégorie','Campagne','Serre','Montant (MAD)','Type','Description'].map(h=><th key={h} style={{padding:'10px 14px',fontSize:10.5,fontWeight:600,color:'#5a7a66',textTransform:'uppercase',letterSpacing:'.5px',borderBottom:'1px solid #e8f5ec',textAlign:'left',background:'#f9fdf9',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
              <tbody>
                {items.map((c:any)=>(
                  <tr key={c.id} style={{borderBottom:'1px solid #e8f5ec'}}>
                    <td style={{padding:'11px 14px',color:'#5a7a66',fontSize:12}}>{c.entry_date}</td>
                    <td style={{padding:'11px 14px'}}><span style={{background:'#fef3c7',color:'#92400e',padding:'2px 8px',borderRadius:10,fontSize:10,fontWeight:600}}>{c.cost_category?.replace('_',' ')}</span></td>
                    <td style={{padding:'11px 14px',color:'#5a7a66',fontSize:12}}>{c.campaigns?.name||'—'}</td>
                    <td style={{padding:'11px 14px',color:'#5a7a66',fontSize:12}}>{c.greenhouses?.code||'—'}</td>
                    <td style={{padding:'11px 14px',fontFamily:'monospace',fontSize:12,fontWeight:600,color:'#1b3a2d'}}>{c.amount?.toLocaleString('fr')} MAD</td>
                    <td style={{padding:'11px 14px'}}><span style={{background:c.is_planned?'#dbeafe':'#d8f3dc',color:c.is_planned?'#1e3a8a':'#1b4332',padding:'2px 8px',borderRadius:10,fontSize:10,fontWeight:600}}>{c.is_planned?'Prévu':'Réel'}</span></td>
                    <td style={{padding:'11px 14px',color:'#5a7a66',fontSize:12,maxWidth:200}}>{c.description||'—'}</td>
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
