import { describe, expect, it } from 'vitest'
import { canonicalGreenhouseCode, initialPlanLinks, officialArea, type DrawioPlan } from './drawioFarmPlan'
describe('draw.io matching and official areas',()=>{
 it('normalizes greenhouse codes without matching commercial names',()=>{
  expect(canonicalGreenhouseCode(' Serre 001 ')).toBe('S1')
  expect(canonicalGreenhouseCode('S-02')).toBe('S2')
 })
 it('matches only a unique code in the supplied farm references',()=>{
  const plan={greenhouses:[{code:'S1'},{code:'S2'},{code:'S3'}]} as DrawioPlan
  expect(initialPlanLinks(plan,[{id:'a',code:'S01'},{id:'b',code:'S2'},{id:'c',code:'S02'}])).toEqual(['a','',''])
 })
 it('accepts French formatting but never guesses surface from a drawing',()=>{
  expect(officialArea('7 360,25')).toBe(7360.25)
  for(const input of ['', '0','-1','Infinity','1e3','2,345','100000000','100 m2'])expect(officialArea(input)).toBeNull()
 })
})
