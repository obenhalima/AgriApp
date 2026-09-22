import type {PlanGraphic} from './drawioFarmPlan'

// Palette inspired by farm 114, extended with manual circulation components. Schematic geometry only.
export const farmPlanPalette = [
 ['bassin','Bassin','#bae6fd',140,85,'ellipse'],
 ['irrigation','Station d’irrigation / fertigation','#a5f3fc',130,75,'rect'],
 ['traitement','Station de traitement','#ddd6fe',130,75,'rect'],
 ['chateau','Château d’eau','#7dd3fc',65,65,'ellipse'],
 ['dessalement','Dessalement (DSLM)','#cffafe',110,70,'rect'],
 ['magasin','Magasin / entrepôt','#fde68a',110,65,'rect'],
 ['atelier','Atelier','#fed7aa',100,65,'rect'],
 ['bureau','Bureau','#c7d2fe',85,55,'rect'],
 ['chambre','Chambre / logement','#fae8ff',80,55,'rect'],
 ['refectoire_f','Réfectoire femmes','#fbcfe8',120,65,'rect'],
 ['refectoire_h','Réfectoire hommes','#bfdbfe',120,65,'rect'],
 ['cuisine','Cuisine','#ffedd5',75,55,'rect'],
 ['toilette','Toilettes','#e2e8f0',55,45,'rect'],
 ['douche','Toilettes + douche','#e0f2fe',75,45,'rect'],
 ['moteur','Local moteur','#d1d5db',75,55,'rect'],
 ['parking','Parking / véhicules','#e5e7eb',120,75,'rect'],
 ['porte','Porte / entrée','#fcd34d',75,20,'rect'],
 ['entree','Entrée','#fbbf24',100,40,'arrow'],
 ['passage','Passage','#e2e8f0',120,35,'rect'],
 ['allee','Allée','#e7e5e4',240,30,'rect'],
 ['piste','Piste / voie publique','#d6d3d1',240,28,'rect'],
 ['cloture','Clôture / limite','#64748b',220,6,'rect'],
 ['fleche','Flèche / circulation','#94a3b8',100,35,'arrow'],
 ['texte','Texte libre','none',140,35,'rect'],
 ['zone','Zone libre','#dcfce7',120,80,'rect'],
] as const
export function newPlanGraphic(kind:string,id:string,index:number):PlanGraphic {
 const p=farmPlanPalette.find(p=>p[0]===kind)||farmPlanPalette[0]
 return normalizeGraphic({id,kind:p[0],label:p[1],shape:p[5],fill:p[2],stroke:kind==='texte'?'none':'#475569',fontColor:'#0f172a',fontSize:12,x:200+(index%5)*35,y:150+(index%5)*35,width:p[3],height:p[4],rotation:0})
}
export function normalizeGraphic(e:PlanGraphic):PlanGraphic {
 const safe=(v:number,f:number)=>Number.isFinite(v)?v:f
 const width=Math.max(1,Math.min(760,safe(e.width,100))),height=Math.max(1,Math.min(760,safe(e.height,60)))
 const rotation=((safe(e.rotation,0)%360)+360)%360,r=rotation*Math.PI/180
 const hx=(Math.abs(Math.cos(r))*width+Math.abs(Math.sin(r))*height)/2,hy=(Math.abs(Math.sin(r))*width+Math.abs(Math.cos(r))*height)/2
 const x=Math.max(hx,Math.min(1200-hx,safe(e.x,200))),y=Math.max(Math.min(hy,400),Math.min(800-Math.min(hy,400),safe(e.y,150)))
 const result={...e,x,y,width,height,rotation,fontSize:Math.max(3,Math.min(100,safe(e.fontSize,12))),label:e.label.slice(0,500)}
 if(e.shape==='line')result.points=[{x:Math.max(0,x-Math.cos(r)*width/2),y:Math.max(0,Math.min(800,y-Math.sin(r)*width/2))},{x:Math.min(1200,x+Math.cos(r)*width/2),y:Math.max(0,Math.min(800,y+Math.sin(r)*width/2))}]
 return result
}
