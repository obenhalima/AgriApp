'use client'
import { TranslatedText } from '@/lib/i18n'
import {useEffect,useRef,useState} from 'react'
import {supabase} from '@/lib/supabase'
type Result={space:string;enabled:boolean;hasKey:boolean;fixtureNumber?:string|null;reference?:string|null;remoteId:string|null;status:string|null;events:{at:string;actor:string;action:string;remoteId?:string}[];error?:string}
export function DocIndexLiveTest({domain,recipient}:{domain:string;recipient:string}){
 const [result,setResult]=useState<Result|null>(null),[space,setSpace]=useState(''),[apiKey,setApiKey]=useState(''),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const scope=`${domain}:${recipient}`,current=useRef(scope);current.current=scope
 async function request(action?:string){
  const captured=scope;setBusy(true);setError('')
  try{
   const session=await supabase.auth.getSession();const token=session.data.session?.access_token
   if(!token)throw Error('Reconnectez-vous pour accéder à la configuration.')
   const response=await fetch(`/api/integrations/docindex/local?domain=${encodeURIComponent(domain)}&recipient=${encodeURIComponent(recipient)}`,{method:action?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(action?{'Content-Type':'application/json'}:{})},body:action?JSON.stringify(action==='configure'?{action,space,apiKey,enabled}:action==='new_fixture'?{action,confirmNew:true}:{action,confirmFictitious:true,reference:result?.reference}):undefined,cache:'no-store',signal:AbortSignal.timeout(35000)})
   const data=await response.json()
   if(captured!==current.current)return
   if(!response.ok||data.error)throw Error(data.error||'Configuration indisponible.')
   setResult(data);setSpace(data.space);setEnabled(data.enabled)
  }catch(e){if(captured===current.current)setError(e instanceof Error?e.message:'Service indisponible.')}
  finally{if(captured===current.current){setBusy(false);if(action==='configure')setApiKey('')}}
 }
 useEffect(()=>{setResult(null);setSpace('');setApiKey('');setEnabled(false);setError('');void request()},[domain,recipient]) // Scoped configuration is rechecked by the server on every action.
 return <section className="space-y-4 rounded-xl border border-blue-300 p-5">
  <h2 className="text-xl font-semibold"><TranslatedText text={"Configuration DocIndex"}/></h2>
  <p><TranslatedText text={"Configurez ici la connexion utilisée pour les factures jointes aux bons d’achat. Chaque envoi demande votre confirmation. La clé est chiffrée sur ce serveur local Windows ; une fois enregistrée, elle n’est jamais retournée au navigateur."}/></p>
  <p className="text-sm"><TranslatedText text={"Destinataire : "}/>{recipient.endsWith('-A')?'A':'B'}<TranslatedText text={". La clé détermine l’espace DocIndex ; vérifiez son nom avant d’envoyer. Le nom saisi est un libellé, pas une vérification automatique de l’espace."}/></p>
  <form className="space-y-3" onSubmit={e=>{e.preventDefault();void request('configure')}}>
   <fieldset disabled={busy} className="space-y-3">
    <label className="block"><TranslatedText text={"Nom de l’espace DocIndex destinataire"}/><input className="block w-full rounded border p-2" required maxLength={120} value={space} onChange={e=>setSpace(e.target.value)}/></label>
    <label className="block"><TranslatedText text={"Clé API DocIndex"}/><input type="password" autoComplete="new-password" spellCheck={false} className="block w-full rounded border p-2" placeholder={result?.hasKey?'Clé déjà enregistrée — laisser vide pour la conserver':'dik_…'} value={apiKey} onChange={e=>setApiKey(e.target.value)} required={!result?.hasKey} maxLength={244}/></label>
    <p className="text-sm"><TranslatedText text={"Collez la clé complète commençant par dik_, sans le préfixe Bearer. Laissez ce champ vide pour conserver la clé déjà enregistrée."}/></p>
    {result?.hasKey&&<p><TranslatedText text={"Clé enregistrée : masquée. Elle ne peut pas être consultée depuis l’application."}/></p>}
    <label className="block"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/><TranslatedText text={" Activer la connexion DocIndex pour ce destinataire"}/></label>
    <button className="btn btn-primary" type="submit"><TranslatedText text={"Enregistrer la configuration sécurisée"}/></button>
   </fieldset>
  </form>
  <h3 className="font-semibold"><TranslatedText text={"Test de connexion avec une facture fictive"}/></h3>
  <p className="text-sm"><TranslatedText text={"Ces boutons utilisent un document généré pour le test. Pour envoyer votre pièce jointe, ouvrez le détail du bon d’achat."}/></p>
  <p><TranslatedText text={"Facture de test sélectionnée : "}/><strong><TranslatedText text={result?.fixtureNumber||'Facture fictive précédente (référence conservée)'}/></strong></p>
  <button type="button" className="btn btn-primary mr-2" disabled={busy||!result?.enabled||!result.hasKey} onClick={()=>{if(window.confirm('Créer une nouvelle facture fictive avec un nouveau numéro ? Elle ne sera pas envoyée automatiquement.'))void request('new_fixture')}}><TranslatedText text={"Nouvelle facture fictive"}/></button>
  <button type="button" className="btn btn-secondary" disabled={busy||!result?.enabled||!result.hasKey} onClick={()=>{if(window.confirm(`Envoyer la facture fictive sélectionnée à l’espace DocIndex « ${result?.space} » ? Le document arrivera réellement dans sa boîte de réception.`))void request('send_fixture')}}><TranslatedText text={busy?'Traitement…':result?.remoteId?'Renvoyer la même facture fictive à DocIndex':'Envoyer la facture fictive à DocIndex'}/></button>
  <button type="button" className="btn btn-secondary ml-2" disabled={busy} onClick={()=>void request()}><TranslatedText text={"Actualiser la configuration"}/></button>
  <p className="text-sm"><TranslatedText text={"Nouvelle facture : nouveau numéro et nouvelle référence, puis envoi séparé. Renvoyer : même PDF et même référence, sans doublon. Chaque nouvelle facture envoyée consomme le quota DocIndex. Attendez une minute entre deux envois."}/></p>
  {error&&<p role="alert" className="text-red-700">{error}</p>}
  {result?.remoteId&&<p role="status" className="text-green-700"><TranslatedText text={"Facture reçue par DocIndex. Identifiant : "}/><strong>{result.remoteId}</strong> · <TranslatedText text={({received:'Traitement non renseigné',reading:'Lecture en cours',to_review:'À vérifier',validated:'Validée dans DocIndex',rejected:'Rejetée dans DocIndex'} as Record<string,string>)[result.status||'']||'Traitement non renseigné'}/><TranslatedText text={". La réception du PDF est distincte de sa validation humaine."}/></p>}
  {!result?.remoteId&&result?.events.some(event=>event.action.startsWith('Envoi non confirmé'))&&<p className="text-sm"><TranslatedText text={"Le journal contient une ancienne tentative non confirmée par Itrix, pas une preuve de refus. Si la facture est visible dans DocIndex, ne la renvoyez pas. Son identifiant n’a pas été conservé lors de cette tentative."}/></p>}
  {!!result?.events.length&&<details><summary><TranslatedText text={"Journal des actions serveur"}/></summary><ul>{result.events.map((event,i)=><li key={i}>{event.at}<TranslatedText text={" · utilisateur "}/>{event.actor} · {event.action}{event.remoteId?` · ${event.remoteId}`:''}</li>)}</ul></details>}
 </section>
}
