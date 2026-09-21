import {it,expect} from 'vitest'
import {originalSubstitutionTargets,matchingSubstitutions} from './substitutionTargets'
const options=[{id:'1',stock:'old',name:'Original',unit:'l',target:'Acariens',targetId:'a'},{id:'2',stock:'new',name:'Remplaçant',unit:'l',target:'Acariens',targetId:'a'},{id:'3',stock:'other',name:'Autre',unit:'l',target:'Botrytis',targetId:'b'}]
it('only offers replacements for the original product target',()=>{expect(matchingSubstitutions(options,'old','a').map(o=>o.stock)).toEqual(['new'])})
it('rejects unrelated target, unset line or unset target',()=>{expect(matchingSubstitutions(options,'old','b')).toEqual([]);expect(matchingSubstitutions(options,undefined,'a')).toEqual([]);expect(matchingSubstitutions(options,'old','')).toEqual([])})
it('deduplicates targets and supports explicit choice for multicible originals',()=>{expect(originalSubstitutionTargets([...options,options[0]],'old')).toHaveLength(1);expect(originalSubstitutionTargets([...options,{...options[2],stock:'old'}],'old')).toHaveLength(2)})
