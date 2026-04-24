'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import {
  getDefaultDefinition, getStates, applyTransition, getEntityHistory,
  WorkflowState, WorkflowTransition, WorkflowHistoryEntry,
} from '@/lib/workflow'
import { createDirectPurchase } from '@/lib/purchase'
import { PurchaseLineEditor, PurchaseLineDraft, EMPTY_PURCHASE_LINE, StockItemLite } from '@/components/purchase/PurchaseLineEditor'
import { SupplierInvoiceModal } from '@/components/purchase/SupplierInvoiceModal'
import { SupplierCreateModal } from '@/components/suppliers/SupplierCreateModal'

const ENTITY_TYPE = 'purchase_order'
const CATS = ['semences','engrais','phytosanitaires','irrigation','emballage','transport','energie','services','equipement','divers']

export default function AchatsPage() {
  const [items, setItems]         = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [campagnes, setCampagnes] = useState<any[]>([])
  const [serres, setSerres]       = useState<any[]>([])
  const [stockItems, setStockItems] = useState<StockItemLite[]>([])
  const [loading, setLoading]   = useState(true)

  // ── Modal BO formel (maintenant avec lignes inline) ──
  const [modalPO, setModalPO]   = useState(false)
  const [savingPO, setSavingPO] = useState(false)
  const [donePO, setDonePO]     = useState(false)
  const [form, setForm] = useState({
    supplier_id:'', campaign_id:'', greenhouse_id:'',
    cost_category:'semences', order_date:'', expected_delivery:'',
    currency:'MAD', notes:''
  })
  const s = (k:string) => (e:any) => setForm(f=>({...f,[k]:e.target.value}))
  const [poLines, setPoLines] = useState<PurchaseLineDraft[]>([{...EMPTY_PURCHASE_LINE}])

  // ── Modal achat direct ──
  const [modalDirect, setModalDirect] = useState(false)
  const [savingDirect, setSavingDirect] = useState(false)
  const [doneDirect, setDoneDirect] = useState(false)
  const [direct, setDirect] = useState({
    supplier_id:'', order_date:'', cost_category:'semences',
    campaign_id:'', greenhouse_id:'', currency:'MAD',
    reference:'', notes:'',
  })
  const d = (k:string) => (e:any) => setDirect(f=>({...f,[k]:e.target.value}))
  const [directLines, setDirectLines] = useState<PurchaseLineDraft[]>([{...EMPTY_PURCHASE_LINE}])

  // ── Workflow ──
  const [states, setStates]     = useState<WorkflowState[]>([])
  const [allTrans, setAllTrans] = useState<WorkflowTransition[]>([])
  const [transitingId, setTransitingId] = useState<string|null>(null)

  // ── Historique ──
  const [histPoId, setHistPoId] = useState<string|null>(null)
  const [histEntries, setHistEntries] = useState<WorkflowHistoryEntry[]>([])
  const [histLoading, setHistLoading] = useState(false)

  // ── Facturation (modal de facture déclenché depuis la transition "Facturer") ──
  const [invoicePo, setInvoicePo] = useState<{ po: any; transition: WorkflowTransition } | null>(null)

  // ── Création fournisseur inline (depuis l'un des deux formulaires d'achat) ──
  const [supplierModalTarget, setSupplierModalTarget] = useState<null | 'po' | 'direct'>(null)

  const refreshSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('id,name,category').eq('is_active', true).order('name')
    setSuppliers(data ?? [])
  }

  const refreshStockItems = async () => {
    const { data } = await supabase.from('stock_items').select('id,code,name,unit').eq('is_active', true).order('name')
    setStockItems((data ?? []) as StockItemLite[])
  }

  const load = async () => {
    const [o, sup, c, ser, def] = await Promise.all([
      supabase.from('purchase_orders').select('*, suppliers(name,category), campaigns(name)').order('order_date',{ascending:false}).limit(100),
      supabase.from('suppliers').select('id,name,category').eq('is_active',true).order('name'),
      supabase.from('campaigns').select('id,name').order('name'),
      supabase.from('greenhouses').select('id,code,name').order('code'),
      getDefaultDefinition(ENTITY_TYPE),
    ])
    setItems(o.data||[]); setSuppliers(sup.data||[]); setCampagnes(c.data||[]); setSerres(ser.data||[])
    await refreshStockItems()

    if (def) {
      const [st, tr] = await Promise.all([
        getStates(def.id),
        supabase.from('workflow_transitions').select('*').eq('definition_id', def.id).eq('is_active', true).order('order_idx'),
      ])
      setStates(st)
      setAllTrans((tr.data ?? []) as WorkflowTransition[])
    } else {
      console.warn('[WF] Aucune définition purchase_order — applique 008_purchase_workflow.sql')
    }
    setLoading(false)
  }
  useEffect(()=>{ load() },[])

  // ── Création BO formel avec lignes ──
  const savePO = async () => {
    if (!form.supplier_id || !form.order_date) { alert('Fournisseur et date requis'); return }
    const missingStock = poLines.some(l => Number(l.quantity) > 0 && !l.stockItemId)
    if (missingStock) { alert('Chaque ligne avec quantité > 0 doit être rattachée à un article de stock'); return }
    const validLines = poLines.filter(l => l.stockItemId && Number(l.quantity) > 0)
    if (validLines.length === 0) { alert('Au moins une ligne avec article + quantité > 0 est requise'); return }

    setSavingPO(true)
    try {
      const num = `BC-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`
      const subtotal = validLines.reduce((s,l)=>s + Number(l.quantity) * Number(l.unitPrice||0), 0)

      const { data: po, error: poe } = await supabase.from('purchase_orders').insert({
        po_number: num,
        supplier_id: form.supplier_id,
        campaign_id: form.campaign_id||null,
        greenhouse_id: form.greenhouse_id||null,
        cost_category: form.cost_category,
        status: 'brouillon',
        order_date: form.order_date,
        expected_delivery: form.expected_delivery||null,
        currency: form.currency||'MAD',
        subtotal, tax_amount:0, total_amount: subtotal,
        notes: form.notes||null,
      }).select('*, suppliers(name,category), campaigns(name)').single()
      if (poe) throw poe

      const lineInserts = validLines.map(l => {
        const qty = Number(l.quantity)
        const price = Number(l.unitPrice || 0)
        return {
          po_id: po.id,
          stock_item_id: l.stockItemId,
          item_description: l.itemDescription || (stockItems.find(s=>s.id===l.stockItemId)?.name ?? ''),
          unit: l.unit || null,
          quantity: qty,
          unit_price: price,
          line_total: qty * price,
          received_qty: 0,
        }
      })
      const { error: le } = await supabase.from('purchase_order_lines').insert(lineInserts)
      if (le) throw le

      setItems(p=>[po, ...p]); setDonePO(true)
      setTimeout(()=>{
        setModalPO(false); setDonePO(false)
        setForm({supplier_id:'',campaign_id:'',greenhouse_id:'',cost_category:'semences',order_date:'',expected_delivery:'',currency:'MAD',notes:''})
        setPoLines([{...EMPTY_PURCHASE_LINE}])
      }, 1400)
    } catch(e:any){ alert('Erreur: ' + e.message) }
    setSavingPO(false)
  }

  // ── Création achat direct ──
  const saveDirect = async () => {
    if (!direct.supplier_id || !direct.order_date) { alert('Fournisseur et date requis'); return }
    const missingStock = directLines.some(l => Number(l.quantity) > 0 && !l.stockItemId)
    if (missingStock) { alert('Chaque ligne doit être rattachée à un article de stock'); return }
    const lines = directLines
      .filter(l => l.stockItemId && Number(l.quantity) > 0)
      .map(l => ({
        itemDescription: l.itemDescription || (stockItems.find(s=>s.id===l.stockItemId)?.name ?? ''),
        unit: l.unit || undefined,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice || 0),
        stockItemId: l.stockItemId,
      }))
    if (lines.length === 0) { alert('Au moins une ligne avec article + quantité > 0'); return }

    setSavingDirect(true)
    try {
      const res = await createDirectPurchase({
        supplierId: direct.supplier_id,
        orderDate: direct.order_date,
        costCategory: direct.cost_category,
        campaignId: direct.campaign_id || undefined,
        greenhouseId: direct.greenhouse_id || undefined,
        currency: direct.currency,
        reference: direct.reference || undefined,
        notes: direct.notes || undefined,
        lines,
      })
      if (res.warnings?.length) {
        alert(`Achat ${res.po_number} créé — ${res.movements_created} mouvement(s) stock\n\n⚠ ${res.warnings.join('\n')}`)
      }
      setDoneDirect(true)
      setTimeout(async () => {
        setModalDirect(false); setDoneDirect(false)
        setDirect({supplier_id:'',order_date:'',cost_category:'semences',campaign_id:'',greenhouse_id:'',currency:'MAD',reference:'',notes:''})
        setDirectLines([{...EMPTY_PURCHASE_LINE}])
        await load()
      }, 1400)
    } catch(e:any){ alert('Erreur achat direct : ' + e.message) }
    setSavingDirect(false)
  }

  // ── Workflow ──
  const stateByCode = useMemo(() => {
    const m: Record<string, WorkflowState> = {}
    states.forEach(s => { m[s.code] = s })
    return m
  }, [states])

  const transitionsFor = (status: string): WorkflowTransition[] => {
    const fromState = states.find(s => s.code === status)
    if (!fromState) return []
    return allTrans.filter(t => t.from_state_id === fromState.id)
      .filter(t => !['partial_receive','full_receive','complete_receive'].includes(t.code))
  }
  const toStateOf = (t: WorkflowTransition): WorkflowState | undefined =>
    states.find(s => s.id === t.to_state_id)

  const triggerTransition = async (po: any, t: WorkflowTransition) => {
    // La transition "invoice" ouvre d'abord le modal facture ; la transition est déclenchée après création.
    if (t.code === 'invoice') {
      setInvoicePo({ po, transition: t })
      return
    }
    const target = toStateOf(t)
    if (!target) return
    setTransitingId(po.id)
    try {
      await applyTransition({ entityType: ENTITY_TYPE, entityId: po.id, transitionId: t.id })
      setItems(prev => prev.map(o => o.id === po.id ? { ...o, status: target.code } : o))
    } catch (e: any) {
      alert('Transition refusée : ' + (e?.message ?? 'erreur inconnue'))
    } finally {
      setTransitingId(null)
    }
  }

  const onInvoiceCreated = async () => {
    if (!invoicePo) return
    const { po, transition } = invoicePo
    try {
      await applyTransition({ entityType: ENTITY_TYPE, entityId: po.id, transitionId: transition.id })
      const target = toStateOf(transition)
      if (target) setItems(prev => prev.map(o => o.id === po.id ? { ...o, status: target.code } : o))
    } catch (e: any) {
      alert('Facture créée mais transition refusée : ' + e.message)
    }
    setInvoicePo(null)
  }

  const openHistory = async (poId: string) => {
    setHistPoId(poId)
    setHistLoading(true)
    try { setHistEntries(await getEntityHistory(ENTITY_TYPE, poId)) }
    catch (e: any) { alert('Erreur chargement historique : ' + e.message) }
    finally { setHistLoading(false) }
  }

  const poTotal = useMemo(() => poLines.reduce((s,l)=>s + (Number(l.quantity)||0)*(Number(l.unitPrice)||0), 0), [poLines])
  const directTotal = useMemo(() => directLines.reduce((s,l)=>s + (Number(l.quantity)||0)*(Number(l.unitPrice)||0), 0), [directLines])

  return (
    <div style={{background:'var(--bg-deep)',minHeight:'100vh'}}>

      {/* MODAL BO FORMEL AVEC LIGNES */}
      {modalPO && (
        <Modal title="NOUVEAU BON D'ACHAT" onClose={()=>{setModalPO(false);setDonePO(false)}} size="lg">
          {donePO ? <SuccessMessage message="Bon d'achat créé !" /> : (<>
            <FormGroup label="Fournisseur *">
              <div style={{display:'flex',gap:6}}>
                <div style={{flex:1}}>
                  <Select value={form.supplier_id} onChange={s('supplier_id')}>
                    <option value="">-- Sélectionner --</option>
                    {suppliers.map(f=><option key={f.id} value={f.id}>{f.name} ({f.category})</option>)}
                  </Select>
                </div>
                <button type="button" onClick={()=>setSupplierModalTarget('po')}
                  style={{padding:'0 12px',border:'1px solid var(--neon)40',background:'var(--neon-dim)',color:'var(--neon)',borderRadius:6,cursor:'pointer',fontSize:11,fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>
                  + nouveau
                </button>
              </div>
            </FormGroup>
            <FormRow>
              <FormGroup label="Catégorie">
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
                  {serres.map(sr=><option key={sr.id} value={sr.id}>{sr.code} — {sr.name}</option>)}
                </Select>
              </FormGroup>
            </FormRow>

            <div className="section-label" style={{marginTop:14,marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span>LIGNES DU BON</span>
              <span style={{fontSize:10,color:'var(--tx-3)',textTransform:'none',letterSpacing:0}}>
                Chaque ligne doit être rattachée à un article de stock
              </span>
            </div>
            <PurchaseLineEditor
              lines={poLines}
              onChange={setPoLines}
              stockItems={stockItems}
              onStockItemsRefresh={refreshStockItems}
            />
            <div style={{marginTop:12,padding:10,background:'var(--bg-deep)',border:'1px solid var(--bd-1)',borderRadius:6,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:11,color:'var(--tx-3)',fontFamily:'var(--font-mono)'}}>TOTAL PRÉVU</span>
              <span style={{fontSize:14,fontWeight:700,color:'var(--neon)'}}>{poTotal.toLocaleString('fr')} {form.currency}</span>
            </div>

            <FormGroup label="Notes"><Textarea rows={2} value={form.notes} onChange={s('notes')} /></FormGroup>
            <ModalFooter onCancel={()=>setModalPO(false)} onSave={savePO} loading={savingPO}
              disabled={!form.supplier_id||!form.order_date}
              saveLabel="CRÉER LE BON" />
          </>)}
        </Modal>
      )}

      {/* MODAL ACHAT DIRECT */}
      {modalDirect && (
        <Modal title="ACHAT DIRECT (RÉCEPTION IMMÉDIATE)" onClose={()=>{setModalDirect(false);setDoneDirect(false)}} size="lg">
          {doneDirect ? <SuccessMessage message="Achat enregistré et stock mis à jour !" /> : (<>
            <div style={{padding:8,marginBottom:10,background:'var(--neon-dim)',border:'1px solid var(--neon)40',borderRadius:6,fontSize:11,color:'var(--neon)'}}>
              Ce parcours crée le bon en état <strong>reçu</strong> directement et met à jour le stock pour chaque ligne liée.
            </div>
            <FormRow>
              <FormGroup label="Fournisseur *">
                <div style={{display:'flex',gap:6}}>
                  <div style={{flex:1}}>
                    <Select value={direct.supplier_id} onChange={d('supplier_id')}>
                      <option value="">-- Sélectionner --</option>
                      {suppliers.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                    </Select>
                  </div>
                  <button type="button" onClick={()=>setSupplierModalTarget('direct')}
                    style={{padding:'0 12px',border:'1px solid var(--neon)40',background:'var(--neon-dim)',color:'var(--neon)',borderRadius:6,cursor:'pointer',fontSize:11,fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>
                    + nouveau
                  </button>
                </div>
              </FormGroup>
              <FormGroup label="Date *"><Input type="date" value={direct.order_date} onChange={d('order_date')} /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Catégorie">
                <Select value={direct.cost_category} onChange={d('cost_category')}>
                  {CATS.map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Devise">
                <Select value={direct.currency} onChange={d('currency')}>
                  {['MAD','EUR','USD'].map(c=><option key={c}>{c}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Référence"><Input value={direct.reference} onChange={d('reference')} placeholder="Ticket, BL..." /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Campagne">
                <Select value={direct.campaign_id} onChange={d('campaign_id')}>
                  <option value="">-- Optionnel --</option>
                  {campagnes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Serre">
                <Select value={direct.greenhouse_id} onChange={d('greenhouse_id')}>
                  <option value="">-- Optionnel --</option>
                  {serres.map(sr=><option key={sr.id} value={sr.id}>{sr.code} — {sr.name}</option>)}
                </Select>
              </FormGroup>
            </FormRow>

            <div className="section-label" style={{marginTop:14,marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span>LIGNES</span>
              <span style={{fontSize:10,color:'var(--tx-3)',textTransform:'none',letterSpacing:0}}>
                Chaque ligne doit être rattachée à un article de stock
              </span>
            </div>
            <PurchaseLineEditor
              lines={directLines}
              onChange={setDirectLines}
              stockItems={stockItems}
              onStockItemsRefresh={refreshStockItems}
            />
            <div style={{marginTop:12,padding:10,background:'var(--bg-deep)',border:'1px solid var(--bd-1)',borderRadius:6,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:11,color:'var(--tx-3)',fontFamily:'var(--font-mono)'}}>TOTAL</span>
              <span style={{fontSize:14,fontWeight:700,color:'var(--neon)'}}>{directTotal.toLocaleString('fr')} {direct.currency}</span>
            </div>

            <FormGroup label="Notes"><Textarea rows={2} value={direct.notes} onChange={d('notes')} /></FormGroup>
            <ModalFooter onCancel={()=>setModalDirect(false)} onSave={saveDirect} loading={savingDirect}
              disabled={!direct.supplier_id||!direct.order_date}
              saveLabel="ENREGISTRER L'ACHAT" />
          </>)}
        </Modal>
      )}

      {/* MODAL CRÉATION FOURNISSEUR (inline depuis les formulaires BO ou Achat direct) */}
      <SupplierCreateModal
        open={supplierModalTarget !== null}
        onClose={()=>setSupplierModalTarget(null)}
        onCreated={async (sup) => {
          await refreshSuppliers()
          if (supplierModalTarget === 'po')     setForm(f => ({ ...f, supplier_id: sup.id }))
          if (supplierModalTarget === 'direct') setDirect(f => ({ ...f, supplier_id: sup.id }))
          setSupplierModalTarget(null)
        }}
      />

      {/* MODAL FACTURE FOURNISSEUR (déclenché par transition "Facturer") */}
      {invoicePo && (
        <SupplierInvoiceModal
          po={invoicePo.po}
          onClose={()=>setInvoicePo(null)}
          onCreated={onInvoiceCreated}
        />
      )}

      {/* MODAL HISTORIQUE */}
      {histPoId && (
        <Modal title="HISTORIQUE DES TRANSITIONS" onClose={()=>{setHistPoId(null);setHistEntries([])}} size="md">
          {histLoading ? (
            <div style={{padding:20,color:'var(--tx-3)',fontFamily:'var(--font-mono)',fontSize:11}}>CHARGEMENT...</div>
          ) : histEntries.length === 0 ? (
            <div style={{padding:20,color:'var(--tx-3)'}}>Aucune transition enregistrée.</div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {histEntries.map(h => (
                <div key={h.id} style={{padding:10,border:'1px solid var(--bd-1)',borderRadius:6}}>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--tx-3)'}}>{new Date(h.created_at).toLocaleString('fr')}</div>
                  <div style={{marginTop:4,fontSize:13}}>
                    <code style={{color:'var(--tx-3)'}}>{h.from_state_code ?? '∅'}</code>{' → '}
                    <code style={{color:'var(--neon)'}}>{h.to_state_code}</code>
                  </div>
                  {h.comment && <div style={{marginTop:4,fontSize:12,color:'var(--tx-2)'}}>{h.comment}</div>}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* HEADER */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20,gap:10,flexWrap:'wrap'}}>
        <div>
          <div className="page-title">BONS D'ACHAT</div>
          <div className="page-sub">{items.length} bon(s)</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setModalDirect(true)}
            style={{padding:'9px 14px',background:'var(--neon-dim)',color:'var(--neon)',border:'1px solid var(--neon)60',borderRadius:7,cursor:'pointer',fontSize:12,fontFamily:'var(--font-mono)',letterSpacing:1}}>
            ⚡ ACHAT DIRECT
          </button>
          <button className="btn-primary" onClick={()=>setModalPO(true)}>+ BON D'ACHAT</button>
        </div>
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:60,color:'var(--tx-3)',fontFamily:'var(--font-mono)',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>
      ) : items.length===0 ? (
        <div className="empty-state">
          <div className="empty-icon">▢</div>
          <div className="empty-title">Aucun bon d'achat</div>
          <div style={{display:'flex',gap:8,justifyContent:'center',marginTop:12}}>
            <button onClick={()=>setModalDirect(true)}
              style={{padding:'9px 14px',background:'var(--neon-dim)',color:'var(--neon)',border:'1px solid var(--neon)60',borderRadius:7,cursor:'pointer',fontSize:12}}>⚡ Achat direct</button>
            <button className="btn-primary" onClick={()=>setModalPO(true)}>+ Bon d'achat</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table className="tbl">
              <thead><tr>
                {['N° BA','Fournisseur','Catégorie','Date','Livraison','Total','Statut','Actions',''].map(h=><th key={h}>{h}</th>)}
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
                      <td>
                        <Link href={`/achats/${o.id}`} style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--neon)',textDecoration:'none'}}>
                          {o.po_number}
                        </Link>
                      </td>
                      <td><span style={{fontFamily:'var(--font-display)',fontSize:13,fontWeight:600,color:'var(--tx-1)'}}>{o.suppliers?.name||'—'}</span></td>
                      <td><span className="tag tag-amber">{o.cost_category||'—'}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--tx-2)'}}>{o.order_date}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--tx-2)'}}>{o.expected_delivery||'—'}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--amber)'}}>{Number(o.total_amount||0).toLocaleString('fr')} {o.currency}</span></td>
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
                                <button key={t.id} onClick={()=>triggerTransition(o,t)} disabled={isLoading}
                                  style={{padding:'3px 8px',border:`1px solid ${tgtColor}40`,background:`${tgtColor}12`,color:tgtColor,borderRadius:5,fontSize:10,fontFamily:'var(--font-mono)',cursor:isLoading?'wait':'pointer'}}>
                                  {isLoading?'...':t.label}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </td>
                      <td style={{display:'flex',gap:4}}>
                        <Link href={`/achats/${o.id}`} title="Détail & réception"
                          style={{background:'transparent',border:'1px solid var(--bd-1)',borderRadius:6,padding:'3px 8px',fontSize:11,cursor:'pointer',color:'var(--tx-2)',textDecoration:'none'}}>
                          📦
                        </Link>
                        <button onClick={()=>openHistory(o.id)} title="Historique"
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
