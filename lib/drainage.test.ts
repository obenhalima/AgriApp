import {describe,it,expect} from 'vitest'
import {manualDrainageResult,manualDrainageSummary} from './drainage'
import {drainageNumber,drainageResult,drainageSummary,emptyDrainageContext,emptyDrainageValues,type DrainageReading} from './drainage'
const row=(v:string,d:string,time='09:00',k='10'):DrainageReading=>({id:time,greenhouse:'s1',time,status:'measured',values:{...emptyDrainageValues(),dropVolume:v,drainVolume:d},measuredBy:'operator',enteredBy:'user',enteredAt:'2026-09-22',context:{...emptyDrainageContext(),unit:'mL',coefficient:k,validFrom:'2026-09-01T00:00'}})
describe('manual drainage',()=>{
 it('manual mode never uses calculated percentages and preserves zero',()=>{const r=row('100','500');expect(manualDrainageResult(r,'2026-09-22').ratio).toBeNull();r.manualPercent='0';expect(manualDrainageResult(r,'2026-09-22').ratio).toBe(0);r.manualPercent='32,5';expect(manualDrainageResult(r,'2026-09-22').ratio).toBe(32.5);r.status='not_taken';expect(manualDrainageResult(r,'2026-09-22').ratio).toBeNull()})
 it('manual summary shows latest entry, not a computed daily ratio',()=>{const a={...row('100','500'),manualPercent:'0'},b={...row('300','1500','12:00'),manualPercent:'32,5'};expect(manualDrainageSummary([b,a],'2026-09-22').ratio).toBe(32.5)})
 it('distinguishes blank from measured zero',()=>{expect(drainageNumber('')).toBeNull();expect(drainageNumber('0')).toBe(0);expect(drainageNumber('1 200,5')).toBe(1200.5)})
 it('rejects malformed, negative and nonfinite input',()=>{for(const x of ['NaN','Infinity','-1','1x','1.2.3'])expect(drainageNumber(x)).toBeNull()})
 it('requires a positive effective coefficient',()=>{expect(drainageResult(row('100','0','09:00',''),'2026-09-22').ratio).toBeNull();const r=row('100','0');r.context.validFrom='2026-09-23T00:00';expect(drainageResult(r,'2026-09-22').ratio).toBeNull()})
 it('includes morning zero and weights volumes, not percentages',()=>{const result=drainageSummary([row('100','0'),row('300','1500','12:00')],'2026-09-22');expect(result.ratio).toBe(37.5);expect(result.firstPositive).toBe('12:00')})
 it('excludes not taken and incomplete readings',()=>{const r=row('500','0');r.status='not_taken';const result=drainageSummary([r,row('100','','10:00'),row('200','1000','12:00')],'2026-09-22');expect(result.ratio).toBe(50);expect(result.missing).toBe(1);expect(result.incomplete).toBe(1)})
 it('uses each snapshot coefficient and normalizes units',()=>{const r=row('1','5','12:00','20');r.context.unit='L';expect(drainageSummary([row('100','500'),r],'2026-09-22').ratio).toBeCloseTo(100*5.5/21)})
 it('does not divide by zero or cap ratios at 100',()=>{expect(drainageResult(row('0','1'),'2026-09-22').ratio).toBeNull();expect(drainageResult(row('1','20'),'2026-09-22').ratio).toBe(200)})
})
