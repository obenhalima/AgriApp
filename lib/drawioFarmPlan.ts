export type PlanGraphic = {
 id: string; label: string; kind: string; shape: 'rect'|'ellipse'|'arrow'|'line'|'image';
 x: number; y: number; width: number; height: number; rotation: number;
 fill: string; stroke: string; fontColor: string; fontSize: number;
 vertical?: boolean; image?: string; points?: {x:number;y:number}[]
}
export type DrawioGreenhouse = { source_id:string; code:string; x:number;y:number;width:number;height:number;rotation:number }
export type DrawioPlan = { name:string; greenhouses:DrawioGreenhouse[]; elements:PlanGraphic[]; warnings:string[] }
const MAX_XML=5*1024*1024
const color=(s:string|undefined,fallback:string)=>s==='none'||/^#[0-9a-f]{6}$/i.test(s||'')?s!:fallback
export function canonicalGreenhouseCode(s:string){return s.trim().toUpperCase().replace(/^SERRE\s*/,'S').replace(/^S[-\s]*0*(\d+)$/,'S$1')}
export function initialPlanLinks(plan:DrawioPlan,refs:{id:string;code:string}[]){
 return plan.greenhouses.map(g=>{const found=refs.filter(r=>canonicalGreenhouseCode(r.code)===canonicalGreenhouseCode(g.code));return found.length===1?found[0].id:''})
}
export function officialArea(text:string):number|null{
 const value=text.replace(/\s/g,'').replace(',','.')
 return /^\d+(?:\.\d{1,2})?$/.test(value)&&Number(value)>0&&Number(value)<100000000?Number(value):null
}
function plain(value:string){
 const textarea=document.createElement('textarea');textarea.innerHTML=value.replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]*>/g,' ')
 return textarea.value.replace(/\s+/g,' ').trim().slice(0,500)
}
function xmlDoc(text:string){
 if(text.length>MAX_XML||/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('Fichier XML non autorisé ou trop volumineux.')
 const doc=new DOMParser().parseFromString(text,'application/xml')
 if(doc.querySelector('parsererror'))throw Error('Le fichier draw.io est illisible.')
 return doc
}
async function decompress(text:string){
 if(!/^[A-Za-z0-9+/=\s]+$/.test(text))throw Error('Page compressée illisible.')
 const bytes=Uint8Array.from(atob(text.replace(/\s/g,'')),c=>c.charCodeAt(0))
 let stream:ReadableStream<Uint8Array>
 try{stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))}catch{throw Error('Exportez le diagramme en XML non compressé depuis draw.io pour ce navigateur.')}
 const reader=stream.getReader(),parts:Uint8Array[]=[];let length=0
 try{while(true){const next=await reader.read();if(next.done)break;length+=next.value.byteLength;if(length>MAX_XML){await reader.cancel();throw Error('Page décompressée trop volumineuse.')}parts.push(next.value)}}finally{reader.releaseLock()}
 const result=new Uint8Array(length);let pos=0;for(const p of parts){result.set(p,pos);pos+=p.length}
 return decodeURIComponent(new TextDecoder().decode(result))
}

export async function readDrawioPlan(text:string):Promise<DrawioPlan>{
 let doc=xmlDoc(text),name='Plan',warnings:string[]=[]
 const pages=Array.from(doc.querySelectorAll('mxfile > diagram'))
 if(pages.length){
  name=pages[0].getAttribute('name')||'Plan'
  if(pages.length>1)warnings.push('Seule la première page du fichier est importée.')
  if(!pages[0].querySelector('mxGraphModel'))doc=xmlDoc(await decompress(pages[0].textContent||''))
  else doc=xmlDoc(new XMLSerializer().serializeToString(pages[0].querySelector('mxGraphModel')!))
 }
 const model=doc.querySelector('mxGraphModel > root')
 if(!model)throw Error('Ce fichier ne contient pas de plan draw.io.')
 const cells=new Map<string,Element>(),meta=new Map<string,Element>()
 for(const entry of Array.from(model.children)){
  const cell=entry.tagName==='mxCell'?entry:entry.querySelector(':scope > mxCell')
  const id=entry.getAttribute('id')||cell?.getAttribute('id')
  if(!cell||!id)continue
  if(cells.has(id))throw Error('Identifiant de dessin dupliqué.')
  cells.set(id,cell);meta.set(id,entry)
 }
 if(cells.size>2000)throw Error('Maximum 2 000 éléments par fichier.')
 const style=(cell:Element)=>Object.fromEntries((cell.getAttribute('style')||'').split(';').map(s=>{const i=s.indexOf('=');return i<0?[s,'1']:[s.slice(0,i),s.slice(i+1)]})) as Record<string,string>
 const n=(e:Element|null,k:string,fallback=0)=>{const value=Number(e?.getAttribute(k)??fallback);if(!Number.isFinite(value)||Math.abs(value)>1e7)throw Error('Coordonnées invalides.');return value}
 const position=(id:string,trail=new Set<string>()):{x:number;y:number;hidden:boolean}=>{
  if(trail.has(id)||trail.size>30)throw Error('Groupes de dessin circulaires ou trop imbriqués.')
  const cell=cells.get(id);if(!cell)return {x:0,y:0,hidden:false}
  trail.add(id)
  const parent=cell.getAttribute('parent'),ancestor=parent?position(parent,trail):{x:0,y:0,hidden:false}
  const g=cell.querySelector(':scope > mxGeometry'),s=style(cell)
  if(g?.getAttribute('relative')==='1'&&cell.getAttribute('vertex')==='1')throw Error('Les formes à position relative doivent être dégroupées dans draw.io.')
  if(parent){const p=cells.get(parent);if(p&&Number(style(p).rotation||0)!==0)throw Error('Dégroupez les groupes tournés avant import.')}
  return {x:ancestor.x+n(g,'x'),y:ancestor.y+n(g,'y'),hidden:ancestor.hidden||cell.getAttribute('visible')==='0'||s.visible==='0'}
 }
 const greenhouses:DrawioGreenhouse[]=[],elements:PlanGraphic[]=[];let picturesSize=0
 for(const [id,cell] of cells){
  if(cell.getAttribute('vertex')!=='1'&&cell.getAttribute('edge')!=='1')continue
  const p=position(id);if(p.hidden)continue
  const g=cell.querySelector(':scope > mxGeometry'),s=style(cell),m=meta.get(id)!
  if(s.group==='1'||s.container==='1'||s.shape==='group')continue
  const label=plain(m.getAttribute('label')??cell.getAttribute('value')??'')
  const kind=m.getAttribute('fp_type')||'decoration'
  const isGreenhouse=kind==='serre'||(!m.hasAttribute('fp_type')&&/^(?:S[-\s]*\d+|Serre\s*\d+)$/i.test(label))
  const code=plain(m.getAttribute('fp_code')||label)
  let width=n(g,'width'),height=n(g,'height'),rotation=((Number(s.rotation||0)%360)+360)%360
  if(!Number.isFinite(rotation))throw Error('Rotation invalide.')
  if(isGreenhouse){
   if(!code||code.length>50)throw Error('Code de serre manquant ou trop long.')
   if(m.getAttribute('fp_code')&&/^(?:S[-\s]*\d+|Serre\s*\d+)$/i.test(label)&&canonicalGreenhouseCode(code)!==canonicalGreenhouseCode(label))throw Error(`Le libellé ${label} et le code interne ${code} diffèrent. Corrigez les données de cette forme dans draw.io.`)
   if(![0,90,180,270].includes(rotation)||(s.shape&&!['rectangle','rect'].includes(s.shape)))throw Error(`La serre ${code} doit être un rectangle, tourné par pas de 90°.`)
   if(width<=0||height<=0)throw Error(`Dimensions manquantes : ${code}`)
   greenhouses.push({source_id:id,code,x:p.x+width/2,y:p.y+height/2,width,height,rotation});continue
  }
  const graphic:PlanGraphic={id,label,kind:kind.slice(0,40),shape:'rect',x:p.x+width/2,y:p.y+height/2,width,height,rotation,fill:color(s.fillColor,'#ffffff'),stroke:color(s.strokeColor,'#64748b'),fontColor:color(s.fontColor,'#0f172a'),fontSize:Math.max(6,Math.min(36,Number(s.fontSize)||12)),vertical:s.horizontal==='0'}
  if(s.shape==='image'){
   const image=s.image||''
   if(!/^data:image\/png,(?:base64,)?[A-Za-z0-9+/=]+$/.test(image)||image.length>180000)throw Error('Les pictogrammes doivent être des PNG intégrés de moins de 130 Ko. Les images externes et SVG ne sont pas autorisées.')
   const b64=image.replace(/^data:image\/png,(?:base64,)?/,'')
   if(!atob(b64).startsWith('\x89PNG\r\n\x1a\n'))throw Error('Pictogramme PNG invalide.')
   picturesSize+=image.length;if(picturesSize>4*1024*1024)throw Error('Trop de données images dans le plan.')
   graphic.shape='image';graphic.image='data:image/png;base64,'+b64
  }else if(cell.getAttribute('edge')==='1'){
   const source=g?.querySelector('mxPoint[as="sourcePoint"]'),target=g?.querySelector('mxPoint[as="targetPoint"]')
   if(!source||!target){warnings.push('Une liaison sans coordonnées explicites a été ignorée.');continue}
   const parent=cell.getAttribute('parent'),a=parent?position(parent):{x:0,y:0}
   graphic.shape='line';graphic.rotation=0;graphic.points=[{x:a.x+n(source,'x'),y:a.y+n(source,'y')},{x:a.x+n(target,'x'),y:a.y+n(target,'y')}]
   graphic.x=(graphic.points[0].x+graphic.points[1].x)/2;graphic.y=(graphic.points[0].y+graphic.points[1].y)/2
   graphic.width=Math.max(1,Math.abs(graphic.points[0].x-graphic.points[1].x));graphic.height=Math.max(1,Math.abs(graphic.points[0].y-graphic.points[1].y))
  }else if(s.shape==='ellipse')graphic.shape='ellipse'
  else if(s.shape==='singleArrow'){graphic.shape='arrow';graphic.rotation=(rotation+(({north:270,south:90,west:180,east:0} as Record<string,number>)[s.direction]??0))%360}
  else if(s.shape&&!['rectangle','rect','text'].includes(s.shape))warnings.push(`Forme simplifiée en rectangle : ${label||id}.`)
  if(graphic.width<=0||graphic.height<=0)continue
  elements.push(graphic)
 }
 if(!greenhouses.length)throw Error('Aucune serre reconnue. Nommez les rectangles S1, S2… ou renseignez fp_type=serre et fp_code dans draw.io.')
 if(greenhouses.length>500||elements.length>1000)throw Error('Maximum 500 serres et 1 000 éléments de décor.')
 if(new Set(greenhouses.map(g=>canonicalGreenhouseCode(g.code))).size!==greenhouses.length)throw Error('Deux formes portent le même code de serre.')
 const all=[...greenhouses,...elements]
 const bounds=all.map(r=>{const rad=r.rotation*Math.PI/180;return {...r,bw:Math.abs(r.width*Math.cos(rad))+Math.abs(r.height*Math.sin(rad)),bh:Math.abs(r.width*Math.sin(rad))+Math.abs(r.height*Math.cos(rad))}})
 const left=Math.min(...bounds.map(r=>r.x-r.bw/2)),top=Math.min(...bounds.map(r=>r.y-r.bh/2))
 const width=Math.max(...bounds.map(r=>r.x+r.bw/2))-left,height=Math.max(...bounds.map(r=>r.y+r.bh/2))-top
 const scale=Math.min(1160/width,760/height),ox=(1200-width*scale)/2,oy=(800-height*scale)/2
 const transform=(x:number,y:number)=>({x:ox+(x-left)*scale,y:oy+(y-top)*scale})
 for(const r of all){Object.assign(r,transform(r.x,r.y));r.width*=scale;r.height*=scale}
 for(const e of elements){e.fontSize=Math.min(100,Math.max(3,e.fontSize*scale));if(e.points)e.points=e.points.map(p=>transform(p.x,p.y))}
 if(greenhouses.some(g=>g.width<12||g.height<12))throw Error('Certaines serres sont trop petites sur le plan. Retirez les éléments très éloignés ou agrandissez le dessin.')
 return {name:name.slice(0,150),greenhouses,elements,warnings:[...new Set(warnings)]}
}
