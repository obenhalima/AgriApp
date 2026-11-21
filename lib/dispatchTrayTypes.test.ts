import {expect,it} from 'vitest'
import {dispatchTrayTypes} from './dispatchTrayTypes'
it('lists all types in a mixed dispatch once and ignores unrelated harvests',()=>{
 const sources=[{harvest_lot_id:'d',harvest_id:'h1'},{harvest_lot_id:'d',harvest_id:'h2'}]
 const lines=[{harvest_id:'h1',tray_type_code:'10',tray_type_label:'Plateau 10 kg'},{harvest_id:'h2',tray_type_code:'25',tray_type_label:'Caisse 25 kg'},{harvest_id:'h2',tray_type_code:'10',tray_type_label:'Plateau 10 kg'},{harvest_id:'other',tray_type_code:'99'}]
 expect(dispatchTrayTypes({id:'d',harvest_id:'other'},sources,lines).map(type=>type.code).sort()).toEqual(['10','25'])
})
it('supports direct harvests, preserves historical labels, and never invents missing types',()=>{
 expect(dispatchTrayTypes({id:'d',harvest_id:'h'},[],[{harvest_id:'h',tray_type_code:'A',tray_type_label:'Ancien libellé'}],[{code:'A',label:'Nouveau libellé'}])).toEqual([{code:'A',label:'Ancien libellé'}])
 expect(dispatchTrayTypes({id:'d'},[],[])).toEqual([])
})
