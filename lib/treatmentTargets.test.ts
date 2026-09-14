import { describe, expect, it } from 'vitest'
import { duplicateTreatmentProduct, resetLineTarget, treatmentTargetsSummary } from './treatmentTargets'

describe('prescriptions multicibles', () => {
  it('résume les cibles distinctes dans leur ordre de saisie', () => {
    expect(treatmentTargetsSummary([{target_name:'Botrytis'},{target_name:'Acariens'},{target_name:'Botrytis'}])).toBe('Botrytis / Acariens')
    expect(treatmentTargetsSummary([{target_name:''},{}])).toBe('')
  })
  it('réinitialise les données sensibles uniquement sur la ligne changée', () => {
    const other={catalog_product_id:'P1',target_name:'Botrytis',label_confirmed:true}
    const empty={catalog_product_id:'',dose:'',planned_quantity:'',label_confirmed:false}
    const result=[other,resetLineTarget(empty,'T2','Acariens')]
    expect(result[0]).toBe(other)
    expect(result[1]).toEqual({...empty,biological_target_id:'T2',target_name:'Acariens'})
  })
  it('refuse le double dosage du même produit, même pour deux cibles', () => {
    expect(duplicateTreatmentProduct([{catalog_product_id:'P1'},{catalog_product_id:'P1'}])).toBe(true)
    expect(duplicateTreatmentProduct([{catalog_product_id:'P1'},{catalog_product_id:'P2'}])).toBe(false)
    expect(duplicateTreatmentProduct([{catalog_product_id:''},{catalog_product_id:''}])).toBe(false)
  })
})
