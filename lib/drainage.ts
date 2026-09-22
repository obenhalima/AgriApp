/** Manual drainage readings. No agronomic defaults, no stock effects. */
export const drainageFields = ['dropVolume','dropEc','dropPh','drainVolume','drainEc','drainPh'] as const
export type DrainageField = typeof drainageFields[number]
export type DrainageReading = {
 manualPercent?:string;
 intervention?:{programId:string;occurrenceId:string;recipeId:string;products:unknown[]};
 id:string; greenhouse:string; time:string; status:'measured'|'not_taken';
 values:Record<DrainageField,string>; measuredBy:string; enteredBy:string; enteredAt:string;
 context:DrainageContext;
}
export type DrainageContext = {
 station:string; unit:''|'mL'|'L'; coefficient:string; validFrom:string;
 ecInstrument:string; ecCalibration:string; phInstrument:string; phCalibration:string;
 recipeVersion:string; planVersion:string;
}
export const emptyDrainageContext = ():DrainageContext => ({station:'',unit:'',coefficient:'',validFrom:'',ecInstrument:'',ecCalibration:'',phInstrument:'',phCalibration:'',recipeVersion:'',planVersion:''})
export const emptyDrainageValues = ():Record<DrainageField,string> => ({dropVolume:'',dropEc:'',dropPh:'',drainVolume:'',drainEc:'',drainPh:''})
export function drainageNumber(value:string):number|null {
 const normalized=value.trim().replace(/[\s\u00a0\u202f]/g,'').replace(',','.')
 if(!normalized||!/^\d+(?:\.\d+)?$/.test(normalized))return null
 const n=Number(normalized);return Number.isFinite(n)?n:null
}
export function drainageResult(row:DrainageReading,date:string){
 if(row.status==='not_taken')return {ratio:null,reason:'Relevé non effectué',input:null,drain:null}
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time))return {ratio:null,reason:'Date ou heure à renseigner',input:null,drain:null}
 const v=drainageNumber(row.values.dropVolume),d=drainageNumber(row.values.drainVolume),k=drainageNumber(row.context.coefficient)
 if(!row.context.unit)return {ratio:null,reason:'Unité à renseigner',input:null,drain:null}
 if(k===null||k<=0)return {ratio:null,reason:'Coefficient absent ou invalide',input:null,drain:null}
 if(!row.context.validFrom||row.context.validFrom>`${date}T${row.time}`)return {ratio:null,reason:'Coefficient non applicable à cet horaire',input:null,drain:null}
 if(v===null||v<=0||d===null)return {ratio:null,reason:'Volumes incomplets ou apport nul',input:null,drain:null}
 const scale=row.context.unit==='mL'?0.001:1,input=v*k*scale,drain=d*scale
 if(!Number.isFinite(input)||!Number.isFinite(drain)||input<=0||!Number.isFinite(100*drain/input))return {ratio:null,reason:'Volumes hors capacité de calcul',input:null,drain:null}
 return {ratio:100*drain/input,reason:'',input,drain}
}
export function drainageSummary(rows:DrainageReading[],date:string){
 let input=0,drain=0,valid=0,missing=0,incomplete=0
 const positive:string[]=[]
 for(const row of rows){
  if(row.status==='not_taken'){missing++;continue}
  const result=drainageResult(row,date)
  if(result.ratio===null){incomplete++;continue}
  input+=result.input!;drain+=result.drain!;valid++
  if(result.drain!>0)positive.push(row.time)
 }
 return {ratio:input>0?100*drain/input:null,valid,missing,incomplete,firstPositive:positive.sort()[0]||null}
}
export function drainageWarnings(row:DrainageReading){
 const warnings:string[]=[]
 if(row.status==='not_taken')return warnings
 for(const key of drainageFields){
  const value=row.values[key],n=drainageNumber(value)
  if(value&&n===null)warnings.push(`${key} : nombre positif ou nul requis`)
  if(key.endsWith('Ph')&&n!==null&&n>14)warnings.push(`${key} : pH hors intervalle 0–14, à vérifier`)
 }
 if(!row.context.ecInstrument||!row.context.phInstrument)warnings.push('Instruments non identifiés')
 if(!row.context.recipeVersion||!row.context.planVersion)warnings.push('Versions recette / plan non résolues : brouillon uniquement')
 return warnings
}
/** Manual entry mode: never fall back to a volume-derived percentage. */
export function manualDrainageResult(row:DrainageReading,_date:string){
 if(row.status==='not_taken')return {ratio:null,reason:'Relevé non effectué'}
 const ratio=drainageNumber(row.manualPercent||'')
 return {ratio,reason:ratio===null?(row.manualPercent?'Pourcentage positif ou nul requis':'Pourcentage non renseigné'):''}
}
export function manualDrainageSummary(rows:DrainageReading[],date:string){
 const measured=rows.filter(r=>r.status==='measured')
 const valid=measured.filter(r=>manualDrainageResult(r,date).ratio!==null)
 const ordered=valid.filter(r=>/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)).sort((a,b)=>a.time.localeCompare(b.time))
 const last=ordered.at(-1)
 return {ratio:last?manualDrainageResult(last,date).ratio:null,valid:valid.length,missing:rows.length-measured.length,incomplete:measured.length-valid.length,firstPositive:ordered.find(r=>manualDrainageResult(r,date).ratio!>0)?.time||null}
}
