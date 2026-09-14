import type { PlanGraphic } from '@/lib/drawioFarmPlan'

// Rebuild primitives instead of injecting untrusted XML, HTML or SVG from draw.io.
export function PlanGraphics({elements}:{elements:PlanGraphic[]}){
 return <>{elements.map(e=>{
  if(e.shape==='line'&&e.points?.length===2)return <line key={e.id} x1={e.points[0].x} y1={e.points[0].y} x2={e.points[1].x} y2={e.points[1].y} stroke={e.stroke} strokeWidth={.8}/>
  const w=e.width,h=e.height
  const font=Math.max(3,Math.min(e.fontSize,Math.max(3,h*.55)))
  const chars=Math.max(4,Math.floor((e.vertical?h:w)/(font*.55)))
  const words=e.label.split(' '),lines:string[]=[]
  for(const word of words){if(!lines.length||(lines[lines.length-1]+' '+word).length>chars)lines.push(word);else lines[lines.length-1]+=' '+word}
  return <g key={e.id} transform={`translate(${e.x},${e.y}) rotate(${e.rotation})`} pointerEvents="none">
   <title>{e.label||e.kind}</title>
   {e.shape==='image'&&e.image?.startsWith('data:image/png;base64,')?<image href={e.image} x={-w/2} y={-h/2} width={w} height={h} preserveAspectRatio="none"/>:
    e.shape==='ellipse'?<ellipse rx={w/2} ry={h/2} fill={e.fill} stroke={e.stroke} strokeWidth={.7}/>:
    e.shape==='arrow'?<polygon points={`${-w/2},${-h/4} ${w/5},${-h/4} ${w/5},${-h/2} ${w/2},0 ${w/5},${h/2} ${w/5},${h/4} ${-w/2},${h/4}`} fill={e.fill} stroke={e.stroke} strokeWidth={.7}/>:
    <rect x={-w/2} y={-h/2} width={w} height={h} fill={e.fill} stroke={e.stroke} strokeWidth={.7}/>}
   {e.shape!=='image'&&e.label&&<text textAnchor="middle" dominantBaseline="central" fill={e.fontColor} fontSize={font} transform={e.vertical?'rotate(-90)':undefined}>
    {lines.map((line,i)=><tspan key={i} x={0} y={(i-(lines.length-1)/2)*font*1.12}>{line}</tspan>)}
   </text>}
  </g>
 })}</>
}
