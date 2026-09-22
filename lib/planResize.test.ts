import {it,expect} from 'vitest'
import {resizePlanBox} from './planResize'
it('resizes from the bottom right with the opposite corner fixed',()=>{
 expect(resizePlanBox({x:100,y:100,width:100,height:60,rotation:0},{x:150,y:130},{x:170,y:140},1,1)).toEqual({x:110,y:105,width:120,height:70,rotation:0})
})
it('respects rotated local axes and minimum dimensions',()=>{
 const box={x:200,y:200,width:100,height:60,rotation:90}
 const next=resizePlanBox(box,{x:170,y:250},{x:160,y:270},1,1)
 expect(next.width).toBeCloseTo(120);expect(next.height).toBeCloseTo(70)
 expect(next.x).toBeCloseTo(195);expect(next.y).toBeCloseTo(210)
 expect(resizePlanBox(box,{x:0,y:0},{x:999,y:-999},1,1).width).toBe(12)
})
