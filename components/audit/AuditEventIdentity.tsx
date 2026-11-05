'use client'
import {useLanguage} from '@/lib/i18n'
import {auditDate,type AuditEvent} from '@/lib/auditReport'
export function AuditEventIdentity({event}:{event:AuditEvent}){
 const {t:_ui,locale}=useLanguage()
 return <dl className="my-2 grid gap-2 rounded-lg border border-border bg-surface-sunk p-3 text-sm sm:grid-cols-2">
  <div><dt className="text-fg-secondary">{_ui('Auteur de l’action')}</dt><dd className="font-semibold">{event.actor_label||_ui('Auteur non identifié')}</dd></div>
  <div><dt className="text-fg-secondary">{_ui('Code utilisateur (identifiant unique)')}</dt><dd className="break-all font-mono text-xs">{event.actor_id||_ui('Opération système / sans utilisateur connecté')}</dd></div>
  <div className="sm:col-span-2"><dt className="text-fg-secondary">{_ui('Date et heure de l’action')}</dt><dd><time dateTime={event.occurred_at}>{auditDate(event.occurred_at,locale)}</time> · Africa/Casablanca</dd></div>
 </dl>
}
