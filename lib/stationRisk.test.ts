import { describe, expect, it } from 'vitest'
import { stationRisk, stationConfirmationsComplete } from './stationRisk'
describe('Station : couleurs et attestations',()=>{
 it('reconnaît les codes et libellés sans confondre O avec vert',()=>{for(const v of ['V','Vert','FAIBLE'])expect(stationRisk(v)).toBe('green');for(const v of ['O','J','Jaune','Moyen'])expect(stationRisk(v)).toBe('yellow');for(const v of ['R','R*','rouge'])expect(stationRisk(v)).toBe('red')})
 it('garde les classes absentes ou inconnues à contrôler',()=>{for(const v of ['',null,'?', 'III'])expect(stationRisk(v)).toBe('unknown')})
 it('vert : aucune case supplémentaire',()=>expect(stationConfirmationsComplete([{line_id:'v',risk:'green'}],{})).toBe(true))
 it('jaune : accord explicite par ligne, pas une valeur truthy',()=>{const l=[{line_id:'j',risk:'yellow'}];expect(stationConfirmationsComplete(l,{})).toBe(false);expect(stationConfirmationsComplete(l,{j:{station_agreed:'true'}})).toBe(false);expect(stationConfirmationsComplete(l,{j:{station_agreed:true}})).toBe(true)})
 it('rouge : accord ET restrictions',()=>{const l=[{line_id:'r',risk:'red'}];expect(stationConfirmationsComplete(l,{r:{station_agreed:true}})).toBe(false);expect(stationConfirmationsComplete(l,{r:{station_agreed:true,restrictions_checked:true}})).toBe(true)})
 it('chaque produit est confirmé individuellement',()=>expect(stationConfirmationsComplete([{line_id:'1',risk:'yellow'},{line_id:'2',risk:'yellow'}],{'1':{station_agreed:true}})).toBe(false))
 it('une case ne contourne pas couleur inconnue ou échéance expirée',()=>{expect(stationConfirmationsComplete([{line_id:'x',risk:'unknown'}],{})).toBe(false);expect(stationConfirmationsComplete([{line_id:'x',risk:'red',expired:true}],{x:{station_agreed:true,restrictions_checked:true}})).toBe(false)})
})
