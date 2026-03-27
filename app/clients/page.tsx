'use client'
import { useEffect, useState } from 'react'
import { getClients, createClient_, deleteClient } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { genCode } from '@/lib/utils'

export default function ClientsPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalNew,  setModalNew]  = useState(false)
  const [modalEdit, setModalEdit] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [done,   setDone]   = useState(false)
  const [form,  setForm]  = useState({ code:'', name:'', type:'grossiste', city:'', country:'Maroc', email:'', phone:'', payment_terms_days:'30', credit_limit:'' })
  const [formE, setFormE] = useState<Record<string,any>>({})
  const s  = (k:string) => (e:any) => setForm(f=>({...f,[k]:e.target.value}))
  const se = (k:string) => (e:any) => setFormE(f=>({...f,[k]:e.target.value}))

  const load = () => getClients().then(d=>{setItems(d);setLoading(false)}).catch(()=>setLoading(false))
  useEffect(()=>{load()},[])

  const openNew = () => { setForm(f=>({...f, code:genCode('CL',items.map(i=>i.code))})); setModalNew(true) }
  const openEdit = (c:any) => {
    setFormE({code:c.code,name:c.name,type:c.type,city:c.city||'',country:c.country||'Maroc',
      email:c.email||'',phone:c.phone||'',payment_terms_days:String(c.payment_terms_days||30),credit_limit:String(c.credit_limit||'')})
    setModalEdit(c)
  }

  const save = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      const n = await createClient_({...form, payment_terms_days:Number(form.payment_terms_days)||30, credit_limit:Number(form.credit_limit)||undefined})
      setItems(p=>[n,...p]); setDone(true)
      setTimeout(()=>{setModalNew(false);setDone(false)},1400)
    } catch(e:any){alert('Erreur: '+e.message)}
    setSaving(false)
  }

  const saveEdit = async () => {
    if (!modalEdit||!formE.name) return
    setSaving(true)
    try {
      const { error } = await supabase.from('clients').update({
        code:formE.code, name:formE.name, type:formE.type, city:formE.city||null,
        country:formE.country||'Maroc', email:formE.email||null, phone:formE.phone||null,
        payment_terms_days:Number(formE.payment_terms_days)||30,
        credit_limit:formE.credit_limit?Number(formE.credit_limit):null,
      }).eq('id',modalEdit.id)
      if (error) throw error
      setDone(true)
      setTimeout(()=>{setModalEdit(null);setDone(false);load()},1400)
    } catch(e:any){alert('Erreur: '+e.message)}
    setSaving(false)
  }

  const TYPES = ['grossiste','exportateur','grande_surface','detail','industrie','institutionnel','autre']

  const CForm = ({vals, onChange}: any) => (<>
    <FormRow>
      <FormGroup label="Code"><Input value={vals.code} onChange={onChange('code')} /></FormGroup>
      <FormGroup label="Nom *"><Input value={vals.name} onChange={onChange('name')} placeholder="Nom société" autoFocus /></FormGroup>
    </FormRow>
    <FormRow>
      <FormGroup label="Type">
        <Select value={vals.type} onChange={onChange('type')}>{TYPES.map(t=><option key={t}>{t}</option>)}</Select>
      </FormGroup>
      <FormGroup label="Pays"><Input value={vals.country} onChange={onChange('country')} /></FormGroup>
    </FormRow>
    <FormRow>
      <FormGroup label="Ville"><Input value={vals.city} onChange={onChange('city')} placeholder="ex: Agadir" /></FormGroup>
      <FormGroup label="Téléphone"><Input value={vals.phone} onChange={onChange('phone')} placeholder="+212..." /></FormGroup>
    </FormRow>
    <FormRow>
      <FormGroup label="Email"><Input type="email" value={vals.email} onChange={onChange('email')} /></FormGroup>
      <FormGroup label="Délai paiement (j)"><Input type="number" value={vals.payment_terms_days} onChange={onChange('payment_terms_days')} /></FormGroup>
    </FormRow>
    <FormGroup label="Plafond crédit (MAD)"><Input type="number" value={vals.credit_limit} onChange={onChange('credit_limit')} placeholder="optionnel" /></FormGroup>
  </>)

  return (
    <div style={{background:'#030a07',minHeight:'100vh'}}>
      {modalNew && (
        <Modal title="NOUVEAU CLIENT" onClose={()=>{setModalNew(false);setDone(false)}}>
          {done ? <SuccessMessage message="Client créé !" /> : (<>
            <CForm vals={form} onChange={s} />
            <ModalFooter onCancel={()=>setModalNew(false)} onSave={save} loading={saving} disabled={!form.name} saveLabel="CRÉER LE CLIENT" />
          </>)}
        </Modal>
      )}
      {modalEdit && (
        <Modal title={`MODIFIER — ${modalEdit.name}`} onClose={()=>{setModalEdit(null);setDone(false)}}>
          {done ? <SuccessMessage message="Client modifié !" /> : (<>
            <CForm vals={formE} onChange={se} />
            <ModalFooter onCancel={()=>setModalEdit(null)} onSave={saveEdit} loading={saving} disabled={!formE.name} saveLabel="ENREGISTRER" />
          </>)}
        </Modal>
      )}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24}}>
        <div><div className="page-title">CLIENTS</div><div className="page-sub">{items.length} client(s)</div></div>
        <button className="btn-primary" onClick={openNew}>+ NEW CLIENT</button>
      </div>
      {loading ? <div style={{textAlign:'center',padding:60,color:'#3d6b52',fontFamily:'DM Mono,monospace',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>
      : items.length===0 ? (
        <div className="empty-state"><div className="empty-icon">👥</div><div className="empty-title">Aucun client</div><button className="btn-primary" onClick={openNew}>+ NEW CLIENT</button></div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table className="tbl">
              <thead><tr>{['Code','Nom','Type','Ville','Pays','Email','Tél.','Délai pmt','Actions'].map(h=><th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {items.map((c:any)=>(
                  <tr key={c.id}>
                    <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52'}}>{c.code}</span></td>
                    <td><span style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:600,color:'#e8f5ee'}}>{c.name}</span></td>
                    <td><span className="tag tag-blue" style={{fontSize:9}}>{c.type}</span></td>
                    <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{c.city||'—'}</span></td>
                    <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{c.country||'—'}</span></td>
                    <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{c.email||'—'}</span></td>
                    <td><span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{c.phone||'—'}</span></td>
                    <td><span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#f5a623'}}>{c.payment_terms_days} j</span></td>
                    <td>
                      <div style={{display:'flex',gap:5}}>
                        <button onClick={()=>openEdit(c)} className="btn-ghost" style={{padding:'4px 8px',fontSize:10}}>✏️</button>
                        <button onClick={()=>{if(!confirm(`Désactiver "${c.name}" ?`))return;deleteClient(c.id);setItems(p=>p.filter(i=>i.id!==c.id))}} className="btn-danger" style={{padding:'4px 8px',fontSize:10}}>🗑</button>
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
