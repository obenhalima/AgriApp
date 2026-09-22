import {describe,it,expect} from 'vitest'
import {farmPlanPalette,newPlanGraphic,normalizeGraphic} from './farmPlanPalette'
describe('manual farm plan components',()=>{
 it('provides distinct editable entrance, passage and alley components',()=>{for(const kind of ['entree','passage','allee']){const e=newPlanGraphic(kind,kind,0);expect(e.kind).toBe(kind);expect(e.width).toBeGreaterThan(e.height);expect(normalizeGraphic({...e,rotation:90}).rotation).toBe(90)}})
 it('creates all palette components with existing server-compatible fields',()=>{for(const [kind] of farmPlanPalette){const e=newPlanGraphic(kind,kind,0);expect(e.id).toBe(kind);expect(e.label.length).toBeLessThanOrEqual(500);expect(['rect','ellipse','arrow']).toContain(e.shape);expect(e).not.toHaveProperty('greenhouse_id');expect(e).not.toHaveProperty('total_area')}})
 it('bounds coordinates, normalizes rotation and retains labels',()=>{const e=normalizeGraphic({...newPlanGraphic('bassin','x',0),x:-100,y:9999,rotation:-90,width:NaN});expect(e.x).toBeGreaterThanOrEqual(0);expect(e.y).toBeLessThanOrEqual(800);expect(e.rotation).toBe(270);expect(e.width).toBe(100)})
 it('keeps imported lines within server bounds when moved',()=>{const e=normalizeGraphic({...newPlanGraphic('piste','line',0),shape:'line',x:1,y:1,rotation:270});expect(e.points).toHaveLength(2);for(const p of e.points!){expect(p.x).toBeGreaterThanOrEqual(0);expect(p.x).toBeLessThanOrEqual(1200);expect(p.y).toBeGreaterThanOrEqual(0);expect(p.y).toBeLessThanOrEqual(800)}})
})
