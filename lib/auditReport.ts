export type AuditCategory='transaction'|'connection'
export type AuditEvent={event_id:string;occurred_at:string;actor_id:string|null;actor_label:string;action:string;category:AuditCategory;table_name:string;entity_id:string|null;transaction_id:string|null;changed_fields:string[];before_values:Record<string,unknown>|null;after_values:Record<string,unknown>|null;reference_labels?:Record<string,string>;entity_key?:Record<string,unknown>;scope_kind?:string;connection_scope?:string;cursor_id?:string}
export type AuditReport={events:AuditEvent[];has_more:boolean;summary:{total:number;logins:number;transactions:number;validations:number;actors:number};coverage:string[];auth_source_present:boolean;started_at:string|null;unassigned_events:number|null;actor_options:{actor_id:string;actor_label:string}[];connection_diagnostics?:{source_present:boolean;own_events:number;own_logins:number;own_refreshes:number;own_last_event:string|null;own_client_membership:boolean}}
export type AuditFilters={from:string;to:string;category:string;action:string;actor:string;table:string}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function auditRange(from:string,to:string){
 const date=(v:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v))throw Error('Période invalide (93 jours maximum).');const d=new Date(v+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==v)throw Error('Période invalide (93 jours maximum).');return d}
 const lo=date(from),last=date(to),hi=new Date(+last+86400000)
 if(+hi<=+lo||+hi-+lo>93*86400000)throw Error('Période invalide (93 jours maximum).')
 return {from:lo.toISOString(),to:hi.toISOString()}
}
export function auditArgs(domain:string|null,filters:AuditFilters,last?:AuditEvent){
 if(domain!==null&&!uuid.test(domain))throw Error('Sélectionnez un client.')
 if(filters.actor&&!uuid.test(filters.actor))throw Error('Identifiant utilisateur invalide.')
 const range=auditRange(filters.from,filters.to)
 return {p_domain:domain,p_from:range.from,p_to:range.to,p_category:filters.category||null,p_action:filters.action||null,p_actor:filters.actor||null,p_table:filters.table||null,p_before:last?.occurred_at||null,p_before_id:last?.event_id||null,p_limit:100}
}
export const auditActionLabels:Record<string,string>={create:'Création',update:'Modification',delete:'Suppression',validate:'Validation',status_change:'Changement de statut',scope_exit:'Sortie du client',scope_enter:'Entrée dans le client',login:'Connexion',mfa_code_login:'Connexion MFA',logout:'Déconnexion',token_refreshed:'Renouvellement de session'}
export function auditDate(value:string,locale='fr'){return new Intl.DateTimeFormat(locale,{dateStyle:'short',timeStyle:'medium',timeZone:'Africa/Casablanca'}).format(new Date(value))}
export function auditCsv(events:AuditEvent[],client:string){
 const cell=(v:unknown)=>{let s=String(v??'');if(/^[\s]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
 const rows=[['Client','Horodatage UTC','Utilisateur','Identifiant utilisateur','Catégorie','Action','Table','Fiche','Transaction','Champs suivis','Avant','Après'],...events.map(e=>[client,e.occurred_at,e.actor_label,e.actor_id,e.category,auditActionLabels[e.action]||e.action,e.table_name,e.entity_id,e.transaction_id,e.changed_fields.join(', '),JSON.stringify(e.before_values),JSON.stringify(e.after_values)])]
 return '\ufeff'+rows.map(r=>r.map(cell).join(';')).join('\r\n')
}
export function auditError(error:{code?:string;message?:string}){
 if(['PGRST202','42883','42P01'].includes(error.code||''))return 'Piste d’audit non activée en base. La migration doit être validée puis appliquée.'
 if(error.code==='42501')return 'Rapport réservé aux administrateurs du client actif.'
 return 'Chargement du rapport impossible. Réessayez ou contactez votre administrateur.'
}
