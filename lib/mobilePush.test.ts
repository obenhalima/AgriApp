import { describe,it,expect } from 'vitest'
import { allowedPushEndpoint,notificationBody } from './mobilePush'
describe('Mobile push security',()=>{
 it('allows only supported push providers',()=>{expect(allowedPushEndpoint('https://fcm.googleapis.com/fcm/send/test')).toBe(true);expect(allowedPushEndpoint('https://web.push.apple.com/test')).toBe(true)})
 it.each(['http://fcm.googleapis.com/test','https://127.0.0.1/x','https://fcm.googleapis.com.attacker.test/x','https://user:pass@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x','file:///etc/passwd'])('rejects arbitrary endpoints %s',url=>expect(allowedPushEndpoint(url)).toBe(false))
 it('never includes commercial data in lockscreen notifications',()=>{expect(notificationBody('pending')).not.toContain('montant');expect(notificationBody('rejetee')).toContain('refusée')})
 it('identifies irrigation without leaking farm, volumes or instructions',()=>{
  expect(notificationBody('pending','irrigation')).toContain('programme d’irrigation')
  expect(notificationBody('approuvee','irrigation')).toContain('Interventions culturales')
  expect(notificationBody('rejetee','irrigation')).toContain('refusé')
  expect(notificationBody('annulee','irrigation')).toContain('a changé')
  expect(notificationBody('pending','irrigation')).not.toMatch(/\d|serre|volume/i)
 })
 it('identifies cultural approvals without exposing products on the lockscreen',()=>{
  expect(notificationBody('pending','cultural')).toContain('intervention culturale')
  expect(notificationBody('approuvee','cultural')).toContain('approuvé')
  expect(notificationBody('pending','cultural')).not.toMatch(/\d|produit|serre/i)
 })
})
