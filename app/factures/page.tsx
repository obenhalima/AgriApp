'use client'
import { useEffect, useState } from 'react'
import { getFactures, createFacture, payerFacture, getClients } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

export default function FacturesPage() {
  const [items, setItems] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'facture'|'paiement'|null>(null)
  const [selFact, setSelFact] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [formF, setFormF] = useState({ client_id:'', invoice_date:'', due_date:'', subtotal:'', notes:'' })
  const [formP, setFormP] = useState({ amount:'', payment_method:'virement', reference:'' })
  const sf = (k:string) => (e:any) => setFormF(f=>({...f,[k]:e.target.value}))
  const sp = (k:string) => (e:any) => setFormP(f=>({...f,[k]:e.target.value}))

  const load = () => Promise.all([getFactures(), getClients()]).then(([f,c])=>{setItems(f);setClients(c);setLoading(false)}).catch(()=>setLoading(false))
  useEffect(() => { load() }, [])

  const saveFacture = async () => {
    if (!formF.client_id||!formF.invoice_date||!formF.due_date||!formF.subtotal) return
    setSaving(true)
    try {
      const tot = Number(formF.subtotal)
      const n = await createFacture({ ...formF, subtotal: tot, total_amount: tot })
      setItems(p=>[n,...p]); setDone(true)
      setTimeout(()=>{setModal(null);setDone(false);setFormF({client_id:'',invoice_date:'',due_date:'',subtotal:'',notes:''})},1400)
    } catch(e:any){alert('Erreur: '+e.message)}
    setSaving(false)
  }

  const savePaiement = async () => {
    if (!selFact||!formP.amount) return
    setSaving(true)
    try {
      await payerFacture({ invoice_id: selFact.id, amount: Number(formP.amount), payment_method: formP.payment_method, reference: formP.reference })
      await load(); setDone(true)
      setTimeout(()=>{setModal(null);setDone(false);setFormP({amount:'',payment_method:'virement',reference:''}); setSelFact(null)},1400)
    } catch(e:any){alert('Erreur: '+e.message)}
    setSaving(false)
  }

  const ST: Record<string,any> = {
    en_attente:      { bg:'#fef3c7', color:'#92400e', label:'En attente' },
    partiellement_paye: { bg:'#dbeafe', color:'#1e3a8a', label:'Part. payé' },
    paye:            { bg:'#d8f3dc', color:'#1b4332', label:'Payé' },
    en_retard:       { bg:'#fce4e5', color:'#9b1d1d', label:'En retard' },
  }

  const totalFact = items.reduce((s,f)=>s+(f.total_amount||0),0)
  const totalPaye = items.filter(f=>f.status==='paye').reduce((s,f)=>s+(f.total_amount||0),0)
  const totalEncours = items.filter(f=>f.status!=='paye').reduce((s,f)=>s+(f.total_amount||0)-(f.paid_amount||0),0)

  return (
    <div style={{padding:'22px 26px',background:'#f4f9f4',minHeight:'100vh'}}>
      {modal==='facture' && (
        <Modal title="Nouvelle facture client" onClose={()=>{setModal(null);setDone(false)}}>
          {done ? <SuccessMessage message="Facture créée !" /> : (<>
            <FormGroup label="Client *">
              <Select value={formF.client_id} onChange={sf('client_id')}>
                <option value="">-- Sélectionner un client --</option>
                {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </FormGroup>
            <FormRow>
              <FormGroup label="Date facture *"><Input type="date" value={formF.invoice_date} onChange={sf('invoice_date')} /></FormGroup>
              <FormGroup label="Date échéance *"><Input type="date" value={formF.due_date} onChange={sf('due_date')} /></FormGroup>
            </FormRow>
            <FormGroup label="Montant total (MAD) *"><Input type="number" value={formF.subtotal} onChange={sf('subtotal')} placeholder="ex: 48500" /></FormGroup>
            <FormGroup label="Notes"><Textarea rows={2} value={formF.notes} onChange={sf('notes')} placeholder="Conditions, remarques..." /></FormGroup>
            <ModalFooter onCancel={()=>setModal(null)} onSave={saveFacture} loading={saving} disabled={!formF.client_id||!formF.invoice_date||!formF.due_date||!formF.subtotal} saveLabel="Créer la facture" />
          </>)}
        </Modal>
      )}
      {modal==='paiement' && selFact && (
        <Modal title="Enregistrer un paiement" onClose={()=>{setModal(null);setDone(false);setSelFact(null)}}>
          {done ? <SuccessMessage message="Paiement enregistré !" /> : (<>
            <div style={{background:'#f4f9f4',border:'1px solid #cce5d4',borderRadius:8,padding:'12px 14px',marginBottom:16}}>
              <div style={{fontSize:12,color:'#5a7a66',marginBottom:3}}>Facture sélectionnée</div>
              <div style={{fontWeight:700,color:'#1b3a2d'}}>{selFact.invoice_number} · {selFact.clients?.name}</div>
              <div style={{fontSize:12,color:'#5a7a66',marginTop:2}}>Montant total: {selFact.total_amount?.toLocaleString('fr')} MAD · Payé: {selFact.paid_amount?.toLocaleString('fr')} MAD · Reste: {((selFact.total_amount||0)-(selFact.paid_amount||0)).toLocaleString('fr')} MAD</div>
            </div>
            <FormGroup label="Montant encaissé (MAD) *"><Input type="number" value={formP.amount} onChange={sp('amount')} placeholder="Montant reçu" max={String((selFact.total_amount||0)-(selFact.paid_amount||0))} /></FormGroup>
            <FormRow>
              <FormGroup label="Mode de paiement">
                <Select value={formP.payment_method} onChange={sp('payment_method')}>
                  <option value="virement">Virement bancaire</option>
                  <option value="cheque">Chèque</option>
                  <option value="especes">Espèces</option>
                  <option value="lettre_change">Lettre de change</option>
                </Select>
              </FormGroup>
              <FormGroup label="Référence"><Input value={formP.reference} onChange={sp('reference')} placeholder="ex: VIR-20260325" /></FormGroup>
            </FormRow>
            <ModalFooter onCancel={()=>{setModal(null);setSelFact(null)}} onSave={savePaiement} loading={saving} disabled={!formP.amount} saveLabel="Enregistrer le paiement" />
          </>)}
        </Modal>
      )}

      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16}}>
        <div><h2 style={{fontFamily:'Syne,sans-serif',fontSize:20,fontWeight:700,color:'#1b3a2d',marginBottom:4}}>Factures Clients</h2><p style={{fontSize:13,color:'#5a7a66'}}>{items.length} facture(s)</p></div>
        <button onClick={()=>setModal('facture')} style={{padding:'8px 16px',borderRadius:8,border:'none',background:'#2d6a4f',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Nouvelle facture</button>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:18}}>
        {[{l:'Total facturé',v:`${(totalFact/1000).toFixed(0)} k MAD`,c:'#2d6a4f'},{l:'Encaissé',v:`${(totalPaye/1000).toFixed(0)} k MAD`,c:'#40916c'},{l:'Encours',v:`${(totalEncours/1000).toFixed(0)} k MAD`,c:'#e9a820'}].map((k,i)=>(
          <div key={i} style={{background:'#fff',border:'1px solid #cce5d4',borderRadius:12,padding:'14px 16px',borderTop:`3px solid ${k.c}`}}>
            <div style={{fontSize:10,fontWeight:600,color:'#5a7a66',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:4}}>{k.l}</div>
            <div style={{fontFamily:'Syne,sans-serif',fontSize:22,fontWeight:800,color:'#1b3a2d'}}>{k.v}</div>
          </div>
        ))}
      </div>

      {loading ? <div style={{textAlign:'center',padding:60,color:'#5a7a66'}}>Chargement...</div>
      : items.length===0 ? (
        <div style={{textAlign:'center',padding:60,background:'#fff',border:'1px solid #cce5d4',borderRadius:12}}>
          <div style={{fontSize:40,marginBottom:12}}>🧾</div>
          <div style={{fontFamily:'Syne,sans-serif',fontSize:16,fontWeight:700,color:'#1b3a2d',marginBottom:8}}>Aucune facture</div>
          <button onClick={()=>setModal('facture')} style={{padding:'9px 20px',borderRadius:8,border:'none',background:'#2d6a4f',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Nouvelle facture</button>
        </div>
      ) : (
        <div style={{background:'#fff',border:'1px solid #cce5d4',borderRadius:12,overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>{['N° Facture','Client','Date','Échéance','Montant','Payé','Reste','Statut','Actions'].map(h=><th key={h} style={{padding:'10px 14px',fontSize:10.5,fontWeight:600,color:'#5a7a66',textTransform:'uppercase',letterSpacing:'.5px',borderBottom:'1px solid #e8f5ec',textAlign:'left',background:'#f9fdf9',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
              <tbody>
                {items.map((f:any)=>{
                  const st = ST[f.status] || ST.en_attente
                  const reste = (f.total_amount||0)-(f.paid_amount||0)
                  return (
                    <tr key={f.id} style={{borderBottom:'1px solid #e8f5ec'}}>
                      <td style={{padding:'11px 14px',fontFamily:'monospace',fontSize:12,fontWeight:600,color:'#1b3a2d'}}>{f.invoice_number}</td>
                      <td style={{padding:'11px 14px',fontWeight:500,color:'#1b3a2d'}}>{f.clients?.name||'—'}</td>
                      <td style={{padding:'11px 14px',color:'#5a7a66',fontSize:12}}>{f.invoice_date}</td>
                      <td style={{padding:'11px 14px',color:'#5a7a66',fontSize:12}}>{f.due_date}</td>
                      <td style={{padding:'11px 14px',fontFamily:'monospace',fontSize:12,fontWeight:600}}>{f.total_amount?.toLocaleString('fr')} MAD</td>
                      <td style={{padding:'11px 14px',fontFamily:'monospace',fontSize:12,color:'#2d6a4f'}}>{f.paid_amount?.toLocaleString('fr')||0} MAD</td>
                      <td style={{padding:'11px 14px',fontFamily:'monospace',fontSize:12,fontWeight:600,color:reste>0?'#e9a820':'#2d6a4f'}}>{reste.toLocaleString('fr')} MAD</td>
                      <td style={{padding:'11px 14px'}}><span style={{background:st.bg,color:st.color,padding:'2px 8px',borderRadius:10,fontSize:10,fontWeight:600}}>{st.label}</span></td>
                      <td style={{padding:'11px 14px'}}>
                        <div style={{display:'flex',gap:5}}>
                          {f.status!=='paye' && (
                            <button onClick={()=>{setSelFact(f);setModal('paiement')}} style={{padding:'4px 10px',borderRadius:6,border:'none',background:'#2d6a4f',color:'#fff',fontSize:11,cursor:'pointer',fontWeight:600}}>💳 Payer</button>
                          )}
                        </div>
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
