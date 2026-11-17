import {expect,it} from 'vitest'
import {loginErrorMessage} from './loginError'
it('never exposes empty gateway JSON or internal errors',()=>{
 for(const error of [{message:'{}'},{},null,{message:'Internal database error'}]){
  expect(loginErrorMessage(error)).toContain('connexion a échoué')
 }
})
it('distinguishes invalid credentials, rate limits and service outages',()=>{
 expect(loginErrorMessage({status:400,code:'invalid_credentials',message:'Invalid login credentials'})).toBe('Email ou mot de passe incorrect')
 expect(loginErrorMessage({status:503,message:'{}'})).toContain('temporairement indisponible')
 expect(loginErrorMessage({status:429})).toContain('Trop de tentatives')
 expect(loginErrorMessage({isAcquireTimeout:true})).toContain('temporairement indisponible')
})
