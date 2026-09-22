import type {PointerEvent} from 'react'
export function ResizeHandles({width,height,label,onStart}:{width:number;height:number;label:string;onStart:(event:PointerEvent<SVGRectElement>,sx:number,sy:number)=>void}){
 return <>{[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx,sy])=><rect key={`${sx}:${sy}`} x={sx*width/2-10} y={sy*height/2-10} width={20} height={20} rx={3} fill="#ffffff" stroke="#4f46e5" strokeWidth={2} aria-label={`Redimensionner ${label} ${sx}:${sy}`} style={{cursor:sx===sy?'nwse-resize':'nesw-resize'}} onPointerDown={e=>onStart(e,sx,sy)} onClick={e=>e.stopPropagation()}><title>Glisser pour redimensionner le dessin</title></rect>)}</>
}
