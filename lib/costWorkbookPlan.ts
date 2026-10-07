import { validDate, number, text } from './harvestMigration'
export type CostKind='actual'|'budget'
export type CostCatalog={domainId:string;domainName:string;campaigns:{id:string;label:string;farm_id:string|null}[];farms:{id:string;label:string}[];greenhouses:{id:string;label:string;farm_id:string;area:number}[];categories:{id:string;label:string;code:string;type:string;parent:string}[]}
export type CostRow=Record<string,string|number>
export const COST_COLUMNS=[
 ['ref','Référence unique'],['campaign','Campagne'],['farm','Ferme'],['category','Catégorie ou sous-catégorie'],['mode','Mode'],['amount','Montant total (MAD)'],['date','Date ou début'],['months','Nombre de mois'],['distribution','Répartition mensuelle'],['greenhouse','Serre unique'],['selection','Serres de répartition'],['description','Description'],
] as const
export type CostPlanEntry={campaign_id:string;greenhouse_id:string|null;account_category_id:string;cost_category:string;amount:number;entry_date:string;description:string;is_planned:boolean;domain_id:string;ref:string;sourceRow:number}
/** Match the existing monthly semantics: full calendar months, first-of-month dates. */
function split(cents:number,weights:number[]) {
 const total=weights.reduce((a,b)=>a+b,0),parts=weights.map(w=>Math.round(cents*w/total))
 parts[parts.length-1]=cents-parts.slice(0,-1).reduce((a,b)=>a+b,0)
 if(parts.some(n=>n<0))throw Error('Montant trop faible pour cette répartition. Réduire le nombre de parts.')
 return parts
}
export function planCostRows(rows:CostRow[],catalog:CostCatalog,kind:CostKind) {
 const issues:{row:number;message:string}[]=[],entries:CostPlanEntry[]=[],seen=new Set<string>()
 for(const [index,r] of rows.entries()) {
  const row=Number(r.__row||index+2)
  try {
   for(const key of ['ref','campaign','category','mode','amount','date'])if(!text(r[key]))throw Error(`Champ obligatoire : ${COST_COLUMNS.find(c=>c[0]===key)?.[1]}`)
   const ref=text(r.ref);if(seen.has(ref))throw Error('Référence répétée. Une référence par coût source.');seen.add(ref)
   const campaign=catalog.campaigns.find(c=>c.label===r.campaign),category=catalog.categories.find(c=>c.label===r.category)
   if(!campaign||!category)throw Error('Campagne ou catégorie inconnue dans le référentiel actuel du client.')
   const farm=catalog.farms.find(f=>f.label===r.farm)
   if(text(r.farm)&&!farm)throw Error('Ferme inconnue pour ce client.')
   const mode=text(r.mode),monthly=['Mensuel','Mensuel × surface'].includes(mode),surface=['Par surface','Mensuel × surface'].includes(mode)
   if(!['Ponctuel','Mensuel','Par surface','Mensuel × surface'].includes(mode))throw Error('Mode inconnu.')
   const amount=number(r.amount);if(!Number.isFinite(amount)||amount<=0||amount>1e12)throw Error('Montant total invalide (doit être positif).')
   if(!validDate(r.date))throw Error('Date invalide : utiliser une date Excel ou AAAA-MM-JJ.')
   const months=monthly?number(r.months):1
   if(!Number.isInteger(months)||months<1||months>36)throw Error('Nombre de mois : entier entre 1 et 36.')
   if(monthly&&!['Parts égales','Prorata des jours'].includes(text(r.distribution)))throw Error('Choisir Parts égales ou Prorata des jours.')
   if(!monthly&&(text(r.months)||text(r.distribution)))throw Error('Retirer les options mensuelles pour ce mode.')
   if(surface&&!farm)throw Error('Ferme obligatoire pour une répartition par surface.')
   if(surface&&text(r.greenhouse))throw Error('Ne pas saisir une serre unique en mode surface : utiliser Serres de répartition.')
   if(!surface&&text(r.selection))throw Error('La sélection de serres nécessite un mode par surface.')
   let houses:CostCatalog['greenhouses']=[]
   if(surface) {
    const available=catalog.greenhouses.filter(g=>g.farm_id===farm!.id)
    if(text(r.selection)==='Toutes')houses=available
    else {const choices=text(r.selection).split(';').map(s=>s.trim()).filter(Boolean);if(!choices.length)throw Error('Indiquer Toutes ou les choix de serres séparés par ;.');if(new Set(choices).size!==choices.length)throw Error('Serre répétée dans la sélection.');houses=choices.map(choice=>{const g=available.find(g=>g.label===choice);if(!g)throw Error('Une serre sélectionnée est inconnue ou appartient à une autre ferme.');return g})}
    houses.sort((a,b)=>a.id.localeCompare(b.id))
    if(!houses.length||houses.some(g=>!Number.isFinite(g.area)||g.area<=0))throw Error('Chaque serre sélectionnée doit avoir une surface positive paramétrée.')
   } else if(text(r.greenhouse)) {
    const g=catalog.greenhouses.find(g=>g.label===r.greenhouse)
    if(!g||!farm||g.farm_id!==farm.id)throw Error('La serre unique doit appartenir à la ferme sélectionnée.')
    houses=[g]
   } else if(farm && campaign.farm_id!==farm.id) {
    throw Error('Sans serre, la charge est portée par la campagne, pas par une ferme distincte. Choisir une serre ou une répartition par surface.')
   }
   const start=new Date(text(r.date)+'T12:00:00Z')
   const periods=Array.from({length:months},(_,i)=>{const d=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+i,1));return {date:monthly?d.toISOString().slice(0,10):text(r.date),days:new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()}})
   const amounts=split(Math.round(amount*100),periods.map(p=>monthly&&r.distribution==='Prorata des jours'?p.days:1))
   periods.forEach((p,i)=>{
    const targets=houses.length?houses:[null],parts=surface?split(amounts[i],houses.map(g=>g.area)):[amounts[i]]
    targets.forEach((g,j)=>{if(parts[j]>0)entries.push({ref,sourceRow:row,domain_id:catalog.domainId,campaign_id:campaign.id,greenhouse_id:g?.id||null,account_category_id:category.id,cost_category:category.code.toLowerCase(),amount:parts[j]/100,entry_date:p.date,description:text(r.description),is_planned:kind==='budget'})})
   })
  }catch(e:any){issues.push({row,message:e.message})}
 }
 if(!rows.length)issues.push({row:2,message:'Aucune ligne à importer.'})
 if(entries.length>5000)issues.push({row:0,message:'Maximum 5 000 écritures générées par import. Fractionner le fichier.'})
 return {issues,entries,total:Math.round(entries.reduce((s,e)=>s+e.amount,0)*100)/100}
}
