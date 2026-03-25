'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { genCode } from '@/lib/utils'

export default function MarchesPage() {
  const [items, setItems]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]   = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone]     = useState(false)
  const [form, setForm] = useState({
    code:'', name:'', type:'local', country:'Maroc', currency:'MAD',
    avg_price_per_kg:'', avg_logistics_cost_per_kg:'', export_fees_per_kg:'',
    payment_terms:'', requirements:'', notes:''
  })
  const s = (k:string) => (e:any) => setForm(f=>({...f,[k]:e.target.value}))

  const load = () => supabase.from('markets').select('*').eq('is_active',true).order('name').then(r=>{setItems(r.data||[]);setLoading(false)})
  useEffect(()=>{ load() },[])

  const openModal = () => {
    setForm(f=>({...f, code:genCode('MKT',items.map(i=>i.code))}))
    setModal(true)
  }

  const save = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      const { data, error } = await supabase.from('markets').insert({
        code: form.code, name: form.name, type: form.type,
        country: form.country||null, currency: form.currency||'MAD',
        avg_price_per_kg: form.avg_price_per_kg ? Number(form.avg_price_per_kg) : null,
        avg_logistics_cost_per_kg: form.avg_logistics_cost_per_kg ? Number(form.avg_logistics_cost_per_kg) : null,
        export_fees_per_kg: form.export_fees_per_kg ? Number(form.export_fees_per_kg) : null,
        payment_terms: form.payment_terms||null,
        requirements: form.requirements||null,
        notes: form.notes||null,
        is_active: true,
      }).select().single()
      if (error) throw error
      setItems(p=>[data,...p]); setDone(true)
      setTimeout(()=>{ setModal(false); setDone(false) }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  const del = async (id:string,name:string) => {
    if(!confirm(`Désactiver le marché "${name}" ?`)) return
    await supabase.from('markets').update({is_active:false}).eq('id',id)
    setItems(p=>p.filter(i=>i.id!==id))
  }

  const TYPE_COLOR: Record<string,string> = { export:'#f07050', local:'#00e87a', grande_distribution:'#00b4d8', grossiste:'#f5a623', industrie:'#9b5de5' }

  return (
    <div style={{background:'#030a07',minHeight:'100vh'}}>
      {modal && (
        <Modal title="NOUVEAU MARCHÉ" onClose={()=>{setModal(false);setDone(false)}}>
          {done ? <SuccessMessage message="Marché créé !" /> : (<>
            <FormRow>
              <FormGroup label="Code (auto)"><Input value={form.code} onChange={s('code')} /></FormGroup>
              <FormGroup label="Nom du marché *"><Input value={form.name} onChange={s('name')} placeholder="ex: Export France" autoFocus /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Type">
                <Select value={form.type} onChange={s('type')}>
                  {['local','export','grande_distribution','grossiste','industrie'].map(t=><option key={t} value={t}>{t.replace('_',' ').charAt(0).toUpperCase()+t.replace('_',' ').slice(1)}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Devise">
                <Select value={form.currency} onChange={s('currency')}>
                  {['MAD','EUR','USD','GBP'].map(c=><option key={c}>{c}</option>)}
                </Select>
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Pays"><Input value={form.country} onChange={s('country')} placeholder="ex: France" /></FormGroup>
              <FormGroup label="Prix moyen (par kg)"><Input type="number" value={form.avg_price_per_kg} onChange={s('avg_price_per_kg')} placeholder="ex: 0.65" /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Coût logistique (/kg)"><Input type="number" value={form.avg_logistics_cost_per_kg} onChange={s('avg_logistics_cost_per_kg')} placeholder="ex: 0.18" /></FormGroup>
              <FormGroup label="Frais export (/kg)"><Input type="number" value={form.export_fees_per_kg} onChange={s('export_fees_per_kg')} placeholder="ex: 0.05" /></FormGroup>
            </FormRow>
            <FormGroup label="Conditions de paiement"><Input value={form.payment_terms} onChange={s('payment_terms')} placeholder="ex: 30 jours net" /></FormGroup>
            <FormGroup label="Certifications requises"><Input value={form.requirements} onChange={s('requirements')} placeholder="ex: GlobalGAP, BRC..." /></FormGroup>
            <FormGroup label="Notes"><Textarea rows={2} value={form.notes} onChange={s('notes')} /></FormGroup>
            <ModalFooter onCancel={()=>setModal(false)} onSave={save} loading={saving} disabled={!form.name} saveLabel="CRÉER LE MARCHÉ" />
          </>)}
        </Modal>
      )}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
        <div><div className="page-title">MARCHÉS</div><div className="page-sub">{items.length} marché(s) actif(s)</div></div>
        <button className="btn-primary" onClick={openModal}>+ NEW MARCHÉ</button>
      </div>
      {loading ? (
        <div style={{textAlign:'center',padding:60,color:'#3d6b52',fontFamily:'DM Mono,monospace',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>
      ) : items.length===0 ? (
        <div className="empty-state">
          <div className="empty-icon">◎</div>
          <div className="empty-title">Aucun marché</div>
          <button className="btn-primary" onClick={openModal}>+ NEW MARCHÉ</button>
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:14}}>
          {items.map((m:any)=>{
            const c = TYPE_COLOR[m.type]||'#7aab90'
            return (
              <div key={m.id} className="card" style={{borderLeft:`3px solid ${c}`}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                  <div>
                    <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:15,fontWeight:700,color:'#e8f5ee',textTransform:'uppercase',letterSpacing:.5}}>{m.name}</div>
                    <div style={{fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52',letterSpacing:1,marginTop:2}}>{m.code} · {m.country||'—'}</div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
                    <span style={{background:`${c}18`,color:c,padding:'2px 8px',borderRadius:4,fontFamily:'DM Mono,monospace',fontSize:9,border:`1px solid ${c}40`}}>{m.type?.toUpperCase()}</span>
                    <span style={{fontFamily:'DM Mono,monospace',fontSize:10,color:'#7aab90'}}>{m.currency}</span>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>
                  {[
                    ['Prix/kg', m.avg_price_per_kg ? m.avg_price_per_kg+' '+m.currency : '—'],
                    ['Logistique', m.avg_logistics_cost_per_kg ? m.avg_logistics_cost_per_kg+' '+m.currency : '—'],
                    ['Frais export', m.export_fees_per_kg ? m.export_fees_per_kg+' '+m.currency : '—'],
                  ].map(([l,v])=>(
                    <div key={l} style={{background:'#0d1f14',border:'1px solid #1a3526',borderRadius:6,padding:'7px 8px'}}>
                      <div style={{fontFamily:'DM Mono,monospace',fontSize:8,color:'#3d6b52',letterSpacing:.8,marginBottom:2}}>{l}</div>
                      <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:13,fontWeight:700,color:'#e8f5ee'}}>{v}</div>
                    </div>
                  ))}
                </div>
                {m.requirements && <div style={{marginTop:8,fontFamily:'DM Mono,monospace',fontSize:9,color:'#3d6b52'}}>CERT: {m.requirements}</div>}
                <button onClick={()=>del(m.id,m.name)} className="btn-danger" style={{width:'100%',justifyContent:'center',fontSize:10,marginTop:10}}>DÉSACTIVER</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
