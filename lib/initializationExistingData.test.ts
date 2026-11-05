import { expect,it } from 'vitest'
import { draftFromExistingClientData } from './initializationExistingData'
it('recovers existing client records as linked rows without reviewing or mutating them',()=>{
 const catalog={crops:[],varieties:[{code:'OTHER',existing_id:'global'}],farms:[{code:'F01',existing_id:'f1',name:'Ferme'}],plantings:[{code:'P01',existing_id:'p1'}],client_varieties:[{code:'V01',existing_id:'v1'}]}
 const draft=draftFromExistingClientData(catalog)
 expect(draft.rows.farms[0].existing_id).toBe('f1')
 expect(draft.rows.varieties.map(row=>row.existing_id)).toEqual(['v1'])
 expect(draft.reviewed).toEqual([])
 expect(draft.skipped).toEqual([])
 draft.rows.farms[0].name='Changed'
 expect(catalog.farms[0].name).toBe('Ferme')
})
it('does not copy shared catalogs or create rows without existing identities',()=>{
 const draft=draftFromExistingClientData({crops:[],varieties:[{code:'GLOBAL',existing_id:'v'}],farms:[{code:'new'}],partners:[{existing_id:'shared',code:'C'}]})
 expect(draft.rows).toEqual({})
})
