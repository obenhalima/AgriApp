'use client'
import { useEffect, useState } from 'react'
import { getFournisseurs, createFournisseur } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { genCode } from '@/lib/utils'

const CATS = ['semences','engrais','phytosanitaires','irrigation','emballage','transport','energie','services','equipement','autre']

export default function FournisseursPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalNew,  setModalNew]  = useState(false)
  const [modalEdit, setModalEdit] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [done,   setDone]   = useState(false)
  const [form,  setForm]  = useState({ code:'', name:'', category:'semences', city:'', email:'', phone:'', payment_terms_days:'30', notes:'' })
  const [formE, setFormE] = useState<Record<string,any>>({})
  const s  = (k:string) => (e:any) => setForm(f=>({...f,[k]:e.target.value}))
  const se = (k:string) => (e:any) => setFormE(f=>({...f,[k]:e.target.value}))

  const load = () => getFournisseurs().then(d=>{setItems(d);setLoading(false)}).catch(()=>setLoading(false))
  useEffect(()=>{load()},[])

  const openNew = () => { setForm(f=>({...f,code:genCode('F',items.map(i=>i.code))})); setModalNew(true) }
  const openEdit = (f:any) => {
    setFormE({code:f.code,name:f.name,category:f.category,city:f.city||'',email:f.email||'',phone:f.phone||'',payment_terms_days:String(f.payment_terms_days||30),notes:f.notes||''})
    setModalEdit(f)
  }

  const save = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      const n = await createFournisseur({...form, payment_terms_days:Number(form.payment_terms_days)||30})
      setItems(p=>[n,...p]); setDone(true)
      setTimeout(()=>{setModalNew(false);setDone(false)},1400)
    } catch(e:any){alert('Erreur: '+e.message)}
    setSaving(false)
  }

  const saveEdit = async () => {
    if (!modalEdit||!formE.name) return
    setSaving(true)
    try {
      const { error } = await supabase.from('suppliers').update({
        code:formE.code, name:formE.name, category:formE.category, city:formE.city||null,
        email:formE.email||null, phone:formE.phone||null,
        payment_terms_days:Number(formE.payment_terms_days)||30, notes:formE.notes||null
      }).eq('id',modalEdit.id)
      if (error) throw error
      setDone(true)
      setTimeout(()=>{setModalEdit(null);setDone(false);load()},1400)
    } catch(e:any){alert('Erreur: '+e.message)}
    setSaving(false)
  }

  const FForm = ({vals, onChange}: any) => (<>
    <FormRow>
      <FormGroup label="Code"><Input value={vals.code} onChange={onChange('code')} /></FormGroup>
      <FormGroup label="Nom *"><Input value={vals.name} onChange={onChange('name')} placeholder="Nom fournisseur" autoFocus /></FormGroup>
    </FormRow>
    <FormRow>
      <FormGroup label="Catégorie">
        <Select value={vals.category} onChange={onChange('category')}>{CATS.map(c=><option key={c}>{c}</option>)}</Select>
      </FormGroup>
      <FormGroup label="Ville"><Input value={vals.city} onChange={onChange('city')} placeholder="ex: Casablanca" /></FormGroup>
    </FormRow>
    <FormRow>
      <FormGroup label="Email"><Input type="email" value={vals.email} onChange={onChange('email')} /></FormGroup>
      <FormGroup label="Téléphone"><Input value={vals.phone} onChange={onChange('phone')} /></FormGroup>
    </FormRow>
    <FormGroup label="Délai paiement (jours)"><Input type="number" value={vals.payment_terms_days} onChange={onChange('payment_terms_days')} /></FormGroup>
    <FormGroup label="Notes"><Textarea rows={2} value={vals.notes} onChange={onChange('notes')} /></FormGroup>
  </>)

  return (
    <div style={{background:'var(--bg-deep)',minHeight:'100vh'}}>
      {modalNew && (
        <Modal title="NOUVEAU FOURNISSEUR" onClose={()=>{setModalNew(false);setDone(false)}}>
          {done ? <SuccessMessage message="Fournisseur créé !" /> : (<>
            <FForm vals={form} onChange={s} />
            <ModalFooter onCancel={()=>setModalNew(false)} onSave={save} loading={saving} disabled={!form.name} saveLabel="CRÉER" />
          </>)}
        </Modal>
      )}
      {modalEdit && (
        <Modal title={`MODIFIER — ${modalEdit.name}`} onClose={()=>{setModalEdit(null);setDone(false)}}>
          {done ? <SuccessMessage message="Fournisseur modifié !" /> : (<>
            <FForm vals={formE} onChange={se} />
            <ModalFooter onCancel={()=>setModalEdit(null)} onSave={saveEdit} loading={saving} disabled={!formE.name} saveLabel="ENREGISTRER" />
          </>)}
        </Modal>
      )}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24}}>
        <div><div className="page-title">FOURNISSEURS</div><div className="page-sub">{items.length} fournisseur(s)</div></div>
        <button className="btn-primary" onClick={openNew}>+ NEW FOURNISSEUR</button>
      </div>
      {loading ? <div style={{textAlign:'center',padding:60,color:'var(--tx-3)',fontFamily:'var(--font-mono)',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>
      : items.length===0 ? (
        <div className="empty-state"><div className="empty-icon">🏭</div><div className="empty-title">Aucun fournisseur</div><button className="btn-primary" onClick={openNew}>+ NEW FOURNISSEUR</button></div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table className="tbl">
              <thead><tr>{['Code','Nom','Catégorie','Ville','Email','Tél.','Délai pmt','Actions'].map(h=><th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {items.map((f:any)=>(
                  <tr key={f.id}>
                    <td><span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--tx-3)'}}>{f.code}</span></td>
                    <td><span style={{fontFamily:'var(--font-display)',fontSize:13,fontWeight:600,color:'var(--tx-1)'}}>{f.name}</span></td>
                    <td><span className="tag tag-amber" style={{fontSize:9}}>{f.category}</span></td>
                    <td><span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--tx-2)'}}>{f.city||'—'}</span></td>
                    <td><span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--tx-2)'}}>{f.email||'—'}</span></td>
                    <td><span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--tx-2)'}}>{f.phone||'—'}</span></td>
                    <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--mbe)'}}>{f.payment_terms_days} j</span></td>
                    <td>
                      <div style={{display:'flex',gap:5}}>
                        <button onClick={()=>openEdit(f)} className="btn-ghost" style={{padding:'4px 8px',fontSize:10}}>✏️</button>
                        <button onClick={()=>{if(!confirm(`Désactiver "${f.name}" ?`))return;supabase.from('suppliers').update({is_active:false}).eq('id',f.id);setItems(p=>p.filter(i=>i.id!==f.id))}} className="btn-danger" style={{padding:'4px 8px',fontSize:10}}>🗑</button>
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
