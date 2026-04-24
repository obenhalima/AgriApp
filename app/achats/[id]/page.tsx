'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  PurchaseOrder, PurchaseOrderLine,
  getPurchaseOrderLines, addPurchaseOrderLine, updatePurchaseOrderLine, deletePurchaseOrderLine,
  receivePurchaseOrder,
} from '@/lib/purchase'
import { StockItemCreateModal } from '@/components/stock/StockItemCreateModal'

type StockItem = { id: string; code: string; name: string; unit: string | null }

type NewLine = { itemDescription: string; unit: string; quantity: string; unitPrice: string; stockItemId: string }
const EMPTY_NEW_LINE: NewLine = { itemDescription:'', unit:'', quantity:'', unitPrice:'', stockItemId:'' }

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>()
  const poId = params?.id as string

  const [po, setPo] = useState<(PurchaseOrder & { suppliers?: any; campaigns?: any; greenhouses?: any }) | null>(null)
  const [lines, setLines] = useState<PurchaseOrderLine[]>([])
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Nouvelle ligne
  const [newLine, setNewLine] = useState<NewLine>({...EMPTY_NEW_LINE})
  const [savingLine, setSavingLine] = useState(false)

  // Modal création d'article stock (target = index de ligne existante à patcher, ou 'new' pour la nouvelle ligne)
  const [stockModalTarget, setStockModalTarget] = useState<null | { kind: 'new' } | { kind: 'existing'; lineId: string }>(null)

  // Réception
  const [receiving, setReceiving] = useState(false)
  const [receptionQtys, setReceptionQtys] = useState<Record<string, string>>({})
  const [receptionDate, setReceptionDate] = useState(new Date().toISOString().slice(0, 10))
  const [receptionNotes, setReceptionNotes] = useState('')
  const [receptionRef, setReceptionRef] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      const [p, l, s] = await Promise.all([
        supabase.from('purchase_orders')
          .select('*, suppliers(name,category), campaigns(name), greenhouses(code,name)')
          .eq('id', poId).maybeSingle(),
        getPurchaseOrderLines(poId),
        supabase.from('stock_items').select('id,code,name,unit').eq('is_active',true).order('name'),
      ])
      if (p.error) throw p.error
      setPo(p.data as any)
      setLines(l)
      setStockItems((s.data ?? []) as StockItem[])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { if (poId) load() }, [poId])

  const editable = po?.status === 'brouillon'
  const canReceive = po?.status === 'envoye' || po?.status === 'partiellement_recu'

  const stockById = useMemo(() => {
    const m: Record<string, StockItem> = {}
    stockItems.forEach(s => { m[s.id] = s })
    return m
  }, [stockItems])

  const totalOrdered = useMemo(() => lines.reduce((s, l) => s + Number(l.quantity || 0), 0), [lines])
  const totalReceived = useMemo(() => lines.reduce((s, l) => s + Number(l.received_qty || 0), 0), [lines])
  const totalAmount = useMemo(() => lines.reduce((s, l) => s + Number(l.line_total || 0), 0), [lines])

  const selectNewStockItem = (stockId: string) => {
    const it = stockItems.find(x => x.id === stockId)
    setNewLine(n => ({
      ...n,
      stockItemId: stockId,
      itemDescription: it ? it.name : n.itemDescription,
      unit: it?.unit ?? n.unit,
    }))
  }

  const submitNewLine = async () => {
    if (!newLine.stockItemId) {
      alert('Sélectionne ou crée un article de stock avant d\'ajouter la ligne.'); return
    }
    if (!newLine.quantity || Number(newLine.quantity) <= 0) {
      alert('Quantité > 0 requise'); return
    }
    setSavingLine(true)
    try {
      const created = await addPurchaseOrderLine(poId, {
        itemDescription: newLine.itemDescription || (stockById[newLine.stockItemId]?.name ?? ''),
        unit: newLine.unit || undefined,
        quantity: Number(newLine.quantity),
        unitPrice: Number(newLine.unitPrice || 0),
        stockItemId: newLine.stockItemId,
      })
      setLines(prev => [...prev, created])
      setNewLine({...EMPTY_NEW_LINE})
      const { data: p } = await supabase.from('purchase_orders')
        .select('*, suppliers(name,category), campaigns(name), greenhouses(code,name)')
        .eq('id', poId).maybeSingle()
      if (p) setPo(p as any)
    } catch (e: any) { alert('Erreur : ' + e.message) }
    finally { setSavingLine(false) }
  }

  // Quand un nouvel article stock est créé, on l'ajoute à la liste et on l'affecte à la cible
  const handleStockCreated = async (item: { id: string; name: string; unit: string; category: string; code: string }) => {
    // Rafraîchir la liste complète depuis la base (pour avoir tous les champs)
    const { data } = await supabase.from('stock_items').select('id,code,name,unit').eq('is_active', true).order('name')
    setStockItems((data ?? []) as StockItem[])

    if (stockModalTarget?.kind === 'new') {
      setNewLine(n => ({
        ...n,
        stockItemId: item.id,
        itemDescription: n.itemDescription || item.name,
        unit: n.unit || item.unit,
      }))
    } else if (stockModalTarget?.kind === 'existing') {
      await changeLine({ ...(lines.find(l => l.id === stockModalTarget.lineId) as PurchaseOrderLine) }, { stockItemId: item.id })
    }
    setStockModalTarget(null)
  }

  const changeLine = async (line: PurchaseOrderLine, patch: Partial<{ itemDescription: string; unit: string; quantity: number; unitPrice: number; stockItemId: string | null }>) => {
    try {
      const updated = await updatePurchaseOrderLine(line.id, patch)
      setLines(prev => prev.map(l => l.id === line.id ? updated : l))
    } catch (e: any) { alert('Erreur : ' + e.message) }
  }

  const removeLine = async (line: PurchaseOrderLine) => {
    if (!confirm(`Supprimer la ligne "${line.item_description}" ?`)) return
    try {
      await deletePurchaseOrderLine(line.id)
      setLines(prev => prev.filter(l => l.id !== line.id))
    } catch (e: any) { alert('Erreur : ' + e.message) }
  }

  // Réception
  const openReception = () => {
    setReceiving(true)
    // Pré-remplir avec les qtés restantes
    const qtys: Record<string, string> = {}
    lines.forEach(l => {
      const remaining = Number(l.quantity || 0) - Number(l.received_qty || 0)
      qtys[l.id] = remaining > 0 ? String(remaining) : ''
    })
    setReceptionQtys(qtys)
  }
  const closeReception = () => {
    setReceiving(false); setReceptionQtys({}); setReceptionNotes(''); setReceptionRef('')
  }

  const submitReception = async () => {
    const linesInput = Object.entries(receptionQtys)
      .map(([lineId, qty]) => ({ lineId, qtyReceived: Number(qty) }))
      .filter(l => Number.isFinite(l.qtyReceived) && l.qtyReceived > 0)

    if (linesInput.length === 0) { alert('Aucune quantité à réceptionner'); return }

    try {
      const res = await receivePurchaseOrder({
        poId,
        receptionDate,
        reference: receptionRef || undefined,
        notes: receptionNotes || undefined,
        lines: linesInput,
      })
      let msg = `Réception enregistrée !\nNouvel état : ${res.new_status}\nLignes mises à jour : ${res.lines_updated}\nMouvements stock : ${res.movements_created}`
      if (res.warnings?.length) msg += `\n\n⚠ ${res.warnings.join('\n')}`
      alert(msg)
      closeReception()
      await load()
    } catch (e: any) {
      alert('Erreur réception : ' + e.message)
    }
  }

  if (loading) return <div style={{padding:40,color:'var(--tx-3)'}}>CHARGEMENT...</div>
  if (error) return <div style={{padding:12,background:'var(--red-dim)',color:'var(--red)'}}>⚠ {error}</div>
  if (!po) return <div style={{padding:40}}>Bon d'achat introuvable.</div>

  return (
    <div style={{background:'var(--bg-base)',minHeight:'100vh'}}>
      <Link href="/achats" style={{fontSize:11,color:'var(--tx-3)',textDecoration:'none'}}>← Retour</Link>
      <div style={{marginTop:6,display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20,flexWrap:'wrap',gap:10}}>
        <div>
          <div className="page-title">{po.po_number}</div>
          <div className="page-sub">
            <strong>{(po as any).suppliers?.name ?? '—'}</strong> · {po.cost_category ?? '—'} · {po.order_date}
            <span className="tag" style={{marginLeft:8}}>{po.status}</span>
          </div>
        </div>
        {canReceive && (
          <button onClick={openReception}
            style={{padding:'9px 14px',background:'var(--neon-dim)',color:'var(--neon)',border:'1px solid var(--neon)60',borderRadius:7,cursor:'pointer',fontSize:12,fontFamily:'var(--font-mono)',letterSpacing:1}}>
            📦 RÉCEPTIONNER
          </button>
        )}
      </div>

      {/* KPI */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
        {[
          { l:'Lignes',    v:String(lines.length),                     c:'var(--neon)' },
          { l:'Commandé',  v:totalOrdered.toLocaleString('fr'),        c:'var(--blue)' },
          { l:'Reçu',      v:totalReceived.toLocaleString('fr'),       c:'var(--amber)' },
          { l:'Montant',   v:`${totalAmount.toLocaleString('fr')} ${po.currency}`, c:'var(--purple)' },
        ].map((k,i)=>(
          <div key={i} className="kpi" style={{'--accent':k.c} as any}>
            <div className="kpi-label">{k.l}</div>
            <div className="kpi-value" style={{color:k.c}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* LIGNES */}
      <div className="section-label" style={{marginBottom:8}}>LIGNES ({lines.length})</div>

      {editable && (
        <div className="card" style={{padding:12,marginBottom:10}}>
          <div style={{display:'grid',gridTemplateColumns:'2fr .5fr .8fr .9fr auto',gap:6,alignItems:'end'}}>
            <div>
              <div style={{fontSize:9,color:'var(--tx-3)',fontFamily:'var(--font-mono)',marginBottom:2,display:'flex',justifyContent:'space-between'}}>
                <span>ARTICLE STOCK *</span>
                <button onClick={()=>setStockModalTarget({kind:'new'})} type="button"
                  style={{background:'transparent',border:'1px solid var(--neon)40',color:'var(--neon)',borderRadius:4,padding:'1px 6px',fontSize:10,cursor:'pointer'}}>
                  + nouveau
                </button>
              </div>
              <select value={newLine.stockItemId} onChange={e=>selectNewStockItem(e.target.value)}
                style={{width:'100%',padding:6,background:'var(--bg-deep)',color:'var(--tx-1)',border:`1px solid ${newLine.stockItemId?'var(--bd-1)':'var(--amber)60'}`,borderRadius:5,fontSize:12}}>
                <option value="">— sélectionner un article —</option>
                {stockItems.map(si=><option key={si.id} value={si.id}>{si.name} ({si.unit})</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:9,color:'var(--tx-3)',fontFamily:'var(--font-mono)',marginBottom:2}}>UNITÉ</div>
              <input value={newLine.unit} readOnly
                style={{width:'100%',padding:6,background:'var(--bg-deep)',color:'var(--tx-3)',border:'1px solid var(--bd-1)',borderRadius:5,fontSize:12}} />
            </div>
            <div>
              <div style={{fontSize:9,color:'var(--tx-3)',fontFamily:'var(--font-mono)',marginBottom:2}}>QTÉ *</div>
              <input type="number" value={newLine.quantity} onChange={e=>setNewLine({...newLine,quantity:e.target.value})}
                style={{width:'100%',padding:6,background:'var(--bg-deep)',color:'var(--tx-1)',border:'1px solid var(--bd-1)',borderRadius:5,fontSize:12}} />
            </div>
            <div>
              <div style={{fontSize:9,color:'var(--tx-3)',fontFamily:'var(--font-mono)',marginBottom:2}}>PRIX UNIT.</div>
              <input type="number" value={newLine.unitPrice} onChange={e=>setNewLine({...newLine,unitPrice:e.target.value})}
                style={{width:'100%',padding:6,background:'var(--bg-deep)',color:'var(--tx-1)',border:'1px solid var(--bd-1)',borderRadius:5,fontSize:12}} />
            </div>
            <button onClick={submitNewLine} disabled={savingLine || !newLine.stockItemId || !newLine.quantity}
              className="btn-primary" style={{whiteSpace:'nowrap',opacity:(!newLine.stockItemId||!newLine.quantity)?.5:1}}>
              {savingLine ? '...' : '+ AJOUTER'}
            </button>
          </div>
        </div>
      )}

      <StockItemCreateModal
        open={stockModalTarget !== null}
        onClose={() => setStockModalTarget(null)}
        onCreated={handleStockCreated}
        initialName={stockModalTarget?.kind === 'new' ? newLine.itemDescription : ''}
        initialUnit={stockModalTarget?.kind === 'new' ? newLine.unit : ''}
      />

      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <div style={{overflowX:'auto'}}>
          <table className="tbl">
            <thead><tr>
              {['Libellé','Article stock','Unité','Commandé','Reçu','Prix unit.','Total', editable?'':''].map((h,i)=><th key={i}>{h}</th>)}
            </tr></thead>
            <tbody>
              {lines.length === 0 ? (
                <tr><td colSpan={8} style={{padding:30,textAlign:'center',color:'var(--tx-3)'}}>Aucune ligne — ajoute-en ci-dessus.</td></tr>
              ) : lines.map(l => (
                <tr key={l.id}>
                  <td>{editable ? (
                    <input defaultValue={l.item_description} onBlur={e=>e.target.value!==l.item_description && changeLine(l,{itemDescription:e.target.value})}
                      style={{width:'100%',padding:4,background:'transparent',color:'var(--tx-1)',border:'1px solid transparent',borderRadius:4,fontSize:12}} />
                  ) : <strong>{l.item_description}</strong>}
                  </td>
                  <td>{l.stock_item_id ? (stockById[l.stock_item_id]?.name ?? '—') : <span style={{color:'var(--tx-3)'}}>libre</span>}</td>
                  <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--tx-2)'}}>{l.unit ?? '—'}</span></td>
                  <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--blue)'}}>{Number(l.quantity).toLocaleString('fr')}</span></td>
                  <td>
                    <span style={{fontFamily:'var(--font-mono)',fontSize:11,color: Number(l.received_qty)>=Number(l.quantity) ? 'var(--neon)' : 'var(--amber)'}}>
                      {Number(l.received_qty||0).toLocaleString('fr')}
                    </span>
                  </td>
                  <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--tx-2)'}}>{Number(l.unit_price||0).toLocaleString('fr')}</span></td>
                  <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--purple)',fontWeight:600}}>{Number(l.line_total||0).toLocaleString('fr')}</span></td>
                  {editable && (
                    <td>
                      <button onClick={()=>removeLine(l)} title="Supprimer"
                        style={{background:'transparent',border:'1px solid var(--bd-1)',borderRadius:6,padding:'3px 8px',fontSize:12,cursor:'pointer',color:'var(--red)'}}>🗑</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!editable && (
        <div style={{marginTop:10,padding:10,background:'var(--bg-deep)',border:'1px solid var(--bd-1)',borderRadius:6,fontSize:11,color:'var(--tx-3)'}}>
          Les lignes sont en lecture seule : le bon n'est plus en brouillon.
        </div>
      )}

      {/* MODAL RÉCEPTION */}
      {receiving && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}} onClick={e=>e.target===e.currentTarget&&closeReception()}>
          <div style={{background:'var(--bg-base)',border:'1px solid var(--bd-1)',borderRadius:10,width:'min(800px,95vw)',maxHeight:'90vh',overflow:'auto',padding:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <div style={{fontSize:16,fontWeight:700,color:'var(--tx-1)'}}>RÉCEPTIONNER — {po.po_number}</div>
              <button onClick={closeReception} style={{background:'transparent',border:'none',color:'var(--tx-3)',fontSize:20,cursor:'pointer'}}>×</button>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
              <div>
                <div style={{fontSize:10,color:'var(--tx-3)',fontFamily:'var(--font-mono)',marginBottom:4}}>DATE *</div>
                <input type="date" value={receptionDate} onChange={e=>setReceptionDate(e.target.value)}
                  style={{width:'100%',padding:8,background:'var(--bg-deep)',color:'var(--tx-1)',border:'1px solid var(--bd-1)',borderRadius:6}} />
              </div>
              <div>
                <div style={{fontSize:10,color:'var(--tx-3)',fontFamily:'var(--font-mono)',marginBottom:4}}>RÉFÉRENCE (BL...)</div>
                <input value={receptionRef} onChange={e=>setReceptionRef(e.target.value)}
                  style={{width:'100%',padding:8,background:'var(--bg-deep)',color:'var(--tx-1)',border:'1px solid var(--bd-1)',borderRadius:6}} />
              </div>
            </div>

            <table className="tbl" style={{marginBottom:14}}>
              <thead><tr>
                {['Libellé','Commandé','Déjà reçu','Restant','Qté reçue maintenant'].map(h=><th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>
                {lines.map(l => {
                  const remaining = Number(l.quantity||0) - Number(l.received_qty||0)
                  return (
                    <tr key={l.id}>
                      <td><strong>{l.item_description}</strong>{l.stock_item_id && <span style={{fontSize:10,color:'var(--tx-3)',marginLeft:6}}>↔ stock</span>}</td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--blue)'}}>{Number(l.quantity).toLocaleString('fr')} {l.unit??''}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--amber)'}}>{Number(l.received_qty||0).toLocaleString('fr')}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:remaining>0?'var(--neon)':'var(--tx-3)'}}>{remaining.toLocaleString('fr')}</span></td>
                      <td>
                        <input type="number" value={receptionQtys[l.id] ?? ''} onChange={e=>setReceptionQtys({...receptionQtys,[l.id]:e.target.value})}
                          style={{width:100,padding:6,background:'var(--bg-deep)',color:'var(--tx-1)',border:'1px solid var(--bd-1)',borderRadius:5,fontSize:12}} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:'var(--tx-3)',fontFamily:'var(--font-mono)',marginBottom:4}}>NOTES</div>
              <textarea rows={2} value={receptionNotes} onChange={e=>setReceptionNotes(e.target.value)}
                style={{width:'100%',padding:8,background:'var(--bg-deep)',color:'var(--tx-1)',border:'1px solid var(--bd-1)',borderRadius:6}} />
            </div>

            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={closeReception}
                style={{padding:'8px 14px',background:'transparent',border:'1px solid var(--bd-1)',color:'var(--tx-2)',borderRadius:6,cursor:'pointer'}}>Annuler</button>
              <button onClick={submitReception}
                className="btn-primary">VALIDER LA RÉCEPTION</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
