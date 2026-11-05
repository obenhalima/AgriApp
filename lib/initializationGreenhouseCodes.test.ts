import {expect,it} from 'vitest'
import {newInitRow,emptyInitDraft,INIT_SECTIONS,validateInit,type InitCatalog} from './initialization'
const section=INIT_SECTIONS.find(s=>s.key==='greenhouses')!
const catalog:InitCatalog={crops:[],varieties:[],farms:[{code:'F1'}],greenhouses:[{code:'F1/SER-0001',farm:'F1',existing_id:'g1'},{code:'F2/SER-0002',farm:'F2',existing_id:'g2'}]}
it('does not regenerate a code hidden behind a farm-qualified reference',()=>{
 expect(newInitRow(section,emptyInitDraft(),catalog).code).toBe('SER-0003')
})
it('avoids both existing references and new prepared rows',()=>{
 expect(newInitRow(section,{...emptyInitDraft(),rows:{greenhouses:[{code:'SER-0003',farm:'F1'}]}},catalog).code).toBe('SER-0004')
})
it('detects the same-farm duplicate before SQL integration',()=>{
 const draft={...emptyInitDraft(),rows:{greenhouses:[{code:'SER-0001',farm:'F1',name:'Nouvelle serre',type:'tunnel',area:'100'}]}}
 expect(validateInit(draft,catalog).some(issue=>issue.section==='greenhouses' && issue.message.includes('existe déjà dans cette ferme'))).toBe(true)
})
