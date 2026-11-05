import type {PerformanceData, PerformanceRow} from './farmPerformance'
import {explainCostVariance} from './costVariance'
import {supabase} from './supabase'

export async function analyzeCostVariance(a:PerformanceRow,b:PerformanceRow,data:PerformanceData,period:string,language:string,domainId:string,report=false) {
 const arithmetic=explainCostVariance(a,b,data)
 if(arithmetic.error) throw new Error('Comparaison non calculable')
 const row=(r:PerformanceRow)=>({name:r.name,area:r.area,kg:r.kg,direct:r.direct,shared:r.shared,categories:r.categories,open:r.open,plantings:data.plantings.filter(p=>r.plantingIds.includes(p.id)).map(p=>({metadata:data.metadata.find(m=>m.id===p.id)}))})
 const {data:{session}}=await supabase.auth.getSession()
 if(!session) throw new Error('Session expirée')
 const {data:domain,error:domainError}=await supabase.from('domains').select('currency').eq('id',domainId).single()
 if(domainError||!domain?.currency)throw new Error('Devise de référence indisponible')
 const {data:response,error}=await supabase.functions.invoke('ai-analyze-cpc',{body:{domainId,mode:'cost-variance',language,comparison:{currency:domain.currency,report,scope:'Deux serres sélectionnées uniquement, pas le domaine entier',period,reference:row(a),compared:row(b),arithmetic,missing:['Observations agronomiques terrain','Relevés irrigation et drainage','Interventions détaillées','Dates de première récolte','Confirmation de complétude des saisies']}}})
 if(error) throw new Error('Analyse IA indisponible : vérifier le déploiement de ai-analyze-cpc et sa configuration Gemini.')
 if(typeof response?.reply!=='string') throw new Error('Réponse IA vide')
 return {reply:response.reply,model:String(response.model||'Gemini')}
}
