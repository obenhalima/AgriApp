// Reject user-controlled arbitrary URLs before any server-side push request (SSRF).
export function allowedPushEndpoint(endpoint: string): boolean {
 try { const u=new URL(endpoint);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
  (u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname==='web.push.apple.com'||u.hostname.endsWith('.push.apple.com')||u.hostname.endsWith('.notify.windows.com'))
 }catch{return false}
}
export function notificationBody(phase:string,kind?:string){
 if(kind==='cultural')return phase==='pending'?'Une intervention culturale attend votre validation dans FarmPilot.':phase==='approuvee'?'Votre programme cultural a été approuvé. Consultez Interventions culturales.':phase==='rejetee'?'Votre programme cultural a été refusé. Consultez le motif dans FarmPilot.':'Le statut de votre programme cultural a changé. Consultez FarmPilot.'
 if(kind==='irrigation')return phase==='pending'?'Un programme d’irrigation attend votre validation dans FarmPilot.':phase==='approuvee'?'Votre programme d’irrigation a été approuvé. Consultez Interventions culturales dans FarmPilot.':phase==='rejetee'?'Votre programme d’irrigation a été refusé. Consultez le motif dans FarmPilot.':'Le statut de votre programme d’irrigation a changé. Consultez FarmPilot.'
 return phase==='pending'?'Une demande attend votre validation dans FarmPilot.':phase==='approuvee'?'Votre demande a été approuvée. Consultez FarmPilot.':phase==='rejetee'?'Votre demande a été refusée. Consultez le motif dans FarmPilot.':'Le statut de votre demande a changé. Consultez FarmPilot.'
}
