'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getFarms } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { genCode } from '@/lib/utils'

export default function FermesPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({
    code:'', name:'', address:'', city:'', region:'', country:'Maroc',
    total_area:'', manager_name:'', notes:''
  })
  const s = (k:string) => (e:any) => setForm(f=>({...f,[k]:e.target.value}))

  const load = () => getFarms().then(d=>{setItems(d);setLoading(false)}).catch(()=>setLoading(false))
  useEffect(()=>{ load() },[])

  const openModal = () => {
    // Auto-générer le code
    const codes = items.map(i=>i.code)
    setForm(f=>({...f, code: genCode('F', codes)}))
    setModal(true)
  }

  const save = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      const { data, error } = await supabase.from('farms').insert({
        code: form.code,
        name: form.name,
        address: form.address,
        city: form.city,
        region: form.region,
        country: form.country || 'Maroc',
        total_area: form.total_area ? Number(form.total_area) : null,
        notes: form.notes,
        is_active: true,
      }).select().single()
      if (error) throw error
      setItems(p=>[data,...p])
      setDone(true)
      setTimeout(()=>{ setModal(false); setDone(false); setForm({code:'',name:'',address:'',city:'',region:'',country:'Maroc',total_area:'',manager_name:'',notes:''}) }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  return (
    <div style={{padding:'0',background:'#030a07',minHeight:'100vh'}}>
      {modal && (
        <Modal title="NOUVELLE FERME" onClose={()=>{setModal(false);setDone(false)}}>
          {done ? <SuccessMessage message="Ferme créée avec succès !" /> : (<>
            <FormRow>
              <FormGroup label="Code (auto-généré)">
                <Input value={form.code} onChange={s('code')} placeholder="ex: F01" />
              </FormGroup>
              <FormGroup label="Nom de la ferme *">
                <Input value={form.name} onChange={s('name')} placeholder="ex: Domaine Souss Agri" autoFocus />
              </FormGroup>
            </FormRow>
            <FormGroup label="Adresse">
              <Input value={form.address} onChange={s('address')} placeholder="ex: Route d'Agadir Km 15" />
            </FormGroup>
            <FormRow>
              <FormGroup label="Ville">
                <Input value={form.city} onChange={s('city')} placeholder="ex: Aït Melloul" />
              </FormGroup>
              <FormGroup label="Région">
                <Input value={form.region} onChange={s('region')} placeholder="ex: Souss-Massa" />
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Pays">
                <Input value={form.country} onChange={s('country')} />
              </FormGroup>
              <FormGroup label="Superficie totale (ha)">
                <Input type="number" value={form.total_area} onChange={s('total_area')} placeholder="ex: 5.2" />
              </FormGroup>
            </FormRow>
            <FormGroup label="Notes">
              <Textarea rows={2} value={form.notes} onChange={s('notes')} placeholder="Remarques..." />
            </FormGroup>
            <ModalFooter onCancel={()=>setModal(false)} onSave={save} loading={saving} disabled={!form.name} saveLabel="CRÉER LA FERME" />
          </>)}
        </Modal>
      )}

      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24}}>
        <div>
          <div className="page-title">FERMES</div>
          <div className="page-sub">{items.length} ferme(s) enregistrée(s)</div>
        </div>
        <button className="btn-primary" onClick={openModal}>+ NEW FERME</button>
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:60,color:'#3d6b52',fontFamily:'DM Mono,monospace',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏭</div>
          <div className="empty-title">Aucune ferme enregistrée</div>
          <div className="empty-sub">Commencez par créer votre première ferme.</div>
          <button className="btn-primary" onClick={openModal}>+ NEW FERME</button>
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:14}}>
          {items.map((f:any)=>(
            <div key={f.id} className="card" style={{borderLeft:'3px solid #00e87a'}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:12}}>
                <div>
                  <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:16,fontWeight:700,color:'#e8f5ee',textTransform:'uppercase',letterSpacing:.5}}>{f.name}</div>
                  <div style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52',letterSpacing:1,marginTop:2}}>{f.code}</div>
                </div>
                <span className="status status-active">ACTIVE</span>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                {[
                  ['Ville', f.city||'—'],
                  ['Région', f.region||'—'],
                  ['Superficie', f.total_area ? f.total_area+' ha' : '—'],
                  ['Pays', f.country||'—'],
                ].map(([l,v])=>(
                  <div key={l} style={{background:'#0d1f14',border:'1px solid #1a3526',borderRadius:6,padding:'8px 10px'}}>
                    <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',letterSpacing:1,marginBottom:3}}>{l}</div>
                    <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:600,color:'#e8f5ee'}}>{v}</div>
                  </div>
                ))}
              </div>
              {f.notes && <div style={{marginTop:10,fontFamily:'DM Mono,monospace',fontSize:10,color:'#3d6b52',fontStyle:'italic'}}>{f.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
