'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import {
  getDefaultDefinition, getStates, applyTransition, getEntityHistory,
  WorkflowState, WorkflowTransition, WorkflowHistoryEntry,
} from '@/lib/workflow'

const ENTITY_TYPE = 'sales_order'

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

  // ── Workflow state ──
  const [states, setStates] = useState<WorkflowState[]>([])
  const [allTrans, setAllTrans] = useState<WorkflowTransition[]>([])
  const [transitingId, setTransitingId] = useState<string|null>(null)

  // ── Historique ──
  const [histOrderId, setHistOrderId] = useState<string|null>(null)
  const [histEntries, setHistEntries] = useState<WorkflowHistoryEntry[]>([])
  const [histLoading, setHistLoading] = useState(false)

  const load = async () => {
    const [o,c,m,camp,def] = await Promise.all([
      supabase.from('sales_orders').select('*, clients(name), markets(name)').order('order_date',{ascending:false}).limit(100),
      supabase.from('clients').select('id,name,code').eq('is_active',true).order('name'),
      supabase.from('markets').select('id,name,currency').eq('is_active',true).order('name'),
      supabase.from('campaigns').select('id,name').order('name'),
      getDefaultDefinition(ENTITY_TYPE),
    ])
    setItems(o.data||[]); setClients(c.data||[]); setMarches(m.data||[]); setCampagnes(camp.data||[])

    console.log('[WF] definition chargée:', def)
    if (def) {
      const [st, tr] = await Promise.all([
        getStates(def.id),
        supabase.from('workflow_transitions')
          .select('*')
          .eq('definition_id', def.id)
          .eq('is_active', true)
          .order('order_idx'),
      ])
      console.log('[WF] states:', st.length, st)
      console.log('[WF] transitions:', tr.data?.length, tr.data, 'error:', tr.error)
      setStates(st)
      setAllTrans((tr.data ?? []) as WorkflowTransition[])
    } else {
      console.warn('[WF] Aucune définition trouvée pour entity_type=sales_order')
    }

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

  // Map code -> state pour les couleurs/libellés
  const stateByCode = useMemo(() => {
    const m: Record<string, WorkflowState> = {}
    states.forEach(s => { m[s.code] = s })
    return m
  }, [states])

  // Transitions disponibles pour un statut donné
  const transitionsFor = (status: string): WorkflowTransition[] => {
    const fromState = states.find(s => s.code === status)
    if (!fromState) return []
    return allTrans.filter(t => t.from_state_id === fromState.id)
  }

  // Récupère la cible (to_state) d'une transition
  const toStateOf = (t: WorkflowTransition): WorkflowState | undefined =>
    states.find(s => s.id === t.to_state_id)

  const triggerTransition = async (order: any, t: WorkflowTransition) => {
    const target = toStateOf(t)
    if (!target) return
    setTransitingId(order.id)
    try {
      await applyTransition({ entityType: ENTITY_TYPE, entityId: order.id, transitionId: t.id })
      setItems(prev => prev.map(o => o.id === order.id ? { ...o, status: target.code } : o))
    } catch (e: any) {
      alert('Transition refusée : ' + (e?.message ?? 'erreur inconnue'))
    } finally {
      setTransitingId(null)
    }
  }

  const openHistory = async (orderId: string) => {
    setHistOrderId(orderId)
    setHistLoading(true)
    try {
      const entries = await getEntityHistory(ENTITY_TYPE, orderId)
      setHistEntries(entries)
    } catch (e: any) {
      alert('Erreur chargement historique : ' + e.message)
    } finally {
      setHistLoading(false)
    }
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

      {/* MODAL HISTORIQUE */}
      {histOrderId && (
        <Modal title="HISTORIQUE DES TRANSITIONS" onClose={()=>{ setHistOrderId(null); setHistEntries([]) }} size="md">
          {histLoading ? (
            <div style={{padding:20,color:'var(--tx-3)',fontFamily:'var(--font-mono)',fontSize:11}}>CHARGEMENT...</div>
          ) : histEntries.length === 0 ? (
            <div style={{padding:20,color:'var(--tx-3)'}}>Aucune transition enregistrée.</div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {histEntries.map(h => (
                <div key={h.id} style={{padding:10,border:'1px solid var(--bd-1)',borderRadius:6}}>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--tx-3)'}}>
                    {new Date(h.created_at).toLocaleString('fr')}
                  </div>
                  <div style={{marginTop:4,fontSize:13}}>
                    <code style={{color:'var(--tx-3)'}}>{h.from_state_code ?? '∅'}</code>
                    {' → '}
                    <code style={{color:'var(--neon)'}}>{h.to_state_code}</code>
                  </div>
                  {h.comment && <div style={{marginTop:4,fontSize:12,color:'var(--tx-2)'}}>{h.comment}</div>}
                </div>
              ))}
            </div>
          )}
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
                {['N° Commande','Client','Marché','Date','Livraison','Devise','Statut','Actions',''].map(h=><th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>
                {items.map((o:any)=>{
                  const st = stateByCode[o.status]
                  const color = st?.color ?? 'var(--tx-3)'
                  const label = st?.label ?? o.status
                  const available = transitionsFor(o.status)
                  const isLoading = transitingId === o.id
                  return (
                    <tr key={o.id}>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--neon)'}}>{o.order_number}</span></td>
                      <td><span style={{fontFamily:'var(--font-display)',fontSize:13,fontWeight:600,color:'var(--tx-1)'}}>{o.clients?.name||'—'}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--tx-3)'}}>{o.markets?.name||'—'}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--tx-2)'}}>{o.order_date}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--tx-2)'}}>{o.delivery_date||'—'}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--amber)'}}>{o.currency}</span></td>
                      <td><span style={{background:`${color}18`,color,padding:'2px 8px',borderRadius:4,fontFamily:'var(--font-mono)',fontSize:9,border:`1px solid ${color}40`}}>{label?.toUpperCase()}</span></td>
                      <td>
                        {available.length === 0 ? (
                          <span style={{fontSize:10,color:'var(--tx-3)',fontFamily:'var(--font-mono)'}}>—</span>
                        ) : (
                          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                            {available.map(t => {
                              const tgt = toStateOf(t)
                              const tgtColor = tgt?.color ?? 'var(--tx-2)'
                              return (
                                <button key={t.id}
                                  onClick={() => triggerTransition(o, t)}
                                  disabled={isLoading}
                                  title={`${o.status} → ${tgt?.code ?? '?'}`}
                                  style={{padding:'3px 8px',border:`1px solid ${tgtColor}40`,background:`${tgtColor}12`,color:tgtColor,borderRadius:5,fontSize:10,fontFamily:'var(--font-mono)',cursor:isLoading?'wait':'pointer'}}>
                                  {isLoading ? '...' : t.label}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </td>
                      <td>
                        <button onClick={()=>openHistory(o.id)}
                          title="Voir l'historique"
                          style={{background:'transparent',border:'1px solid var(--bd-1)',borderRadius:6,padding:'3px 8px',fontSize:11,cursor:'pointer',color:'var(--tx-2)'}}>
                          📋
                        </button>
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
