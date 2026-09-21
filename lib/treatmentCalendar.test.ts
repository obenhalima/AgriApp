import {describe,it,expect} from 'vitest'
import {calendarDays,filterTreatments,treatmentDay} from './treatmentCalendar'
describe('Calendrier traitements',()=>{
 it('utilise les dates Casablanca et ignore les dates invalides',()=>{
  expect(treatmentDay('2026-09-21T23:30:00Z')).toBe('2026-09-22');expect(treatmentDay('')).toBe('');
 });
 it('commence le lundi et traverse les limites de mois et année',()=>{
  const grid=calendarDays('2026-01');expect(grid).toHaveLength(42);expect(grid[0]).toBe('2025-12-29');expect(grid[41]).toBe('2026-02-08');
 });
 const places=[{id:'p',greenhouses:{id:'s',farm_id:'f',name:'S1'}}];
 const r={id:'1',planned_at:'2026-09-20T12:00:00Z',status:'approuvee',treatment_request_targets:[{campaign_planting_id:'p'}],treatment_request_products:[{target_name:'Acariens',product_name:'A'},{target_name:'Botrytis',product_name:'B'}]};
 it('croise ferme serre cible par ligne produit stock et retard',()=>{
  expect(filterTreatments([r],places,{farm:'f',greenhouse:'s',target:'Botrytis',product:'B',stock:'inconnu',status:'retard'},'2026-09-21')).toHaveLength(1);
  expect(filterTreatments([r],places,{farm:'autre'},'2026-09-21')).toHaveLength(0);
  expect(filterTreatments([{...r,status:'executee'}],places,{status:'retard'},'2026-09-21')).toHaveLength(0);
 });
 it('filtre bornes inclusives et trie sans changer les données sources',()=>{
  const rows=[{...r,id:'2',planned_at:'2026-09-22T12:00:00Z'},r];
  expect(filterTreatments(rows,places,{from:'2026-09-20',to:'2026-09-20'},'2026-09-21').map(x=>x.id)).toEqual(['1']);
  expect(filterTreatments(rows,places,{},'2026-09-21').map(x=>x.id)).toEqual(['2','1']);expect(rows[0].id).toBe('2');
  expect(filterTreatments(rows,places,{sort:'asc'},'2026-09-21').map(x=>x.id)).toEqual(['1','2']);
 });
 it('trie par cible dans les deux sens',()=>{
  const rows=[{...r,id:'a',target_name:'Botrytis'},{...r,id:'b',target_name:'Acariens'}];
  expect(filterTreatments(rows,places,{sort:'target_asc'},'2026-09-21').map(x=>x.id)).toEqual(['b','a']);
  expect(filterTreatments(rows,places,{sort:'target_desc'},'2026-09-21').map(x=>x.id)).toEqual(['a','b']);
 });
});
