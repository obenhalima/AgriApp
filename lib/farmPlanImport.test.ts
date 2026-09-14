import { describe,expect,it } from 'vitest'
import { fitPlan,importedShapes,matchPlan,planCode } from './farmPlanImport'
import { normalizeShape } from './farmLayout'
const rect={code:'S1',cell:'A1:B2',x:0,y:0,width:100,height:200}
describe('Excel farm plan import',()=>{
 it('preserves proportions and placement inside the drawing',()=>{
  const rows=fitPlan([rect,{...rect,code:'S2',x:150,width:50}])
  expect(rows[0].width/rows[0].height).toBeCloseTo(.5)
  expect(rows[1].x).toBeGreaterThan(rows[0].x)
  for(const r of rows){expect(r.x-r.width/2).toBeGreaterThanOrEqual(20);expect(r.y+r.height/2).toBeLessThanOrEqual(780)}
 })
 it('does not invent surfaces or reference identifiers',()=>{
  const rows=matchPlan({sheet:'Plan',rectangles:fitPlan([rect])},[])
  expect(rows[0].greenhouse_id).toBe('');expect(rows[0]).not.toHaveProperty('total_area')
  expect(()=>importedShapes(rows,[])).toThrow('Rattachez')
 })
 it('matches only unambiguous greenhouse codes',()=>{
  expect(planCode('Serre 01')).toBe('S1')
  const plan={sheet:'Plan',rectangles:fitPlan([rect])}
  expect(matchPlan(plan,[{id:'one',code:'S01'}])[0].greenhouse_id).toBe('one')
  expect(matchPlan(plan,[{id:'one',code:'S01'},{id:'two',code:'S1'}])[0].greenhouse_id).toBe('')
 })
 it('rejects duplicate codes and invisible geometry',()=>{
  expect(()=>fitPlan([rect,{...rect,code:'S01'}])).toThrow('dupliqué')
  expect(()=>fitPlan([{...rect,width:0}])).toThrow('Dimensions')
  expect(()=>fitPlan([{...rect,width:1,height:1000}])).toThrow('trop petite')
 })
 it('rejects foreign greenhouse links and duplicate assignments',()=>{
  const rows=fitPlan([rect,{...rect,code:'S2',x:120}]).map(r=>({...r,greenhouse_id:'one'}))
  expect(()=>importedShapes(rows,[])).toThrow('Rattachez')
  expect(()=>importedShapes(rows,['one'])).toThrow('deux fois')
 })
 it('large rotated shapes remain inside the canvas',()=>{
  const r=normalizeShape({greenhouse_id:'one',x:0,y:0,width:1160,height:760,rotation:90})
  expect(r.width).toBe(760);expect(r.y+r.width/2).toBeLessThanOrEqual(800)
 })
})
