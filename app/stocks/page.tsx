'use client'
import { useEffect, useState } from 'react'
import { getStocks, createStockItem, createMouvement } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { genCode } from '@/lib/utils'

const CATS = ['semences','plants','engrais','phytosanitaires','emballages','consommables','pieces_rechange','autre']

export default function StocksPage() {
  const [items, setItems]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalArticle, setModalArticle] = useState(false)
  const [modalEditArt, setModalEditArt] = useState<any>(null)
  const [modalMvt,     setModalMvt]     = useState<any>(null)  // article pour mouvement
  const [saving, setSaving] = useState(false)
  const [done,   setDone]   = useState(false)

  const blankA = { code:'', name:'', category:'engrais', unit:'kg', min_qty:'', unit_cost:'', location:'' }
  const [formA,  setFormA]  = useState({...blankA})
  const [formAE, setFormAE] = useState<Record<string,any>>({})
  const [formM,  setFormM]  = useState({ stock_item_id:'', movement_type:'entree', quantity:'', movement_date:'', reference:'', notes:'' })
  const sa  = (k:string) => (e:any) => setFormA(f=>({...f,[k]:e.target.value}))
  const sae = (k:string) => (e:any) => setFormAE(f=>({...f,[k]:e.target.value}))
  const sm  = (k:string) => (e:any) => setFormM(f=>({...f,[k]:e.target.value}))

  const load = () => getStocks().then(d=>{setItems(d);setLoading(false)}).catch(()=>setLoading(false))
  useEffect(()=>{load()},[])

  const openNewArt = () => { setFormA({...blankA, code:genCode('ST',items.map(i=>i.code))}); setModalArticle(true) }
  const openEditArt = (i:any) => {
    setFormAE({code:i.code,name:i.name,category:i.category,unit:i.unit,min_qty:String(i.min_qty||0),unit_cost:String(i.unit_cost||''),location:i.location||''})
    setModalEditArt(i)
  }
  const openMvt = (item:any, type='entree') => {
    setFormM({stock_item_id:item.id,movement_type:type,quantity:'',movement_date:new Date().toISOString().slice(0,10),reference:'',notes:''})
    setModalMvt(item)
  }

  const saveArticle = async () => {
    if (!formA.name) return
    setSaving(true)
    try {
      const n = await createStockItem({...formA,min_qty:Number(formA.min_qty)||0,unit_cost:formA.unit_cost?Number(formA.unit_cost):undefined})
      setItems(p=>[n,...p]); setDone(true)
      setTimeout(()=>{setModalArticle(false);setDone(false)},1400)
    } catch(e:any){alert('Erreur: '+e.message)}
    setSaving(false)
  }

  const saveEditArt = async () => {
    if (!modalEditArt||!formAE.name) return
    setSaving(true)
    try {
      const { error } = await supabase.from('stock_items').update({
        code:formAE.code,name:formAE.name,category:formAE.category,unit:formAE.unit,
        min_qty:Number(formAE.min_qty)||0,unit_cost:formAE.unit_cost?Number(formAE.unit_cost):null,location:formAE.location||null
      }).eq('id',modalEditArt.id)
      if (error) throw error
      setDone(true)
      setTimeout(()=>{setModalEditArt(null);setDone(false);load()},1400)
    } catch(e:any){alert('Erreur: '+e.message)}
    setSaving(false)
  }

  const saveMvt = async () => {
    if (!formM.stock_item_id||!formM.quantity||!formM.movement_date) return
    setSaving(true)
    try {
      await createMouvement({...formM,quantity:Number(formM.quantity)})
      await load(); setDone(true)
      setTimeout(()=>{setModalMvt(null);setDone(false)},1400)
    } catch(e:any){alert('Erreur: '+e.message)}
    setSaving(false)
  }

  const ArtForm = ({vals,onChange}: any) => (<>
    <FormRow>
      <FormGroup label="Code"><Input value={vals.code} onChange={onChange('code')} /></FormGroup>
      <FormGroup label="Nom *"><Input value={vals.name} onChange={onChange('name')} placeholder="ex: NPK 20-20-20" autoFocus /></FormGroup>
    </FormRow>
    <FormRow>
      <FormGroup label="Catégorie">
        <Select value={vals.category} onChange={onChange('category')}>{CATS.map(c=><option key={c}>{c}</option>)}</Select>
      </FormGroup>
      <FormGroup label="Unité">
        <Select value={vals.unit} onChange={onChange('unit')}>{['kg','L','unite','sac','boite','rouleau','m2','autre'].map(u=><option key={u}>{u}</option>)}</Select>
      </FormGroup>
    </FormRow>
    <FormRow>
      <FormGroup label="Stock min. (alerte)"><Input type="number" value={vals.min_qty} onChange={onChange('min_qty')} placeholder="100" /></FormGroup>
      <FormGroup label="Coût unitaire (MAD)"><Input type="number" value={vals.unit_cost} onChange={onChange('unit_cost')} placeholder="12.50" /></FormGroup>
    </FormRow>
    <FormGroup label="Emplacement"><Input value={vals.location} onChange={onChange('location')} placeholder="ex: Entrepôt A / Rayon 3" /></FormGroup>
  </>)

  return (
    <div style={{background:'var(--bg-deep)',minHeight:'100vh'}}>
      {modalArticle && (
        <Modal title="NOUVEL ARTICLE" onClose={()=>{setModalArticle(false);setDone(false)}}>
          {done ? <SuccessMessage message="Article créé !" /> : (<>
            <ArtForm vals={formA} onChange={sa} />
            <ModalFooter onCancel={()=>setModalArticle(false)} onSave={saveArticle} loading={saving} disabled={!formA.name} saveLabel="CRÉER L'ARTICLE" />
          </>)}
        </Modal>
      )}
      {modalEditArt && (
        <Modal title={`MODIFIER — ${modalEditArt.name}`} onClose={()=>{setModalEditArt(null);setDone(false)}}>
          {done ? <SuccessMessage message="Article modifié !" /> : (<>
            <ArtForm vals={formAE} onChange={sae} />
            <ModalFooter onCancel={()=>setModalEditArt(null)} onSave={saveEditArt} loading={saving} disabled={!formAE.name} saveLabel="ENREGISTRER" />
          </>)}
        </Modal>
      )}
      {modalMvt && (
        <Modal title={`MOUVEMENT — ${modalMvt.name}`} onClose={()=>{setModalMvt(null);setDone(false)}}>
          {done ? <SuccessMessage message="Mouvement enregistré !" /> : (<>
            <div style={{padding:'10px 14px',background:'var(--bg-card2)',border:'1px solid var(--border)',borderRadius:8,marginBottom:16,fontFamily:'var(--font-mono)',fontSize:10,color:'var(--tx-2)'}}>
              Stock actuel : <strong style={{color:'var(--neon)'}}>{modalMvt.current_qty} {modalMvt.unit}</strong> · Min : {modalMvt.min_qty} {modalMvt.unit}
            </div>
            <FormRow>
              <FormGroup label="Type">
                <Select value={formM.movement_type} onChange={sm('movement_type')}>
                  <option value="entree">Entrée (réception)</option>
                  <option value="sortie">Sortie (consommation)</option>
                  <option value="ajustement">Ajustement inventaire</option>
                </Select>
              </FormGroup>
              <FormGroup label="Quantité *"><Input type="number" value={formM.quantity} onChange={sm('quantity')} placeholder="0" autoFocus /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Date *"><Input type="date" value={formM.movement_date} onChange={sm('movement_date')} /></FormGroup>
              <FormGroup label="Référence"><Input value={formM.reference} onChange={sm('reference')} placeholder="ex: BL-2026-001" /></FormGroup>
            </FormRow>
            <FormGroup label="Notes"><Textarea rows={2} value={formM.notes} onChange={sm('notes')} /></FormGroup>
            <ModalFooter onCancel={()=>setModalMvt(null)} onSave={saveMvt} loading={saving} disabled={!formM.quantity||!formM.movement_date} saveLabel="ENREGISTRER LE MOUVEMENT" />
          </>)}
        </Modal>
      )}

      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16}}>
        <div><div className="page-title">STOCKS</div><div className="page-sub">{items.length} article(s) · {items.filter(i=>i.current_qty<=i.min_qty&&i.min_qty>0).length} alerte(s)</div></div>
        <div style={{display:'flex',gap:8}}>
          <a href="/stocks/mouvements"
            style={{padding:'9px 14px',background:'transparent',border:'1px solid var(--bd-1)',color:'var(--tx-2)',borderRadius:7,fontSize:12,textDecoration:'none',fontFamily:'var(--font-mono)',letterSpacing:1}}>
            📊 MOUVEMENTS
          </a>
          <button className="btn-primary" onClick={openNewArt}>+ NOUVEL ARTICLE</button>
        </div>
      </div>

      {items.filter(i=>i.current_qty<=i.min_qty&&i.min_qty>0).map(i=>(
        <div key={i.id} style={{display:'flex',alignItems:'center',gap:9,padding:'10px 14px',borderRadius:9,marginBottom:6,background:'var(--amber)12',border:'1px solid var(--amber)40',fontFamily:'var(--font-mono)',fontSize:11,color:'var(--mbe)'}}>
          ⚠ <strong>{i.name}</strong> — Stock : {i.current_qty} {i.unit} | Seuil : {i.min_qty} {i.unit}
        </div>
      ))}

      {loading ? <div style={{textAlign:'center',padding:60,color:'var(--tx-3)',fontFamily:'var(--font-mono)',fontSize:11,letterSpacing:2}}>CHARGEMENT...</div>
      : items.length===0 ? (
        <div className="empty-state" style={{marginTop:14}}><div className="empty-icon">📦</div><div className="empty-title">Stock vide</div><button className="btn-primary" onClick={openNewArt}>+ NOUVEL ARTICLE</button></div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden',marginTop:14}}>
          <div style={{overflowX:'auto'}}>
            <table className="tbl">
              <thead><tr>{['Code','Article','Catégorie','Stock','Seuil','Coût unit.','Valeur','Alerte','Actions'].map(h=><th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {items.map((i:any)=>{
                  const alerte = i.current_qty<=i.min_qty&&i.min_qty>0
                  return (
                    <tr key={i.id}>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--tx-3)'}}>{i.code}</span></td>
                      <td><span style={{fontFamily:'var(--font-display)',fontSize:13,fontWeight:600,color:'var(--tx-1)'}}>{i.name}</span></td>
                      <td><span className="tag tag-blue" style={{fontSize:9}}>{i.category}</span></td>
                      <td><span style={{fontFamily:'var(--font-display)',fontSize:14,fontWeight:700,color:alerte?'var(--ed)':'var(--neon)'}}>{i.current_qty} {i.unit}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--tx-3)'}}>{i.min_qty} {i.unit}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--tx-2)'}}>{i.unit_cost?.toFixed(2)||'—'} MAD</span></td>
                      <td><span style={{fontFamily:'var(--font-display)',fontSize:13,fontWeight:600,color:'var(--tx-1)'}}>{((i.current_qty||0)*(i.unit_cost||0)).toLocaleString('fr',{maximumFractionDigits:0})} MAD</span></td>
                      <td>{alerte?<span className="tag tag-red" style={{fontSize:8}}>⚠ ALERTE</span>:<span className="tag tag-green" style={{fontSize:8}}>✓ OK</span>}</td>
                      <td>
                        <div style={{display:'flex',gap:4}}>
                          <button onClick={()=>openMvt(i,'entree')} style={{padding:'4px 8px',borderRadius:5,border:'1px solid var(--neon)40',background:'var(--neon-dim)',color:'var(--neon)',fontSize:10,cursor:'pointer'}}>+ IN</button>
                          <button onClick={()=>openMvt(i,'sortie')} style={{padding:'4px 8px',borderRadius:5,border:'1px solid var(--border)',background:'transparent',color:'var(--tx-2)',fontSize:10,cursor:'pointer'}}>- OUT</button>
                          <button onClick={()=>openEditArt(i)} className="btn-ghost" style={{padding:'4px 7px',fontSize:10}}>✏️</button>
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
