'use client'
import { useState } from 'react'
import { ExcelFarmPlan, importedShapes, matchPlan, readExcelFarmPlan } from '@/lib/farmPlanImport'
import type { FarmShape } from '@/lib/farmLayout'

type Props = { greenhouses: { id: string; code: string }[]; disabled: boolean; onApply: (shapes: FarmShape[]) => boolean }
export function ImportFarmPlan({ greenhouses, disabled, onApply }: Props) {
 const [plan,setPlan]=useState<ExcelFarmPlan|null>(null),[ids,setIds]=useState<string[]>([])
 const [loading,setLoading]=useState(false),[error,setError]=useState('')
 const rows=plan?.rectangles.map((r,i)=>({...r,greenhouse_id:ids[i]||''}))??[]
 const complete=!!rows.length&&rows.every(r=>r.greenhouse_id)&&new Set(ids).size===ids.length
 return <details className="rounded-xl border p-3">
  <summary className="cursor-pointer font-medium">Importer un plan Excel sans dessiner les serres</summary>
  <div className="space-y-3 pt-3">
   <p className="text-sm">Le premier onglet est lu sur cet appareil. Les cellules fusionnées nommées S1, S2… donnent la disposition des serres. Les surfaces officielles, cultures et stocks ne sont jamais modifiés. Les bâtiments et autres dessins ne sont pas importés dans cette première version.</p>
   <input type="file" accept=".xlsx" aria-label="Fichier du plan Excel" disabled={disabled||loading} onChange={async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return
    setLoading(true);setError('');setPlan(null);setIds([])
    try{
     if(!/\.xlsx$/i.test(file.name)||file.size>5*1024*1024)throw Error('Choisissez un fichier .xlsx de moins de 5 Mo.')
     const result=await readExcelFarmPlan(await file.arrayBuffer());setPlan(result);setIds(matchPlan(result,greenhouses).map(r=>r.greenhouse_id))
    }catch(e:any){setError(e.message||'Lecture du plan impossible.')}finally{setLoading(false)}
   }}/>
   {loading&&<p role="status">Lecture du premier onglet…</p>}
   {error&&<p role="alert" className="text-red-700">{error}</p>}
   {plan&&<>
    <p>{rows.length} serres détectées dans « {plan.sheet.trim()} » — {ids.filter(Boolean).length} rattachées à cette ferme.</p>
    <svg viewBox="0 0 1200 800" className="max-h-[560px] w-full rounded border bg-slate-50" aria-label="Aperçu du plan Excel">
     {rows.map(r=><g key={r.cell}><rect x={r.x-r.width/2} y={r.y-r.height/2} width={r.width} height={r.height} fill={r.greenhouse_id?'#d1fae5':'#fef3c7'} stroke="#475569"/><text x={r.x} y={r.y} textAnchor="middle" dominantBaseline="central" fontSize={12}>{r.code}</text></g>)}
    </svg>
    {!complete&&<p className="text-amber-800">Complétez les correspondances ci-dessous. Les serres absentes doivent d’abord être créées dans le référentiel avec leurs surfaces officielles. Aucune création fictive n’est effectuée.</p>}
    <div className="grid max-h-64 gap-2 overflow-auto sm:grid-cols-2">
     {rows.map((r,i)=><label key={r.cell} className="flex items-center gap-2 text-sm"><span className="w-14 shrink-0">{r.code}</span><select className="min-w-0 flex-1 rounded border p-2" aria-label={`Serre correspondant à ${r.code}`} disabled={disabled} value={ids[i]||''} onChange={e=>setIds(current=>current.map((id,j)=>j===i?e.target.value:id))}>
      <option value="">À rattacher</option>{greenhouses.map(g=><option key={g.id} value={g.id}>{g.code}</option>)}
     </select></label>)}
    </div>
    <button className="rounded bg-indigo-600 px-3 py-2 text-white disabled:opacity-40" disabled={disabled||!complete} onClick={()=>{
     try{if(onApply(importedShapes(rows,greenhouses.map(g=>g.id)))){setPlan(null);setError('')}}catch(e:any){setError(e.message)}
    }}>Utiliser cette disposition</button>
    <p className="text-xs text-slate-500">Un aperçu est préparé avant sauvegarde. Un plan existant n’est remplacé qu’après confirmation, puis « Enregistrer ».</p>
   </>}
  </div>
 </details>
}
