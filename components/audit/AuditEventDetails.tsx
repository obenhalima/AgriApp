'use client'

import { FilterableTable } from '@/components/ui/FilterableTable'
import {useLanguage} from '@/lib/i18n'
import type {AuditEvent} from '@/lib/auditReport'
import {auditChanges} from '@/lib/auditPresentation'
import {AuditEventIdentity} from './AuditEventIdentity'
export function AuditEventDetails({event,showIdentity=true}:{event:AuditEvent;showIdentity?:boolean}){
 const {t:_ui,locale}=useLanguage(),changes=auditChanges(event,locale)
 return <details><summary className="cursor-pointer font-medium text-brand">{_ui('Voir les changements')}</summary>
  {showIdentity&&<AuditEventIdentity event={event}/>}
  {event.category==='connection'?<p className="py-2">{_ui(event.connection_scope==='platform_account'?'Connexion à un compte plateforme, sans client métier déterminé.':'Événement d’accès au compte utilisateur, sans preuve de présence en ligne.')}</p>:
  changes.length?<div className="overflow-x-auto py-2"><FilterableTable className="w-full text-sm"><thead><tr><th className="p-2 text-start">{_ui('Information')}</th>{event.before_values&&<th className="p-2 text-start">{_ui('Avant')}</th>}{event.after_values&&<th className="p-2 text-start">{_ui(event.action==='create'?'Valeur enregistrée':'Après')}</th>}</tr></thead><tbody>{changes.map(c=><tr key={c.field} className="border-t"><th className="p-2 text-start font-medium">{_ui(c.label)}</th>{event.before_values&&<td className="p-2">{_ui(c.before)}</td>}{event.after_values&&<td className="p-2">{_ui(c.after)}</td>}</tr>)}</tbody></FilterableTable></div>:<p className="py-2">{_ui('Les informations techniques ou des champs non conservés ont été actualisés.')}</p>}
  <details className="mt-2 text-xs text-fg-secondary"><summary className="cursor-pointer">{_ui('Informations techniques (support)')}</summary><p>{_ui('Transaction')} : {event.transaction_id||'—'}</p><p>{_ui('Identifiant utilisateur')} : {event.actor_id||'—'}</p><p>{_ui('Identifiant de fiche')} : {event.entity_id||'—'}</p><pre className="max-w-md whitespace-pre-wrap break-all">{JSON.stringify({cle:event.entity_key,avant:event.before_values,après:event.after_values},null,2)}</pre></details>
 </details>
}
