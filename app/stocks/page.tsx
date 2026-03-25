'use client'
import { useEffect, useState } from 'react'
import { getStocks, createStockItem, createMouvement } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

export default function StocksPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'article'|'mouvement'|null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [formA, setFormA] = useState({ code:'', name:'', category:'engrais', unit:'kg', min_qty:'', unit_cost:'', location:'' })
  const [formM, setFormM] = useState({ stock_item_id:'', movement_type:'entree', quantity:'', movement_date:'', reference:'', notes:'' })
  const sa = (k:string) => (e:any) => setFormA(f=>({...f,[k]:e.target.value}))
  const sm = (k:string) => (e:any) => setFormM(f=>({...f,[k]:e.target.value}))

  const load = () => getStocks().then(d=>{setItems(d);setLoading(false)}).catch(()=>setLoading(false))
  useEffect(() => { load() }, [])

  const saveArticle = async () => {
    if (!formA.code||!formA.name) return
    setSaving(true)
    try {
      const n = await createStockItem({ ...formA, min_qty: Number(formA.min_qty)||0, unit_cost: Number(formA.unit_cost)||undefined })
      setItems(p=>[n,...p]); setDone(true)
      setTimeout(()=>{setModal(null);setDone(false);setFormA({code:'',name:'',category:'engrais',unit:'kg',min_qty:'',unit_cost:'',location:''})},1400)
    } catch(e:any){alert('Erreur: '+e.message)}
    setSaving(false)
  }

  const saveMouvement = async () => {
    if (!formM.stock_item_id||!formM.quantity||!formM.movement_date) return
    setSaving(true)
    try {
      await createMouvement({ ...formM, quantity: Number(formM.quantity) })
      await load(); setDone(true)
      setTimeout(()=>{setModal(null);setDone(false);setFormM({stock_item_id:'',movement_type:'entree',quantity:'',movement_date:'',reference:'',notes:''})},1400)
    } catch(e:any){alert('Erreur: '+e.message)}
    setSaving(false)
  }

  const CATS = ['semences','plants','engrais','phytosanitaires','emballages','consommables','pieces_rechange','autre']

  return (
    <div style={{padding:'22px 26px',background:'#f4f9f4',minHeight:'100vh'}}>
      {modal==='article' && (
        <Modal title="Nouvel article en stock" onClose={()=>{setModal(null);setDone(false)}}>
          {done ? <SuccessMessage message="Article créé !" /> : (<>
            <FormRow>
              <FormGroup label="Code *"><Input value={formA.code} onChange={sa('code')} placeholder="ex: ST001" /></FormGroup>
              <FormGroup label="Nom *"><Input value={formA.name} onChange={sa('name')} placeholder="ex: NPK 20-20-20" /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Catégorie">
                <Select value={formA.category} onChange={sa('category')}>{CATS.map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}</Select>
              </FormGroup>
              <FormGroup label="Unité">
                <Select value={formA.unit} onChange={sa('unit')}>{['kg','L','unite','sac','boite','rouleau','m2','autre'].map(u=><option key={u} value={u}>{u}</option>)}</Select>
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Stock minimum (alerte)"><Input type="number" value={formA.min_qty} onChange={sa('min_qty')} placeholder="ex: 100" /></FormGroup>
              <FormGroup label="Coût unitaire (MAD)"><Input type="number" value={formA.unit_cost} onChange={sa('unit_cost')} placeholder="ex: 12.50" /></FormGroup>
            </FormRow>
            <FormGroup label="Emplacement"><Input value={formA.location} onChange={sa('location')} placeholder="ex: Entrepôt A / Rayon 3" /></FormGroup>
            <ModalFooter onCancel={()=>setModal(null)} onSave={saveArticle} loading={saving} disabled={!formA.code||!formA.name} saveLabel="Créer l'article" />
          </>)}
        </Modal>
      )}
      {modal==='mouvement' && (
        <Modal title="Mouvement de stock" onClose={()=>{setModal(null);setDone(false)}}>
          {done ? <SuccessMessage message="Mouvement enregistré !" /> : (<>
            <FormGroup label="Article *">
              <Select value={formM.stock_item_id} onChange={sm('stock_item_id')}>
                <option value="">-- Sélectionner un article --</option>
                {items.map(i=><option key={i.id} value={i.id}>{i.code} · {i.name} (stock: {i.current_qty} {i.unit})</option>)}
              </Select>
            </FormGroup>
            <FormRow>
              <FormGroup label="Type">
                <Select value={formM.movement_type} onChange={sm('movement_type')}>
                  <option value="entree">Entrée (réception)</option>
                  <option value="sortie">Sortie (consommation)</option>
                  <option value="ajustement">Ajustement inventaire</option>
                </Select>
              </FormGroup>
              <FormGroup label="Quantité *"><Input type="number" value={formM.quantity} onChange={sm('quantity')} placeholder="0" /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Date *"><Input type="date" value={formM.movement_date} onChange={sm('movement_date')} /></FormGroup>
              <FormGroup label="Référence"><Input value={formM.reference} onChange={sm('reference')} placeholder="ex: BL-2026-001" /></FormGroup>
            </FormRow>
            <FormGroup label="Notes"><Textarea rows={2} value={formM.notes} onChange={sm('notes')} /></FormGroup>
            <ModalFooter onCancel={()=>setModal(null)} onSave={saveMouvement} loading={saving} disabled={!formM.stock_item_id||!formM.quantity||!formM.movement_date} saveLabel="Enregistrer le mouvement" />
          </>)}
        </Modal>
      )}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16}}>
        <div><h2 style={{fontFamily:'Syne,sans-serif',fontSize:20,fontWeight:700,color:'#1b3a2d',marginBottom:4}}>Gestion des Stocks</h2><p style={{fontSize:13,color:'#5a7a66'}}>{items.length} article(s) · {items.filter(i=>i.current_qty<=i.min_qty).length} alerte(s)</p></div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={()=>setModal('mouvement')} style={{padding:'7px 14px',borderRadius:8,border:'1px solid #cce5d4',background:'#d8f3dc',color:'#1b4332',fontSize:13,fontWeight:600,cursor:'pointer'}}>± Mouvement</button>
          <button onClick={()=>setModal('article')} style={{padding:'8px 16px',borderRadius:8,border:'none',background:'#2d6a4f',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Nouvel article</button>
        </div>
      </div>
      {items.filter(i=>i.current_qty<=i.min_qty&&i.min_qty>0).map(i=>(
        <div key={i.id} style={{display:'flex',alignItems:'center',gap:9,padding:'10px 14px',borderRadius:9,marginBottom:6,background:'#fffbec',border:'1px solid #f0e0a0',color:'#7a5500',fontSize:12.5}}>
          ⚠ <strong>{i.name}</strong> — Stock: {i.current_qty} {i.unit} | Seuil: {i.min_qty} {i.unit}
        </div>
      ))}
      {loading ? <div style={{textAlign:'center',padding:60,color:'#5a7a66'}}>Chargement...</div>
      : items.length===0 ? (
        <div style={{textAlign:'center',padding:60,background:'#fff',border:'1px solid #cce5d4',borderRadius:12}}>
          <div style={{fontSize:40,marginBottom:12}}>📦</div>
          <div style={{fontFamily:'Syne,sans-serif',fontSize:16,fontWeight:700,color:'#1b3a2d',marginBottom:8}}>Stock vide</div>
          <button onClick={()=>setModal('article')} style={{padding:'9px 20px',borderRadius:8,border:'none',background:'#2d6a4f',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Nouvel article</button>
        </div>
      ) : (
        <div style={{background:'#fff',border:'1px solid #cce5d4',borderRadius:12,overflow:'hidden',marginTop:14}}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>{['Code','Article','Catégorie','Stock','Seuil min.','Coût unit.','Valeur stock','Alerte','Actions'].map(h=><th key={h} style={{padding:'10px 14px',fontSize:10.5,fontWeight:600,color:'#5a7a66',textTransform:'uppercase',letterSpacing:'.5px',borderBottom:'1px solid #e8f5ec',textAlign:'left',background:'#f9fdf9',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
              <tbody>
                {items.map((i:any)=>{
                  const alerte = i.current_qty <= i.min_qty && i.min_qty > 0
                  const valeur = (i.current_qty||0) * (i.unit_cost||0)
                  return (
                    <tr key={i.id} style={{borderBottom:'1px solid #e8f5ec'}}>
                      <td style={{padding:'11px 14px',fontFamily:'monospace',fontSize:12,color:'#5a7a66'}}>{i.code}</td>
                      <td style={{padding:'11px 14px',fontWeight:600,color:'#1b3a2d'}}>{i.name}</td>
                      <td style={{padding:'11px 14px'}}><span style={{background:'#dbeafe',color:'#1e3a8a',padding:'2px 8px',borderRadius:10,fontSize:10,fontWeight:600}}>{i.category}</span></td>
                      <td style={{padding:'11px 14px',fontWeight:600,color:alerte?'#e63946':'#1b3a2d',fontFamily:'monospace',fontSize:12}}>{i.current_qty} {i.unit}</td>
                      <td style={{padding:'11px 14px',color:'#5a7a66',fontFamily:'monospace',fontSize:12}}>{i.min_qty} {i.unit}</td>
                      <td style={{padding:'11px 14px',fontFamily:'monospace',fontSize:12}}>{i.unit_cost?.toFixed(2)||'—'} MAD</td>
                      <td style={{padding:'11px 14px',fontWeight:600,color:'#1b3a2d',fontFamily:'monospace',fontSize:12}}>{valeur.toLocaleString('fr',{maximumFractionDigits:0})} MAD</td>
                      <td style={{padding:'11px 14px'}}>{alerte?<span style={{background:'#fce4e5',color:'#9b1d1d',padding:'2px 8px',borderRadius:10,fontSize:10,fontWeight:600}}>⚠ ALERTE</span>:<span style={{background:'#d8f3dc',color:'#1b4332',padding:'2px 8px',borderRadius:10,fontSize:10,fontWeight:600}}>✓ OK</span>}</td>
                      <td style={{padding:'11px 14px'}}>
                        <div style={{display:'flex',gap:5}}>
                          <button onClick={()=>{setFormM(f=>({...f,stock_item_id:i.id,movement_type:'entree'}));setModal('mouvement')}} style={{padding:'4px 9px',borderRadius:6,border:'1px solid #b7e4c7',background:'#d8f3dc',color:'#1b4332',fontSize:11,cursor:'pointer'}}>+ Entrée</button>
                          <button onClick={()=>{setFormM(f=>({...f,stock_item_id:i.id,movement_type:'sortie'}));setModal('mouvement')}} style={{padding:'4px 9px',borderRadius:6,border:'1px solid #cce5d4',background:'#f4f9f4',color:'#5a7a66',fontSize:11,cursor:'pointer'}}>- Sortie</button>
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
