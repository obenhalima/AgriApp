import {describe,it,expect} from 'vitest'
import {substitutionNumber,validateSubstitutionAmounts} from './purchaseSubstitutions'
describe('Replacement receipt inputs',()=>{
 it('accepts French decimals and thousands separators',()=>{expect(substitutionNumber('1 250,25')).toBe(1250.25)})
 it.each(['','NaN','Infinity','-1','1,2,3','12abc'])('rejects malformed %s',value=>{expect(Number.isNaN(substitutionNumber(value))).toBe(true)})
 it('never derives delivered quantity from the original product quantity',()=>{expect(validateSubstitutionAmounts('5','2,5','120','Remplacement proposé',10)).toBeNull()})
 it('rejects excess, empty price, short reason and stock precision loss',()=>{
  expect(validateSubstitutionAmounts('11','2','12','Valide',10)).toContain('restant')
  expect(validateSubstitutionAmounts('5','2','','Valide',10)).toContain('prix')
  expect(validateSubstitutionAmounts('5','2','12','non',10)).toContain('motif')
  expect(validateSubstitutionAmounts('5','2,555','12','Valide',10)).toContain('décimales')
 })
})
