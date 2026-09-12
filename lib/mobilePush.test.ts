import { describe,it,expect } from 'vitest'
import { allowedPushEndpoint,notificationBody } from './mobilePush'
describe('Mobile push security',()=>{
 it('allows only supported push providers',()=>{expect(allowedPushEndpoint('https://fcm.googleapis.com/fcm/send/test')).toBe(true);expect(allowedPushEndpoint('https://web.push.apple.com/test')).toBe(true)})
 it.each(['http://fcm.googleapis.com/test','https://127.0.0.1/x','https://fcm.googleapis.com.attacker.test/x','https://user:pass@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x','file:///etc/passwd'])('rejects arbitrary endpoints %s',url=>expect(allowedPushEndpoint(url)).toBe(false))
 it('never includes commercial data in lockscreen notifications',()=>{expect(notificationBody('pending')).not.toContain('montant');expect(notificationBody('rejetee')).toContain('refusée')})
})
