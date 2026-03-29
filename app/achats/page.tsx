'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

export default function AchatsPage() {
  const [items, setItems]       = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [campagnes, setCampagnes] = useState<any[]>([])
  const [serres, setSerres]     = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [saving, setSaving]     = useState(false)
  const [done, setDone]         = useState(false)
  const [form, setForm] = useState({
    supplier_id:'', campaign_id:'', greenhouse_id:'',
    cost_category:'semences', order_date:'', expected_delivery:'',
    currency:'MAD', notes:''
  })
  const s = (k:string) => (e:any) => setForm(f=>({...f,[k]:e.target.value}))

  const load = async () => {
    const [o,sup,c,ser] = await Promise.all([
      supabase.from('purchase_orders').select('*, suppliers(name,category), campaigns(name)').order('order_date',{ascending:false}).limit(100),
      supabase.from('suppliers').select('id,name,category').eq('is_active',true).order('name'),
      supabase.from('campaigns').select('id,name').order('name'),
      supabase.from('greenhouses').select('id,code,name').order('code'),
    ])
    setItems(o.data||[]); setSuppliers(sup.data||[]); setCampagnes(c.data||[]); setSerres(ser.data||[])
    setLoading(false)
  }
  useEffect(()=>{ load() },[])

  const save = async () => {
    if (!form.supplier_id||!form.order_date) return
    setSaving(true)
    try {
      const num = `BC-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`
      const { data, error } = await supabase.from('purchase_orders').insert({
        po_number:     num,
        supplier_id:   form.supplier_id,
        campaign_id:   form.campaign_id||null,
        greenhouse_id: form.greenhouse_id||null,
        cost_category: form.cost_category,
        status:        'brouillon',
        order_date:    form.order_date,
        expected_delivery: form.expected_delivery||null,
        currency:      form.currency||'MAD',
        subtotal:0, tax_amount:0, total_amount:0,
        notes: form.notes||null,
      }).select('*, suppliers(name,category), campaigns(name)').single()
      if (error) throw error
      setItems(p=>[data,...p]); setDone(true)
      setTimeout(()=>{ setModal(false); setDone(false)
        setForm({supplier_id:'',campaign_id:'',greenhouse_id:'',cost_category:'semences',order_date:'',expected_delivery:'',currency:'MAD',notes:''})
      }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  const CATS = ['semences','engrais','phytosanitaires','irrigation','emballage','transport','energie','services','equipement','divers']
  const ST: Record<string,string> = { brouillon:'var(--tx-3)', envoye:'var(--blue)', recu:'var(--neon)', partiel:'var(--amber)', annule:'var(--red)' }

  return (
    <div style={{background:'var(--bg-deep)',minHeight:'100vh'}}>
      {modal && (
        <Modal title="BON DE COMMANDE" onClose={()=>{setModal(false);setDone(false)}}>
          {done ? <SuccessMessage message="Bon de commande créé !" /> : (<>
            <FormGroup label="Fournisseur *">
              {suppliers.length===0
                ? <div style={{padding:'10px',background:'var(--red-dim)',border:'1px solid var(--red)40',borderRadius:7,color:'var(--red)',fontFamily:'var(--font-mono)',fontSize:11}}>⚠ Aucun fournisseur — créez d'abord un fournisseur</div>
                : <Select value={form.supplier_id} onChange={s('supplier_id')}>
                    <option value="">-- Sélectionner --</option>
                    {suppliers.map(f=><option key={f.id} value={f.id}>{f.name} ({f.category})</option>)}
                  </Select>
              }
            </FormGroup>
            <FormRow>
              <FormGroup label="Catégorie d'achat">
                <Select value={form.cost_category} onChange={s('cost_category')}>
                  {CATS.map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Devise">
                <Select value={form.currency} onChange={s('currency')}>
                  {['MAD','EUR','USD'].map(c=><option key={c}>{c}</option>)}
                </Select>
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Date commande *"><Input type="date" value={form.order_date} onChange={s('order_date')} /></FormGroup>
              <FormGroup label="Livraison prévue"><Input type="date" value={form.expected_delivery} onChange={s('expected_delivery')} /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Campagne">
                <Select value={form.campaign_id} onChange={s('campaign_id')}>
                  <option value="">-- Optionnel --</option>
                  {campagnes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Serre">
                <Select value={form.greenhouse_id} onChange={s('greenhouse_id')}>
                  <option value="">-- Optionnel --</option>
                  {serres.map(s=><option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </Select>
              </FormGroup>
            </FormRow>
            <FormGroup label="Notes"><Textarea rows={2} value={form.notes} onChange={s('notes')} /></FormGroup>
            <ModalFooter onCancel={()=>setModal(false)} onSave={save} loading={saving} disabled={!form.supplier_id||!form.order_date} saveLabel="CRÉER LE BON" />
          </>)}
        </Modal>
      )}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
        <div><div className="page-title">BONS DE COMMANDE</div><div className="page-sub">{items.length} bon(s)</div></div>
        <button className="btn-primary" onClick={()=>setModal(true)}>+ BON DE COMMANDE</button>
      </div>
      {loading ? (
        <div style={{textAlign:'center',padding:60,color:'var(--tx-3)',fontFamily:'var(--font-mono)',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>
      ) : items.length===0 ? (
        <div className="empty-state">
          <div className="empty-icon">▢</div>
          <div className="empty-title">Aucun bon de commande</div>
          <button className="btn-primary" onClick={()=>setModal(true)}>+ BON DE COMMANDE</button>
        </div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table className="tbl">
              <thead><tr>
                {['N° BC','Fournisseur','Catégorie','Date','Livraison prévue','Devise','Statut'].map(h=><th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>
                {items.map((o:any)=>{
                  const c = ST[o.status]||'var(--tx-3)'
                  return (
                    <tr key={o.id}>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--neon)'}}>{o.po_number}</span></td>
                      <td><span style={{fontFamily:'var(--font-display)',fontSize:13,fontWeight:600,color:'var(--tx-1)'}}>{o.suppliers?.name||'—'}</span></td>
                      <td><span className="tag tag-amber">{o.cost_category}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--tx-2)'}}>{o.order_date}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--tx-2)'}}>{o.expected_delivery||'—'}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--amber)'}}>{o.currency}</span></td>
                      <td><span style={{background:`${c}18`,color:c,padding:'2px 8px',borderRadius:4,fontFamily:'var(--font-mono)',fontSize:9,border:`1px solid ${c}40`}}>{o.status?.toUpperCase()}</span></td>
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
