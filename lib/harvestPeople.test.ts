import {expect,it} from 'vitest'
import {harvestPeopleMetrics,harvestPeopleInput,harvestPeriodSummary,resolveHarvestPersonTarget} from './harvestPeople'
it('50000 kg / 5 personnes = 10000, sans heures inventées',()=>{
 expect(harvestPeopleMetrics(50000,5,null,true,10000)).toEqual({perPerson:10000,perHour:null,attainment:100})
})
it('ne compare pas une fraction de journée à un objectif journalier',()=>{
 expect(harvestPeopleMetrics(50000,5,5,false,10000)).toEqual({perPerson:10000,perHour:2000,attainment:null})
})
it('sans effectif ni objectif, pas de zéro trompeur',()=>{
 expect(harvestPeopleMetrics(50000,null,null,false,null)).toEqual({perPerson:null,perHour:null,attainment:null})
})
it('valide les effectifs et les heures facultatives',()=>{
 expect(harvestPeopleInput({harvest_people:'5'})).toEqual({harvest_people:5,harvest_hours:null,harvest_full_day:false})
 expect(()=>harvestPeopleInput({harvest_people:'2.5'})).toThrow()
 expect(()=>harvestPeopleInput({harvest_hours:'5'})).toThrow()
 expect(()=>harvestPeopleInput({harvest_people:'5',harvest_hours:'25'})).toThrow()
})
const daily=(date:string,kg=50000,people=5,target:number|null=10000,full=true)=>({harvest_date:date,total_qty:kg,harvest_people:people,harvest_person_target:target,harvest_full_day:full})
it('applique 800 à une récolte sans snapshot et obtient 125 % sans modifier son historique',()=>{
 const targets=[{farm_id:'sud',effective_from:'2026-09-21',kg_per_person_day:800}]
 const resolved=resolveHarvestPersonTarget(null,'sud','2026-09-21',targets)
 expect(resolved).toEqual({rate:800,derived:true})
 expect(harvestPeriodSummary([daily('2026-09-21',5000,5,resolved.rate)],'day')[0]).toMatchObject({expected:4000,attainment:125,gap:1000})
 expect(resolveHarvestPersonTarget(700,'sud','2026-09-21',targets)).toEqual({rate:700,derived:false})
 expect(resolveHarvestPersonTarget(null,'autre','2026-09-21',targets).rate).toBeNull()
 expect(resolveHarvestPersonTarget(null,'sud','2026-09-20',targets).rate).toBeNull()
 expect(resolveHarvestPersonTarget(null,'sud','2026-10-02',[...targets,{farm_id:'sud',effective_from:'2026-10-01',kg_per_person_day:900}]).rate).toBe(900)
})
it('cumule les objectifs journaliers et pondère les ratios',()=>{
 const [s]=harvestPeriodSummary([daily('2026-09-21'),daily('2026-09-22',10000,2,10000)],'week')
 expect(s.date).toBe('2026-09-21');expect(s.expected).toBe(70000);expect(s.kg).toBe(60000)
 expect(s.attainment).toBeCloseTo(60000/70000*100);expect(s.perPersonDay).toBeCloseTo(60000/7);expect(s.days).toBe(2)
})
it('sépare lundi de dimanche et franchit les années',()=>{
 expect(harvestPeriodSummary([daily('2026-09-20'),daily('2026-09-21')],'week').map(r=>r.date)).toEqual(['2026-09-14','2026-09-21'])
 expect(harvestPeriodSummary([daily('2027-01-01')],'week')[0].date).toBe('2026-12-28')
})
it('exclut les saisies incomplètes sans inventer zéro et conserve les objectifs historiques',()=>{
 const rows=harvestPeriodSummary([daily('2026-09-21',10,1,null),daily('2026-09-22',10,1,5,false),daily('2026-09-23',20,1,10)],'day')
 expect(rows[0].actual).toBeNull();expect(rows[1].objective).toBeNull();expect(rows[2].attainment).toBe(200)
 expect(harvestPeriodSummary([],'day')).toEqual([])
})
