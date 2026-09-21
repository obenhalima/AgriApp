export function harvestPeopleMetrics(kg:number,count:number|null,hours:number|null,fullDay:boolean,target:number|null){
  const perPerson=count&&count>0?kg/count:null
  return {perPerson,perHour:perPerson!=null&&hours&&hours>0?perPerson/hours:null,
    attainment:fullDay&&perPerson!=null&&target&&target>0?perPerson/target*100:null}
}
export function harvestPeopleInput(form:any){
  const count=form.harvest_people===''||form.harvest_people==null?null:Number(form.harvest_people)
  const hours=form.harvest_hours===''||form.harvest_hours==null?null:Number(form.harvest_hours)
  if(count!=null&&(!Number.isInteger(count)||count<1||count>10000))throw new Error('Effectif : renseignez un nombre entier positif.')
  if(hours!=null&&(!Number.isFinite(hours)||hours<=0||hours>24||count==null))throw new Error('Les heures doivent être comprises entre 0 et 24, avec un effectif renseigné.')
  return {harvest_people:count,harvest_hours:hours,harvest_full_day:count!=null&&!!form.harvest_full_day}
}

export type HarvestPeopleRow={harvest_date:string;total_qty:number|string|null;harvest_people:number|null;harvest_full_day:boolean;harvest_person_target:number|string|null}
export function resolveHarvestPersonTarget(snapshot:number|string|null|undefined,farm:string|undefined,date:string,targets:{farm_id:string;effective_from:string;kg_per_person_day:number|string}[]){
 if(snapshot!=null)return {rate:Number(snapshot),derived:false}
 const applicable=targets.filter(t=>t.farm_id===farm&&t.effective_from<=date)
  .sort((a,b)=>b.effective_from.localeCompare(a.effective_from))[0]
 return {rate:applicable?Number(applicable.kg_per_person_day):null,derived:!!applicable}
}
export function harvestPeriodSummary(rows:HarvestPeopleRow[],period:'day'|'week'){
 const groups=new Map<string,{date:string;kg:number;expected:number;personDays:number;excluded:number;count:number;days:Set<string>}>()
 for(const r of rows){
  const d=new Date(`${r.harvest_date}T00:00:00Z`)
  if(!Number.isFinite(d.getTime()))continue
  if(period==='week')d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7)
  const date=d.toISOString().slice(0,10)
  const g=groups.get(date)||{date,kg:0,expected:0,personDays:0,excluded:0,count:0,days:new Set<string>()}
  const people=Number(r.harvest_people),target=Number(r.harvest_person_target),kg=Number(r.total_qty)
  if(r.harvest_full_day&&Number.isInteger(people)&&people>0&&Number.isFinite(target)&&target>0&&r.total_qty!=null&&Number.isFinite(kg)&&kg>=0){
   g.kg+=kg;g.expected+=people*target;g.personDays+=people;g.count++;g.days.add(r.harvest_date)
  }else g.excluded++
  groups.set(date,g)
 }
 return [...groups.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(g=>({
  ...g,days:g.days.size,actual:g.count?g.kg:null,objective:g.count?g.expected:null,
  attainment:g.expected>0?g.kg/g.expected*100:null,
  perPersonDay:g.personDays>0?g.kg/g.personDays:null,
  targetPerPersonDay:g.personDays>0?g.expected/g.personDays:null,
  gap:g.count?g.kg-g.expected:null
 }))
}
