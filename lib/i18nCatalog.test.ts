import { describe, expect, it } from 'vitest'
import { isLocale, messages, translate } from './i18nCatalog'
describe('ItriX languages', () => {
  it('accepts only supported language codes', () => {
    for (const value of ['fr', 'ar', 'en']) expect(isLocale(value)).toBe(true)
    for (const value of ['AR', 'xx', '', null, undefined]) expect(isLocale(value)).toBe(false)
  })
  it('preserves French and unknown business identifiers', () => {
    expect(translate('fr', 'Récoltes')).toBe('Récoltes')
    expect(translate('ar', 'FS-S01')).toBe('FS-S01')
    expect(translate('en', 'BELTANOL-L')).toBe('BELTANOL-L')
  })
  it('translates harvest labels', () => {
    expect(translate('ar', 'Récoltes')).toBe('الحصاد')
    expect(translate('en', 'Récoltes')).toBe('Harvests')
  })
  it('translates dashboard fallbacks, campaign notes and operation terminology',()=>{
    expect(translate('ar','Votre exploitation · toutes les fermes')).toBe('مزرعتكم · جميع المزارع')
    expect(translate('ar','Campagne en cours sélectionnée automatiquement.')).toBe('تم اختيار الموسم الزراعي الجاري تلقائيًا.')
    expect(translate('ar','· En cours')).toBe('· جارٍ')
    expect(translate('ar','LIVE')).toBe('مباشر')
    expect(translate('ar','Fertigation')).toBe('التسميد عبر الري')
    expect(translate('ar','Mon exploitation').split(' ')[0]).not.toBe('Mon')
  })
  it('has nonempty translations and keeps interpolation placeholders', () => {
    for (const [source, pair] of Object.entries(messages)) {
      for (const value of pair) {
        expect(value.trim().length, source).toBeGreaterThan(0)
        expect((value.match(/\{\w+\}/g) || []).sort(), source).toEqual((source.match(/\{\w+\}/g) || []).sort())
      }
    }
  },30000)
  it('interpolates quantities without changing their value', () => {
    expect(translate('ar', '{count} sujet(s) à examiner', {count: 5})).toBe('5 مواضيع تتطلب المراجعة')
    expect(translate('fr', '{count} sujet(s) à examiner', {count: 5})).toBe('5 sujet(s) à examiner')
  })
  it('translates already assembled interface sentences without changing values',()=>{
    const key=Object.keys(messages).find(k=>k.startsWith('Composant ')&&k.includes('{v0}'))!
    expect(translate('en',key.replace('{v0}','S01'))).toBe(translate('en',key,{v0:'S01'}))
    expect(translate('ar','Ferme BENHALIMA / S01')).toBe('Ferme BENHALIMA / S01')
  })
})
