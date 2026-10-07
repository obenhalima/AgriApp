import {describe,it,expect} from 'vitest'
import {FIELD_DOCS,SCREEN_DOCS,findFieldDoc,findScreenDoc,fieldExplanation} from './userDocumentation'
describe('documentation utilisateur',()=>{
 it('associe le chemin le plus précis sans confondre les préfixes',()=>{expect(findScreenDoc('/recoltes')?.path).toBe('/recoltes');expect(findScreenDoc('/recoltes/inconnu')?.path).toBe('/recoltes');expect(findScreenDoc('/recoltes-autre')).toBeUndefined();expect(findScreenDoc('/admin/roles')).toBeUndefined()})
 it('ne comporte pas de références de champ cassées',()=>{const keys=FIELD_DOCS.map(d=>d.key);expect(new Set(keys).size).toBe(keys.length);for(const d of SCREEN_DOCS)for(const f of d.fields)expect(keys).toContain(f)})
 it('reconnaît les libellés traduits mais pas les champs inconnus',()=>{expect(findFieldDoc('مزرعة',s=>s==='Ferme'?'مزرعة':s)?.key).toBe('farm');expect(findFieldDoc('inconnu')).toBeUndefined()})
 it('documente les distinctions commerciales et les données provisoires',()=>{expect(FIELD_DOCS.find(d=>d.key==='revenue')?.caution).toContain('encaissé');expect(FIELD_DOCS.find(d=>d.key==='costKg')?.caution).toContain('manquante')})
 it('explique les unités, exemples et précautions au même endroit',()=>{expect(fieldExplanation('Nombre de personnes')).toContain('5 000');expect(fieldExplanation('Nombre de personnes')).toContain('distinctes');expect(fieldExplanation('inconnu')).toBeUndefined()})
})
