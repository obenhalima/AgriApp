export type ResizeBox={x:number;y:number;width:number;height:number;rotation:number}
/** Resize in the shape's local axes, keeping the opposite corner fixed. */
export function resizePlanBox(box:ResizeBox,start:{x:number;y:number},point:{x:number;y:number},sx:number,sy:number,min=12):ResizeBox{
 const angle=box.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle)
 const dx=point.x-start.x,dy=point.y-start.y
 const width=Math.max(min,Math.min(760,box.width+sx*(dx*c+dy*s)))
 const height=Math.max(min,Math.min(760,box.height+sy*(-dx*s+dy*c)))
 const mx=sx*(width-box.width)/2,my=sy*(height-box.height)/2
 return {...box,width,height,x:box.x+mx*c-my*s,y:box.y+mx*s+my*c}
}
