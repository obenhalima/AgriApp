'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

export default function CommandesPage() {
  const [items, setItems]   = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [marches, setMarches] = useState<any[]>([])
  const [campagnes, setCampagnes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]   = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone]     = useState(false)
  const [form, setForm] = useState({
    client_id:'', market_id:'', campaign_id:'',
    order_date:'', delivery_date:'',
    currency:'MAD', notes:''
  })
  const s = (k:string) => (e:any) => setForm(f=>({...f,[k]:e.target.value}))

  const load = async () => {
    const [o,c,m,camp] = await Promise.all([
      supabase.from('sales_orders').select('*, clients(name), markets(name)').order('order_date',{ascending:false}).limit(100),
      supabase.from('clients').select('id,name,code').eq('is_active',true).order('name'),
      supabase.from('markets').select('id,name,currency').eq('is_active',true).order('name'),
      supabase.from('campaigns').select('id,name').order('name'),
    ])
    setItems(o.data||[]); setClients(c.data||[]); setMarches(m.data||[]); setCampagnes(camp.data||[])
    setLoading(false)
  }
  useEffect(()=>{ load() },[])

  const selectMarche = (id:string) => {
    const m = marches.find(x=>x.id===id)
    setForm(f=>({...f, market_id:id, currency: m?.currency||'MAD'}))
  }

  const save = async () => {
    if (!form.client_id||!form.order_date) return
    setSaving(true)
    try {
      const num = `CMD-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`
      const { data, error } = await supabase.from('sales_orders').insert({
        order_number: num,
        client_id:    form.client_id,
        market_id:    form.market_id||null,
        campaign_id:  form.campaign_id||null,
        order_date:   form.order_date,
        delivery_date:form.delivery_date||null,
        status:       'brouillon',
        currency:     form.currency||'MAD',
        exchange_rate:1,
        subtotal:0, total_amount:0,
        notes: form.notes||null,
      }).select('*, clients(name), markets(name)').single()
      if (error) throw error
      setItems(p=>[data,...p]); setDone(true)
      setTimeout(()=>{ setModal(false); setDone(false)
        setForm({client_id:'',market_id:'',campaign_id:'',order_date:'',delivery_date:'',currency:'MAD',notes:''})
      }, 1400)
    } catch(e:any){ alert('Erreur: '+e.message) }
    setSaving(false)
  }

  const updateStatus = async (id:string, status:string) => {
    await supabase.from('sales_orders').update({status}).eq('id',id)
    setItems(p=>p.map(i=>i.id===id ? {...i,status} : i))
  }

  const ST: Record<string,string> = {
    brouillon:'var(--tx-3)', confirme:'var(--blue)', en_preparation:'var(--amber)',
    expedie:'var(--purple)', livre:'var(--neon)', facture:'var(--neon-2)', annule:'var(--red)'
  }

  return (
    <div style={{background:'var(--bg-deep)',minHeight:'100vh'}}>
      {modal && (
        <Modal title="NOUVELLE COMMANDE" onClose={()=>{setModal(false);setDone(false)}}>
          {done ? <SuccessMessage message="Commande créée !" /> : (<>
            <FormGroup label="Client *">
              {clients.length===0
                ? <div style={{padding:'10px',background:'var(--red-dim)',border:'1px solid var(--red)40',borderRadius:7,color:'var(--red)',fontFamily:'var(--font-mono)',fontSize:11}}>⚠ Aucun client — créez d'abord un client</div>
                : <Select value={form.client_id} onChange={s('client_id')}>
                    <option value="">-- Sélectionner un client --</option>
                    {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
              }
            </FormGroup>
            <FormRow>
              <FormGroup label="Marché">
                <Select value={form.market_id} onChange={e=>selectMarche(e.target.value)}>
                  <option value="">-- Optionnel --</option>
                  {marches.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Devise">
                <Select value={form.currency} onChange={s('currency')}>
                  {['MAD','EUR','USD','GBP'].map(c=><option key={c}>{c}</option>)}
                </Select>
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Date de commande *"><Input type="date" value={form.order_date} onChange={s('order_date')} /></FormGroup>
              <FormGroup label="Date livraison souhaitée"><Input type="date" value={form.delivery_date} onChange={s('delivery_date')} /></FormGroup>
            </FormRow>
            <FormGroup label="Campagne">
              <Select value={form.campaign_id} onChange={s('campaign_id')}>
                <option value="">-- Optionnel --</option>
                {campagnes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </FormGroup>
            <FormGroup label="Notes"><Textarea rows={2} value={form.notes} onChange={s('notes')} placeholder="Instructions, conditions particulières..." /></FormGroup>
            <ModalFooter onCancel={()=>setModal(false)} onSave={save} loading={saving} disabled={!form.client_id||!form.order_date} saveLabel="CRÉER LA COMMANDE" />
          </>)}
        </Modal>
      )}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
        <div><div className="page-title">COMMANDES</div><div className="page-sub">{items.length} commande(s)</div></div>
        <button className="btn-primary" onClick={()=>setModal(true)}>+ NEW COMMANDE</button>
      </div>
      {loading ? (
        <div style={{textAlign:'center',padding:60,color:'var(--tx-3)',fontFamily:'var(--font-mono)',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>
      ) : items.length===0 ? (
        <div className="empty-state">
          <div className="empty-icon">▣</div>
          <div className="empty-title">Aucune commande</div>
          <button className="btn-primary" onClick={()=>setModal(true)}>+ NEW COMMANDE</button>
        </div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table className="tbl">
              <thead><tr>
                {['N° Commande','Client','Marché','Date','Livraison','Devise','Statut','Actions'].map(h=><th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>
                {items.map((o:any)=>{
                  const c = ST[o.status]||'var(--tx-3)'
                  return (
                    <tr key={o.id}>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--neon)'}}>{o.order_number}</span></td>
                      <td><span style={{fontFamily:'var(--font-display)',fontSize:13,fontWeight:600,color:'var(--tx-1)'}}>{o.clients?.name||'—'}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--tx-3)'}}>{o.markets?.name||'—'}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--tx-2)'}}>{o.order_date}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--tx-2)'}}>{o.delivery_date||'—'}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--amber)'}}>{o.currency}</span></td>
                      <td><span style={{background:`${c}18`,color:c,padding:'2px 8px',borderRadius:4,fontFamily:'var(--font-mono)',fontSize:9,border:`1px solid ${c}40`}}>{o.status?.toUpperCase()}</span></td>
                      <td>
                        <select className="form-input" style={{fontSize:10,padding:'3px 6px',width:'auto'}}
                          value={o.status} onChange={e=>updateStatus(o.id,e.target.value)}>
                          {['brouillon','confirme','en_preparation','expedie','livre','facture','annule'].map(st=>(
                            <option key={st} value={st}>{st}</option>
                          ))}
                        </select>
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
