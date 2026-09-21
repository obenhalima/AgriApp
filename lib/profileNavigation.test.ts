import {describe,it,expect} from 'vitest'
import {defaultMenu,profileNavigation} from './profileNavigation'
describe('Menu par profil',()=>{
 it('ne peut pas accorder des permissions',()=>{
  const nav=profileNavigation({...defaultMenu,home:'/stocks'},()=>false)
  expect(nav.flatMap(g=>g.items).some(i=>i.href==='/stocks')).toBe(false)
 });
 it('masque sans supprimer les autres entrées et protège la récupération admin',()=>{
  const nav=profileNavigation({...defaultMenu,hidden:['/stocks','/admin/roles']},()=>true)
  expect(nav.flatMap(g=>g.items).some(i=>i.href==='/stocks')).toBe(false)
  expect(nav.flatMap(g=>g.items).some(i=>i.href==='/admin/roles')).toBe(true)
 });
 it('réordonne et conserve les nouvelles rubriques non configurées',()=>{
  const nav=profileNavigation({...defaultMenu,sections:['FINANCE','PRODUCTION'],items:['/recoltes','/plan-culture']},()=>true)
  expect(nav[0].section).toBe('FINANCE');expect(nav[1].items[0].href).toBe('/recoltes');expect(nav.length).toBeGreaterThan(2)
 });
 it('ne révèle jamais un menu plateforme à un profil standard',()=>{
  expect(profileNavigation(null,()=>true).flatMap(g=>g.items).some(i=>i.platformOnly)).toBe(false)
 });
});
