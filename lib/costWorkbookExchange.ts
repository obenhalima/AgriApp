import { supabase } from './supabase'
import { COST_COLUMNS, type CostKind, type CostCatalog, type CostRow, type CostPlanEntry } from './costWorkbookPlan'
import { text } from './harvestMigration'
export async function costExchangeCatalog(domainId:string,domainName:string):Promise<CostCatalog> {
 async function all(make:()=>any){const rows:any[]=[];for(let start=0;;start+=500){const {data,error}=await make().order('id').range(start,start+499);if(error)throw error;rows.push(...data||[]);if(!data||data.length<500)return rows}}
 const [campaigns,farms,greenhouses,categories]=await Promise.all([
  all(()=>supabase.from('campaigns').select('id,code,name,farm_id').eq('domain_id',domainId)),all(()=>supabase.from('farms').select('id,code,name').eq('domain_id',domainId).eq('is_active',true)),
  all(()=>supabase.from('greenhouses').select('id,code,name,farm_id,exploitable_area,total_area,farms!inner(domain_id,code)').eq('farms.domain_id',domainId)),
  all(()=>supabase.from('account_categories').select('id,code,label,parent_id,type,is_active')),
 ])
 return {domainId,domainName,campaigns:campaigns.map(c=>({...c,label:`${c.code} — ${c.name}`})),farms:farms.map(f=>({...f,label:`${f.code} — ${f.name}`})),greenhouses:greenhouses.map(g=>({id:g.id,label:`${g.farms.code}/${g.code} — ${g.name}`,farm_id:g.farm_id,area:Number(g.exploitable_area||g.total_area||0)})),categories:categories.filter(c=>c.is_active&&['charge_variable','charge_fixe','amortissement'].includes(c.type)&&!categories.some(child=>child.parent_id===c.id&&child.is_active)).map(c=>({id:c.id,code:c.code,label:`${c.code} — ${c.label}`,type:c.type,parent:categories.find(p=>p.id===c.parent_id)?.label||''}))}
}
export async function costExchangeTemplate(c:CostCatalog,kind:CostKind) {
 const ExcelJS=(await import('exceljs')).default,wb=new ExcelJS.Workbook();wb.creator='ItriX Farm'
 const guide=wb.addWorksheet('Mode emploi');guide.getColumn(1).width=110
 const lines=[`ItriX Farm — ${kind==='budget'?'Budget prévisionnel':'Coûts réels'} — ${c.domainName}`,
  'Ce modèle ne peut être importé que dans le parcours et le client indiqués. Référentiels au '+new Date().toISOString().slice(0,10)+'.',
  'Une référence unique et stable par coût source (ex. LOYER-2026-01). La conserver pour éviter de réimporter le même coût. Pas de formule dans les cellules de saisie.',
  'Choisir campagne, ferme et catégorie feuille dans les listes. Le référentiel indique type comptable, catégorie parente et sous-catégorie.',
  'Ponctuel : un montant, une date, une serre facultative. Mensuel : montant TOTAL à répartir, nombre de mois et règle temporelle.',
  'Mensuel : le montant est réparti, pas répété chaque mois. La date est ramenée au premier jour du mois. Prorata = jours calendaires de chaque mois entier.',
  'Par surface : ferme requise. Sélection = Toutes ou choix exacts de Ref_Serres séparés par ;. Mensuel × surface combine les deux répartitions.',
  'Surface utilisée = exploitable, sinon surface totale, comme dans le formulaire. L’aperçu est recalculé avec le référentiel actuel au contrôle.',
  'Sans serre, la charge reste au niveau de la campagne. Pour imputer à une ferme distincte, choisir une serre ou répartir par surface.',
  'Saisir les montants en MAD. Ne pas importer des coûts réels déjà générés par stocks, factures ou pointages : risque de double compte.',
  'Recharger, examiner les erreurs et le détail des écritures générées, puis confirmer explicitement. Aucun import au simple chargement du fichier.',
  'Même référence déjà importée : aucune nouvelle écriture. Un contenu modifié avec la même référence est refusé. Corriger l’écriture dans l’application.',
  'Ne pas modifier les onglets Ref_ ou les en-têtes. Les listes sont contrôlées contre la base lors de la lecture.',
 ]
 lines.forEach((v,i)=>{const r=guide.addRow([v]);r.height=44;r.alignment={wrapText:true};if(i===0)r.font={bold:true,size:16,color:{argb:'FF166534'}}})
 const meta=wb.addWorksheet('_couts');meta.addRow(['schema',1]);meta.addRow(['domain',c.domainId]);meta.addRow(['kind',kind]);meta.state='veryHidden'
 function ref(name:string,headers:string[],rows:(string|number)[][]){const s=wb.addWorksheet('Ref_'+name);s.columns=headers.map(h=>({header:h,width:35}));rows.forEach(r=>s.addRow(r));s.getRow(1).font={bold:true};s.views=[{state:'frozen',ySplit:1}];wb.definedNames.add(`'Ref_${name}'!$A$2:$A$${Math.max(2,rows.length+1)}`,'Cout_'+name)}
 ref('Campagnes',['Choix','Ferme de la campagne'],c.campaigns.map(x=>[x.label,c.farms.find(f=>f.id===x.farm_id)?.label||'Campagne multi-fermes']))
 ref('Fermes',['Choix'],c.farms.map(x=>[x.label]));ref('Serres',['Choix','Ferme','Surface m²'],c.greenhouses.map(x=>[x.label,c.farms.find(f=>f.id===x.farm_id)?.label||'',x.area]))
 ref('Categories',['Choix feuille','Type comptable','Catégorie parente'],c.categories.map(x=>[x.label,x.type,x.parent]))
 const s=wb.addWorksheet('Saisie');s.columns=COST_COLUMNS.map(([key,header])=>({header,key,width:['campaign','farm','category','greenhouse','selection'].includes(key)?45:25}));s.views=[{state:'frozen',ySplit:1,xSplit:1,showGridLines:false}];s.getRow(1).height=38;s.getRow(1).alignment={wrapText:true};s.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};s.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF166534'}}
 const lists:Record<string,string>={campaign:'Cout_Campagnes',farm:'Cout_Fermes',category:'Cout_Categories',greenhouse:'Cout_Serres',mode:'"Ponctuel,Mensuel,Par surface,Mensuel × surface"',distribution:'"Parts égales,Prorata des jours"'}
 for(let r=2;r<=501;r++) COST_COLUMNS.forEach(([key],i)=>{const cell=s.getCell(r,i+1);cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF9E6'}};if(lists[key])cell.dataValidation={type:'list',formulae:[lists[key]],allowBlank:true,showErrorMessage:true,errorStyle:'stop',error:'Choisir une valeur du référentiel.'};if(key==='date')cell.numFmt='dd/mm/yyyy';if(key==='amount')cell.numFmt='#,##0.00';if(key==='months')cell.dataValidation={type:'whole',operator:'between',formulae:[1,36],allowBlank:true,showErrorMessage:true,errorStyle:'stop',error:'Entre 1 et 36 mois.'}})
 s.autoFilter={from:'A1',to:'L501'}
 return new Blob([await wb.xlsx.writeBuffer() as ArrayBuffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
}
export async function readCostExchange(buffer:ArrayBuffer,domainId:string,kind:CostKind):Promise<CostRow[]> {
 const ExcelJS=(await import('exceljs')).default,wb=new ExcelJS.Workbook();await wb.xlsx.load(buffer)
 const meta=wb.getWorksheet('_couts');if(meta?.getCell('B1').value!==1||meta?.getCell('B2').value!==domainId||meta?.getCell('B3').value!==kind)throw Error('Fichier d’un autre client ou parcours Budget/Réel. Télécharger le bon modèle.')
 const s=wb.getWorksheet('Saisie');if(!s||s.rowCount>1001)throw Error('Onglet Saisie absent ou limite de 1 000 lignes dépassée.')
 COST_COLUMNS.forEach(([,h],i)=>{if(s.getCell(1,i+1).value!==h)throw Error('En-têtes modifiés : '+h)})
 const rows:CostRow[]=[]
 for(let r=2;r<=s.rowCount;r++){const row:CostRow={__row:r};let filled=false;COST_COLUMNS.forEach(([key],i)=>{const v=s.getCell(r,i+1).value;if(v&&typeof v==='object'&&!(v instanceof Date))throw Error(`Ligne ${r} : saisir des valeurs, pas de formule.`);row[key]=v instanceof Date?v.toISOString().slice(0,10):typeof v==='number'?key==='date'?new Date(Date.UTC(1899,11,30)+v*86400000).toISOString().slice(0,10):v:text(v);if(text(row[key]))filled=true});if(filled)rows.push(row)}return rows
}
async function hash(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(n=>n.toString(16).padStart(2,'0')).join('')}
async function uuid(s:string){const h=(await hash(s)).slice(0,32);return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20)}`}
/** One INSERT statement for the full batch. PKs are stable across retry, not based on file name. No upsert/overwrite. */
export async function commitCostPlan(entries:CostPlanEntry[]) {
 if(!entries.length||entries.length>5000)throw Error('Plan vide ou trop volumineux.')
 const groups=new Map<string,CostPlanEntry[]>();for(const e of entries){const key=e.ref;groups.set(key,[...groups.get(key)||[],e])}
 const inserts:any[]=[];let skipped=0
 for(const [ref,items] of groups) {
  const token=await hash(`${items[0].domain_id}:${items[0].is_planned}:${ref}`)
  const signature=await hash(JSON.stringify(items.map(({sourceRow,ref,...e})=>e)))
  const expected=await Promise.all(items.map(async({ref,sourceRow,...e},i)=>({...e,id:await uuid(`${token}:${i}`),description:`[XLS:${token}:${signature}] ${e.description}`})))
  const {data,error}=await supabase.from('cost_entries').select('id,description,amount,campaign_id,greenhouse_id,account_category_id,entry_date,is_planned').eq('domain_id',items[0].domain_id).like('description',`[XLS:${token}:%`).limit(5001)
  if(error)throw error
  if(data?.length){if(data.length!==expected.length||expected.some(e=>{const old=data.find(x=>x.id===e.id);return !old||['description','amount','campaign_id','greenhouse_id','account_category_id','entry_date','is_planned'].some(k=>String((old as any)[k])!==String((e as any)[k]))}))throw Error(`Référence ${ref} déjà importée avec un contenu différent ou modifié. Aucun nouvel import effectué.`);skipped+=data.length}
  else inserts.push(...expected)
 }
 if(inserts.length){const {error}=await supabase.from('cost_entries').insert(inserts);if(error)throw new Error(`Import non confirmé : ${error.message}. Recontrôler le même fichier avant toute relance.`)}
 return {inserted:inserts.length,skipped}
}
