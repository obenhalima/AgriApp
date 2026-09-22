'use client'

import {useCallback,useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {FlaskConical,RefreshCw,BookOpen,Package,Droplets,Plus,Info,CheckCircle2,Trash2} from 'lucide-react'
import {useAuth} from '@/lib/auth'
import {supabase} from '@/lib/supabase'
import {withDeadline} from '@/lib/withDeadline'
import {decimal,waterFormat} from '@/lib/irrigation'
import {compatibleDoseUnits,fertigationDoseUnits,fertigationQuantity,type FertigationLine,type FertigationDoseUnit} from '@/lib/fertigation'
import {PageHeader} from '@/components/ui/PageHeader'
import {KPICard} from '@/components/ui/KPICard'
import styles from './fertigation.module.css'
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
  const [recipeSearch,setRecipeSearch]=useState('')
  const [simulationRecipe,setSimulationRecipe]=useState('')

  const errorRef=useRef<HTMLDivElement>(null)
  useEffect(()=>{if(error){errorRef.current?.scrollIntoView({behavior:'smooth',block:'center'});errorRef.current?.focus({preventScroll:true})}},[error])
  const recipeMatches=(r:Recipe)=>(!farm||r.farm_id===farm)&&r.name.toLocaleLowerCase('fr').includes(recipeSearch.toLocaleLowerCase('fr'))
  const pending=useRef<{id:string;input:Record<string,unknown>}|null>(null),alive=useRef(true),working=useRef(false),serial=useRef(0)
  const load=useCallback(async()=>{const n=++serial.current;const next=await rpc('fertigation_workspace',{p_domain:domain});if(alive.current&&n===serial.current)setData(next)},[domain])
  useEffect(()=>{alive.current=true;void load().catch(e=>{if(alive.current)setError(e.message)});return()=>{alive.current=false;serial.current++}},[load])
  async function run(work:()=>Promise<void>){if(working.current)return;working.current=true;setBusy(true);setError('');setNotice('');try{await work()}catch(e:any){if(alive.current)setError(e.message||'Opération impossible')}finally{working.current=false;if(alive.current)setBusy(false)}}
  const canPrepare=!!data?.farms.find(f=>f.id===farm)?.can_prepare
  function validatedLines(){
    if(!farm||!lines.length)throw new Error('Sélectionnez la ferme et au moins un engrais.')
    if(new Set(lines.map(l=>l.stock_item_id)).size!==lines.length)throw new Error('Un engrais ne peut apparaître qu’une fois.')
    return lines.map((l,index)=>{const item=data?.items.find(i=>i.id===l.stock_item_id);if(!item)throw new Error(`Engrais ${index+1} : choisissez un article dans la recette, ou rechargez une recette enregistrée dans le choix de solution.`);fertigationQuantity(1000,l.dose,l.dose_unit,item.unit);return {...l,dose:decimal(l.dose)}})
  }
  function update(index:number,patch:Partial<FertigationLine>){setSimulationRecipe('');setPreview(null);setLines(lines.map((l,i)=>i===index?{...l,...patch}:l))}
  async function save(){await run(async()=>{
    if(!pending.current){
      if(name.trim().length<3)throw new Error('Donnez un nom de trois caractères minimum à la recette.')
      const checked=validatedLines()
      pending.current={id:crypto.randomUUID(),input:{domain_id:domain,farm_id:farm,name:name.trim(),notes,basis:'final_solution',lines:checked}}
      setFrozen(true)
    }
    await rpc('save_fertigation_recipe',{p_id:pending.current.id,p_input:pending.current.input})
    const savedId=pending.current.id
    pending.current=null
    if(alive.current){setFrozen(false);setPreview(null);setNotice('Recette enregistrée. Elle est sélectionnée pour la simulation ci-dessous. Aucun stock consommé.');await load();setSimulationRecipe(savedId)}
  })}
  async function simulate(){await run(async()=>{
    const recipe=simulationRecipe?data?.recipes.find(r=>r.id===simulationRecipe&&r.farm_id===farm):null
    if(simulationRecipe&&!recipe)throw new Error('Cette recette n’est plus disponible pour la ferme sélectionnée.')
    const checked=validatedLines();const liters=decimal(volume)
    if(liters<=0)throw new Error('Renseignez un volume de solution finale supérieur à zéro.')
    if(!warehouse)throw new Error('Sélectionnez l’entrepôt de la ferme dont vous souhaitez vérifier le stock.')
    const result=await rpc('preview_fertigation_recipe',{p_domain:domain,p_farm:farm,p_warehouse:warehouse,p_liters:liters,p_lines:checked})
    if(alive.current)setPreview(result)
  })}
  function chooseRecipe(id:string){
    const recipe=data?.recipes.find(r=>r.id===id&&r.farm_id===farm)
    setSimulationRecipe(recipe?.id||'');setPreview(null);setError('');setNotice('')
    setName(recipe?.name||'');setNotes(recipe?.notes||'');setLines(recipe?recipe.lines.map(l=>({...l,dose:String(l.dose)})):[blankLine()])
  }
  function open(recipe:Recipe){
    setSimulationRecipe('')
    setFarm(recipe.farm_id);setName(recipe.name+' — copie');setNotes(recipe.notes);setLines(recipe.lines.map(l=>({stock_item_id:l.stock_item_id,dose:String(l.dose),dose_unit:l.dose_unit})));setWarehouse('');setPreview(null);setNotice('Recette chargée. Enregistrer crée une nouvelle recette sans modifier l’historique.');setError('');document.getElementById('recipe-preparation')?.scrollIntoView({behavior:'smooth',block:'start'})
  }
  return <div className={`${styles.page} space-y-5`}>
    <Link href="/interventions" className="text-sm underline">← Interventions culturales</Link>
    <PageHeader title="Recettes de fertigation" subtitle="Engrais et eau — préparation" icon={FlaskConical} iconColor="#16a34a" description="Préparez vos recettes d’engrais et vérifiez les besoins avant de planifier une intervention." actions={<Button variant="secondary" disabled={busy} onClick={()=>run(load)}><RefreshCw size={15}/>Actualiser</Button>}/>
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-raised p-4 text-sm text-fg-secondary"><Info size={19} className="mt-0.5 shrink-0 text-brand"/><p>Les concentrations s’appliquent à la <strong>solution finale distribuée aux serres</strong>, pas à la cuve mère. Enregistrer une recette ne planifie aucune intervention et ne consomme aucun stock.</p></div>
    <nav aria-label="Parcours fertigation" className="flex flex-wrap gap-2"><a href="#recipe-preparation" className="btn btn-secondary">Préparer et vérifier</a><Link href="/interventions/programmes?family=fertigation" className="btn btn-secondary">Suivre les interventions</Link><a href="#recipe-library" className="btn btn-secondary">Bibliothèque de recettes</a></nav>
    {error&&<div ref={errorRef} tabIndex={-1} role="alert" className="border border-danger/40 bg-danger/10 text-danger rounded p-3">{error}{/fertigation_workspace|schema cache/i.test(error)&&<p>Appliquer la migration 135A avant d’utiliser cet écran.</p>}</div>}
    {notice&&<p role="status" className="flex items-start gap-3 rounded-xl border border-border bg-success-dim p-4 text-sm"><CheckCircle2 size={19} className="shrink-0 text-success"/>{notice}</p>}
    {!data&&!error&&<Card><p className="text-sm text-fg-secondary">Chargement des fermes, engrais et recettes…</p></Card>}
    {data&&<>
      <div className="grid gap-3 sm:grid-cols-3"><KPICard label="Recettes enregistrées" value={data.recipes.filter(r=>!farm||r.farm_id===farm).length} sub={farm?data.farms.find(f=>f.id===farm)?.name:'Toutes les fermes du client'} icon={BookOpen} accent="#16a34a" variant="compact"/><KPICard label="Engrais au catalogue" value={data.items.length} sub="Articles proposés pour la préparation" icon={Package} accent="#0ea5e9" variant="compact"/><KPICard label="Volume à simuler" value={(()=>{try{return volume&&decimal(volume)>0?waterFormat(decimal(volume)):'—'}catch{return '—'}})()} sub="Litres de solution finale" icon={Droplets} accent="#06b6d4" variant="compact"/></div>
      <section id="recipe-preparation" className="scroll-mt-24"><Card><h2 className="mb-1 flex items-center gap-2 text-lg font-semibold"><FlaskConical size={20} className="text-success"/>Préparer une recette</h2><p className="mb-5 text-sm text-fg-tertiary">Choisissez la ferme et une solution, indiquez le volume et vérifiez le stock dans ce même espace.</p>
        <fieldset disabled={busy||frozen} className="space-y-4 min-w-0">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">Ferme *<Select aria-label="Ferme *" value={farm} onChange={e=>{setFarm(e.target.value);setWarehouse('');chooseRecipe('');setPreview(null)}}><option value="">Sélectionner une ferme</option>{data.farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</Select></label>
            <label className="block">Nom de la recette *<Input maxLength={160} value={name} onChange={e=>{setName(e.target.value);setSimulationRecipe('')}}/></label>
          </div>
          <label className="block">Solution à simuler<Select aria-label="Solution à simuler" disabled={busy||frozen} value={simulationRecipe} onChange={e=>chooseRecipe(e.target.value)}><option value="">Nouvelle recette / saisie en cours</option>{data.recipes.filter(r=>r.farm_id===farm).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</Select></label>
          <div id="recipe-stock" className="scroll-mt-24">        <fieldset disabled={busy||frozen} className="grid gap-4 md:grid-cols-2 min-w-0">
          <label className="block">Volume global de solution finale (L) *<Input inputMode="decimal" value={volume} onChange={e=>{setVolume(e.target.value);setPreview(null)}}/></label>
          <label className="block">Entrepôt de la ferme *<Select aria-label="Entrepôt de la ferme *" value={warehouse} onChange={e=>{setWarehouse(e.target.value);setPreview(null)}}><option value="">Sélectionner un entrepôt</option>{data.warehouses.filter(w=>w.farm_id===farm).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</Select></label>
        </fieldset>
</div>
          <Button disabled={busy||frozen||!farm} onClick={simulate}>{busy?'Calcul en cours…':'Calculer et vérifier le stock'}</Button>
          <p className="text-xs text-fg-tertiary">Vérification du stock actuel, sans réservation ni consommation. Les résultats apparaissent sous chaque engrais.</p>
          <details className="rounded-lg border border-border bg-surface-input p-3"><summary className="cursor-pointer text-sm font-medium text-fg-secondary">Quels engrais puis-je utiliser ?</summary><p className="mt-2 text-sm text-fg-secondary">Aucune dose par défaut : le responsable vérifie les concentrations et la compatibilité des mélanges. Seuls les articles actifs de catégorie « Engrais », non liés à un produit phyto, sont proposés. Les sacs ou bidons doivent avoir une unité de stock normalisée en kg, g, L ou mL. <Link className="underline" href="/stocks">Gérer les articles</Link>.</p></details>
          {lines.map((line,index)=>{
            const item=data.items.find(i=>i.id===line.stock_item_id);const allowed=compatibleDoseUnits(item?.unit||'')
            const result=preview?.lines.find((l:any)=>l.stock_item_id===line.stock_item_id)
            let quantity='—';try{quantity=waterFormat(fertigationQuantity(volume,line.dose,line.dose_unit,item?.unit||''))+' '+item?.unit}catch{}
            return <div key={index} className="rounded-xl border border-border bg-surface-input p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">Engrais {index+1}</strong><Button variant="secondary" className="text-danger" aria-label={`Supprimer l’engrais ${index+1}`} onClick={()=>{setSimulationRecipe('');setLines(current=>current.filter((_,i)=>i!==index));setPreview(null)}}><Trash2 size={15}/>Supprimer</Button></div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="block min-w-0">Engrais {index+1} *<Select aria-label={`Engrais ${index+1} *`} value={line.stock_item_id} onChange={e=>{const selected=data.items.find(i=>i.id===e.target.value);update(index,{stock_item_id:e.target.value,dose_unit:compatibleDoseUnits(selected?.unit||'')[0]||'kg_m3'})}}><option value="">Sélectionner un engrais</option>{data.items.map(i=><option key={i.id} value={i.id} disabled={!compatibleDoseUnits(i.unit).length||lines.some((l,j)=>j!==index&&l.stock_item_id===i.id)}>{i.name} ({i.unit}){!compatibleDoseUnits(i.unit).length?' — unité à normaliser':''}</option>)}</Select></label>
                <label className="block">Concentration {index+1} *<Input inputMode="decimal" value={line.dose} onChange={e=>update(index,{dose:e.target.value})}/></label>
                <label className="block">Unité de concentration {index+1}<Select aria-label={`Unité de concentration ${index+1}`} value={line.dose_unit} disabled={!item||!allowed.length} onChange={e=>update(index,{dose_unit:e.target.value as FertigationDoseUnit})}>{(allowed.length?allowed:['kg_m3'] as FertigationDoseUnit[]).map(u=><option key={u} value={u}>{fertigationDoseUnits[u]}</option>)}</Select></label>
              </div>
              <p className="text-sm">Besoin estimé pour le volume saisi : {quantity}</p>
              {result&&<div className="rounded-lg border border-border bg-surface-raised p-3 text-sm" role="status"><p>Stock actuel : {waterFormat(result.available)} {result.stock_unit} · Besoin : {waterFormat(result.quantity)} {result.stock_unit}</p>{Number(result.missing)>0?<p className="font-semibold text-warning">À approvisionner : {waterFormat(result.missing)} {result.stock_unit}{Number(result.missing)<.01?' (manque inférieur à 0,01)':''}</p>:<p className="text-success">Stock suffisant pour cette simulation.</p>}</div>}
            </div>
          })}
          {!lines.length&&<p className="text-sm text-fg-secondary">Aucun engrais dans cette recette. Ajoutez au moins un engrais avant de l’enregistrer ou de simuler le besoin.</p>}
          <Button variant="ghost" disabled={lines.length>=30} onClick={()=>{setSimulationRecipe('');setLines([...lines,blankLine()]);setPreview(null)}}><Plus size={15}/>Ajouter un engrais</Button>
          <label className="block">Consignes de préparation et observations<Textarea maxLength={4000} value={notes} onChange={e=>{setNotes(e.target.value);setSimulationRecipe('')}}/></label>
        </fieldset>
        {!canPrepare&&farm&&<p className="text-sm my-3">L’enregistrement exige l’habilitation « Préparer les recettes de fertigation » sur cette ferme.</p>}
        <Button variant="secondary" className="mt-3" disabled={busy||!canPrepare||!!simulationRecipe} onClick={save}>{busy?'Traitement…':frozen?'Réessayer le même enregistrement':'Enregistrer la recette'}</Button>
        {simulationRecipe&&<Link className="btn btn-primary ml-2 mt-3" href={'/interventions/programmes?'+new URLSearchParams({domain,family:'fertigation',recipe:simulationRecipe,volume,warehouse}).toString()}>Planifier cette solution</Link>}
        {!simulationRecipe&&<p className="mt-2 text-xs text-fg-tertiary">La simulation ne nécessite pas d’enregistrement. Pour planifier, enregistrez d’abord la recette.</p>}
        {frozen&&<p className="text-sm mt-2">Saisie conservée pour une nouvelle tentative avec le même identifiant. Vous pouvez actualiser la liste pour vérifier si elle a été enregistrée.</p>}
      </Card></section>
      <section id="recipe-library" className="scroll-mt-24"><Card><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><BookOpen size={20} className="text-success"/>Recettes enregistrées {farm?'de la ferme':'du client'}</h2><Input aria-label="Rechercher une recette" placeholder="Rechercher une recette…" className="max-w-xs" value={recipeSearch} onChange={e=>setRecipeSearch(e.target.value)}/></div><p className="text-sm mb-3">Conservation de l’auteur, de la date et des unités. Une copie ne modifie jamais la recette d’origine.</p>{data.recipes.filter(recipeMatches).map(r=><div key={r.id} className="rounded-lg border border-border mb-3 p-4"><strong>{r.name}</strong><p className="text-sm">{data.farms.find(f=>f.id===r.farm_id)?.name} · {new Date(r.created_at).toLocaleString('fr-FR')} · {r.lines.length} engrais</p><div className="mt-3 flex flex-wrap gap-2"><Link className="btn btn-primary" aria-label={`Planifier ${r.name}`} href={'/interventions/programmes?'+new URLSearchParams({domain,family:'fertigation',recipe:r.id}).toString()}>Planifier cette solution</Link><Button variant="ghost" disabled={busy||frozen} onClick={()=>open(r)}>Charger / copier {r.name}</Button></div></div>)}{!data.recipes.filter(recipeMatches).length&&<p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-fg-tertiary">{recipeSearch?'Aucune recette ne correspond à votre recherche.':'Aucune recette enregistrée. Préparez votre première recette ci-dessus.'}</p>}</Card></section>
    </>}
  </div>
}
