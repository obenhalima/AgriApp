import {describe,it,expect} from 'vitest'
import {fertigationQuantity,compatibleDoseUnits} from './fertigation'
describe('Fertigation — solution finale, pas cuve mère',()=>{
  it('calcule et convertit les masses',()=>{
    expect(fertigationQuantity('10 000','1,25','kg_m3','kg')).toBe(12.5)
    expect(fertigationQuantity(10000,1250,'g_m3','kg')).toBe(12.5)
    expect(fertigationQuantity(2500,1.5,'kg_m3','g')).toBe(3750)
  })
  it('calcule les volumes sans densité supposée',()=>{
    expect(fertigationQuantity(20000,250,'ml_m3','L')).toBe(5)
    expect(fertigationQuantity(20000,.25,'l_m3','ml')).toBe(5000)
  })
  it('refuse les conversions masse / volume et les conditionnements inconnus',()=>{
    expect(()=>fertigationQuantity(1000,1,'kg_m3','l')).toThrow('incompatible')
    expect(()=>fertigationQuantity(1000,1,'kg_m3','sac')).toThrow('incompatible')
    expect(compatibleDoseUnits('KG')).toEqual(['kg_m3','g_m3'])
    expect(compatibleDoseUnits('unite')).toEqual([])
  })
  it('refuse les saisies invalides ou nulles',()=>{
    for(const v of ['',0,-1,'NaN','Infinity'])expect(()=>fertigationQuantity(v,1,'kg_m3','kg')).toThrow()
    expect(()=>fertigationQuantity(1,0,'kg_m3','kg')).toThrow()
    expect(()=>fertigationQuantity(1,1,'kg_ha','kg')).toThrow()
    expect(()=>fertigationQuantity(.01,.01,'g_m3','kg')).toThrow()
  })
})
