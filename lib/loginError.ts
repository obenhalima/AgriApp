/** Only display actionable authentication messages, never a raw gateway body. */
export function loginErrorMessage(error:unknown):string {
 const failure=(error??{}) as {code?:string;status?:number;name?:string;message?:string;isAcquireTimeout?:boolean}
 const message=typeof failure.message==='string'?failure.message:''
 if(failure.code==='invalid_credentials'||/invalid login credentials/i.test(message))return 'Email ou mot de passe incorrect'
 if(failure.code==='email_not_confirmed')return 'Votre adresse email doit être confirmée avant la connexion.'
 if(failure.status===429||failure.code==='over_request_rate_limit')return 'Trop de tentatives de connexion. Patientez quelques minutes puis réessayez.'
 if(failure.status===0||(failure.status??0)>=500||failure.isAcquireTimeout||
  /timeout|timed out|failed to fetch|network|load failed/i.test(message)||
  ['AbortError','TimeoutError','AuthRetryableFetchError'].includes(failure.name??'')){
  return 'Le service de connexion est temporairement indisponible. Réessayez dans quelques instants.'
 }
 return 'La connexion a échoué. Réessayez ou contactez votre administrateur si le problème persiste.'
}
