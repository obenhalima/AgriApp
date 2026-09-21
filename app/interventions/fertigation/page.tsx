'use client'

import {useCallback,useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {FlaskConical} from 'lucide-react'
import {useAuth} from '@/lib/auth'
import {supabase} from '@/lib/supabase'
import {withDeadline} from '@/lib/withDeadline'
import {decimal,waterFormat} from '@/lib/irrigation'
import {compatibleDoseUnits,fertigationDoseUnits,fertigationQuantity,type FertigationLine,type FertigationDoseUnit} from '@/lib/fertigation'
import {PageHeader} from '@/components/ui/PageHeader'
import {Card} from '@/components/ui/Card'
import {Button} from '@/components/ui/Button'
import {Input,Select,Textarea} from '@/components/ui/Input'

type Item={id:string;name:string;unit:string}
type Recipe={id:string;farm_id:string;name:string;notes:string;created_at:string;lines:(FertigationLine&{name:string;stock_unit:string})[]}
type Workspace={farms:{id:string;name:string;can_prepare:boolean}[];warehouses:{id:string;farm_id:string;name:string}[];items:Item[];recipes:Recipe[]}
const blankLine=():FertigationLine=>({stock_item_id:'',dose:'',dose_unit:'kg_m3'})
async function rpc(name:string,args:Record<string,unknown>){
  const {data,error}=await withDeadline(signal=>supabase.rpc(name,args).abortSignal(signal),25000,'Délai dépassé. Réessayez le même enregistrement pour éviter un doublon.')
  if(error)throw error
  return data
}
export default function FertigationPage(){
  const {activeDomain,user}=useAuth()
  return activeDomain&&user?<Recipes key={`${activeDomain.domain_id}:${user.id}`} domain={activeDomain.domain_id}/>:<p>Sélectionnez une société.</p>
}
function Recipes({domain}:{domain:string}){
  const [data,setData]=useState<Workspace|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
  const [farm,setFarm]=useState(''),[name,setName]=useState(''),[notes,setNotes]=useState(''),[lines,setLines]=useState<FertigationLine[]>([blankLine()])
  const [volume,setVolume]=useState(''),[warehouse,setWarehouse]=useState(''),[preview,setPreview]=useState<any>(null)
  const [frozen,setFrozen]=useState(false)
  const pending=useRef<{id:string;input:Record<string,unknown>}|null>(null),alive=useRef(true),working=useRef(false),serial=useRef(0)
  const load=useCallback(async()=>{const n=++serial.current;const next=await rpc('fertigation_workspace',{p_domain:domain});if(alive.current&&n===serial.current)setData(next)},[domain])
  useEffect(()=>{alive.current=true;void load().catch(e=>{if(alive.current)setError(e.message)});return()=>{alive.current=false;serial.current++}},[load])
  async function run(work:()=>Promise<void>){if(working.current)return;working.current=true;setBusy(true);setError('');setNotice('');try{await work()}catch(e:any){if(alive.current)setError(e.message||'Opération impossible')}finally{working.current=false;if(alive.current)setBusy(false)}}
  const canPrepare=!!data?.farms.find(f=>f.id===farm)?.can_prepare
  function validatedLines(){
    if(!farm||!lines.length)throw new Error('Sélectionnez la ferme et au moins un engrais.')
    if(new Set(lines.map(l=>l.stock_item_id)).size!==lines.length)throw new Error('Un engrais ne peut apparaître qu’une fois.')
    return lines.map(l=>{const item=data?.items.find(i=>i.id===l.stock_item_id);if(!item)throw new Error('Choisissez chaque article engrais.');fertigationQuantity(1000,l.dose,l.dose_unit,item.unit);return {...l,dose:decimal(l.dose)}})
  }
  function update(index:number,patch:Partial<FertigationLine>){setPreview(null);setLines(lines.map((l,i)=>i===index?{...l,...patch}:l))}
  async function save(){await run(async()=>{
    if(!pending.current){
      if(name.trim().length<3)throw new Error('Donnez un nom de trois caractères minimum à la recette.')
      const checked=validatedLines()
      pending.current={id:crypto.randomUUID(),input:{domain_id:domain,farm_id:farm,name:name.trim(),notes,basis:'final_solution',lines:checked}}
      setFrozen(true)
    }
    await rpc('save_fertigation_recipe',{p_id:pending.current.id,p_input:pending.current.input})
    pending.current=null
    if(alive.current){setFrozen(false);setName('');setNotes('');setLines([blankLine()]);setPreview(null);setNotice('Recette enregistrée. Aucun traitement planifié et aucun stock consommé.');await load()}
  })}
  async function simulate(){await run(async()=>{
    const checked=validatedLines();const liters=decimal(volume)
    if(liters<=0||!warehouse)throw new Error('Renseignez un volume positif et un entrepôt de la ferme.')
    const result=await rpc('preview_fertigation_recipe',{p_domain:domain,p_farm:farm,p_warehouse:warehouse,p_liters:liters,p_lines:checked})
    if(alive.current)setPreview(result)
  })}
  function open(recipe:Recipe){
    setFarm(recipe.farm_id);setName(recipe.name+' — copie');setNotes(recipe.notes);setLines(recipe.lines.map(l=>({stock_item_id:l.stock_item_id,dose:String(l.dose),dose_unit:l.dose_unit})));setWarehouse('');setPreview(null);setNotice('Recette chargée. Enregistrer crée une nouvelle recette sans modifier l’historique.');setError('')
  }
  return <div className="space-y-4">
    <Link href="/interventions" className="text-sm underline">← Interventions culturales</Link>
    <PageHeader title="Recettes de fertigation" subtitle="Engrais et eau — préparation" icon={FlaskConical} iconColor="#16a34a" description="Concentrations par m³ de solution finale distribuée aux serres, et non par m³ de cuve mère." actions={<Button variant="ghost" disabled={busy} onClick={()=>run(load)}>Actualiser</Button>}/>
    <Card><p className="text-sm text-fg-secondary">Aucune dose par défaut : le responsable fertigation renseigne les concentrations et vérifie la compatibilité des mélanges. Les produits phytosanitaires conservent leur parcours dédié.</p></Card>
    {error&&<div role="alert" className="border border-danger/40 bg-danger/10 text-danger rounded p-3">{error}{/fertigation_workspace|schema cache/i.test(error)&&<p>Appliquer la migration 135A avant d’utiliser cet écran.</p>}</div>}
    {notice&&<p role="status" className="border rounded p-3">{notice}</p>}
    {data&&<>
      <Card><h2 className="font-semibold mb-3">Préparer une recette</h2>
        <fieldset disabled={busy||frozen} className="space-y-4 min-w-0">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">Ferme *<Select aria-label="Ferme *" value={farm} onChange={e=>{setFarm(e.target.value);setWarehouse('');setPreview(null)}}><option value="">Sélectionner une ferme</option>{data.farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</Select></label>
            <label className="block">Nom de la recette *<Input maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label>
          </div>
          <p className="text-sm">Seuls les articles actifs de catégorie « Engrais », non liés à un produit phyto, sont proposés. Les sacs ou bidons doivent avoir une unité de stock normalisée en kg, g, L ou mL. <Link className="underline" href="/stocks">Gérer les articles</Link>.</p>
          {lines.map((line,index)=>{
            const item=data.items.find(i=>i.id===line.stock_item_id);const allowed=compatibleDoseUnits(item?.unit||'')
            let quantity='—';try{quantity=waterFormat(fertigationQuantity(volume,line.dose,line.dose_unit,item?.unit||''))+' '+item?.unit}catch{}
            return <div key={index} className="border rounded p-3 space-y-2">
              <div className="grid gap-3 md:grid-cols-3">
                <label className="block min-w-0">Engrais {index+1} *<Select aria-label={`Engrais ${index+1} *`} value={line.stock_item_id} onChange={e=>{const selected=data.items.find(i=>i.id===e.target.value);update(index,{stock_item_id:e.target.value,dose_unit:compatibleDoseUnits(selected?.unit||'')[0]||'kg_m3'})}}><option value="">Sélectionner un engrais</option>{data.items.map(i=><option key={i.id} value={i.id} disabled={!compatibleDoseUnits(i.unit).length||lines.some((l,j)=>j!==index&&l.stock_item_id===i.id)}>{i.name} ({i.unit}){!compatibleDoseUnits(i.unit).length?' — unité à normaliser':''}</option>)}</Select></label>
                <label className="block">Concentration {index+1} *<Input inputMode="decimal" value={line.dose} onChange={e=>update(index,{dose:e.target.value})}/></label>
                <label className="block">Unité de concentration {index+1}<Select aria-label={`Unité de concentration ${index+1}`} value={line.dose_unit} disabled={!item||!allowed.length} onChange={e=>update(index,{dose_unit:e.target.value as FertigationDoseUnit})}>{(allowed.length?allowed:['kg_m3'] as FertigationDoseUnit[]).map(u=><option key={u} value={u}>{fertigationDoseUnits[u]}</option>)}</Select></label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm">Besoin estimé pour le volume saisi : {quantity}</p><Button variant="ghost" disabled={lines.length===1} onClick={()=>{setLines(lines.filter((_,i)=>i!==index));setPreview(null)}}>Retirer l’engrais {index+1}</Button></div>
            </div>
          })}
          <Button variant="ghost" disabled={lines.length>=30} onClick={()=>{setLines([...lines,blankLine()]);setPreview(null)}}>Ajouter un engrais</Button>
          <label className="block">Consignes de préparation et observations<Textarea maxLength={4000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
        </fieldset>
        {!canPrepare&&farm&&<p className="text-sm my-3">L’enregistrement exige l’habilitation « Préparer les recettes de fertigation » sur cette ferme.</p>}
        <Button className="mt-3" disabled={busy||!canPrepare} onClick={save}>{busy?'Traitement…':frozen?'Réessayer le même enregistrement':'Enregistrer la recette'}</Button>
        {frozen&&<p className="text-sm mt-2">Saisie conservée pour une nouvelle tentative avec le même identifiant. Vous pouvez actualiser la liste pour vérifier si elle a été enregistrée.</p>}
      </Card>
      <Card><h2 className="font-semibold mb-3">Simuler le besoin et consulter le stock</h2>
        <fieldset disabled={busy||frozen} className="grid gap-4 md:grid-cols-2 min-w-0">
          <label className="block">Volume global de solution finale (L) *<Input inputMode="decimal" value={volume} onChange={e=>{setVolume(e.target.value);setPreview(null)}}/></label>
          <label className="block">Entrepôt de la ferme *<Select aria-label="Entrepôt de la ferme *" value={warehouse} onChange={e=>{setWarehouse(e.target.value);setPreview(null)}}><option value="">Sélectionner un entrepôt</option>{data.warehouses.filter(w=>w.farm_id===farm).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</Select></label>
        </fieldset>
        <p className="text-sm my-3">Quantité = volume final en m³ × concentration, puis conversion vers l’unité de stock. Le stock affiché est le solde actuel de cet entrepôt, sans déduction des besoins futurs. Aucune réservation ni sortie.</p>
        <Button disabled={busy||frozen||!farm} onClick={simulate}>Calculer et vérifier le stock</Button>
        {preview&&<div className="mt-3 space-y-2"><p className="text-sm">Situation au {new Date(preview.calculated_at).toLocaleString('fr-FR')}. Affichage à deux décimales, calcul conservé à quatre.</p>{preview.lines.map((l:any)=><div key={l.stock_item_id} className="border rounded p-3"><strong>{l.name}</strong><p title={`Quantité calculée : ${l.quantity} ${l.stock_unit}`}>Besoin : {waterFormat(l.quantity)} {l.stock_unit} · Stock actuel : {waterFormat(l.available)} {l.stock_unit}</p>{Number(l.missing)>0?<p className="text-amber-700">À approvisionner : {waterFormat(l.missing)} {l.stock_unit}{Number(l.missing)<.01?' (manque inférieur à 0,01)':''}. Vous pouvez enregistrer la recette malgré ce manque.</p>:<p>Solde actuel suffisant pour cette simulation seule.</p>}</div>)}</div>}
      </Card>
      <Card><h2 className="font-semibold mb-3">Recettes enregistrées {farm?'de la ferme':'du client'}</h2><p className="text-sm mb-3">Conservation de l’auteur, de la date et des unités. Une copie ne modifie jamais la recette d’origine.</p>{data.recipes.filter(r=>!farm||r.farm_id===farm).map(r=><div key={r.id} className="border-b py-3"><strong>{r.name}</strong><p className="text-sm">{data.farms.find(f=>f.id===r.farm_id)?.name} · {new Date(r.created_at).toLocaleString('fr-FR')} · {r.lines.length} engrais</p><Button variant="ghost" disabled={busy||frozen} onClick={()=>open(r)}>Charger / copier {r.name}</Button></div>)}{!data.recipes.filter(r=>!farm||r.farm_id===farm).length&&<p>Aucune recette enregistrée.</p>}</Card>
    </>}
  </div>
}
