'use client'
import {useLanguage} from '@/lib/i18n'

import {useEffect,useState} from 'react'
import {useAuth} from '@/lib/auth'
import {supabase} from '@/lib/supabase'
import {NAV} from '@/lib/navigation'
import {defaultMenu,profileNavigation,type MenuConfig} from '@/lib/profileNavigation'
import {Button} from '@/components/ui/Button'
export function ProfileMenuEditor({roleId,admin,permissions}:{roleId:string;admin:boolean;permissions:Set<string>}){
 const {t:_ui,text:_uiNode}=useLanguage()

 const {activeDomain}=useAuth()
 const [config,setConfig]=useState<MenuConfig>(defaultMenu),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 useEffect(()=>{let cancelled=false;setLoading(true);setError('');setMessage('');supabase.from('profile_navigation').select('config').eq('domain_id',activeDomain!.domain_id).eq('role_id',roleId).maybeSingle().then(({data,error})=>{if(cancelled)return;if(error)setError('Configuration indisponible. Vérifiez que la migration 140 est appliquée.');setConfig(data?.config||defaultMenu);setLoading(false)});return()=>{cancelled=true}},[roleId,activeDomain?.domain_id])
 const can=(code:string)=>admin||permissions.has(`${code}.view`)
 const preview=profileNavigation(config,can,false)
 const ordered=profileNavigation({...config,hidden:[]},()=>true,true)
 function move(key:'sections'|'items',id:string,delta:number){
  const list=key==='sections'?ordered.map(g=>g.section):ordered.flatMap(g=>g.items.map(i=>i.href));const index=list.indexOf(id);const next=index+delta;if(next<0||next>=list.length)return;[list[index],list[next]]=[list[next],list[index]];setConfig(c=>({...c,[key]:list}));setMessage('')
 }
 function toggle(hrefs:string[],hide:boolean){setConfig(c=>({...c,hidden:hide?Array.from(new Set([...c.hidden,...hrefs.filter(x=>x!=='/admin/roles')])):c.hidden.filter(x=>!hrefs.includes(x))}));setMessage('')}
 async function save(){setSaving(true);setMessage('');try{
  if(config.home&&!preview.some(g=>g.items.some(i=>i.href===config.home)))throw new Error('Choisissez une page d’accueil visible et autorisée.')
  const {error}=await supabase.rpc('save_profile_navigation',{p_domain:activeDomain!.domain_id,p_role:roleId,p_config:config});if(error)throw error;window.dispatchEvent(new Event('profile-navigation-updated'));setMessage('Menu enregistré pour ce profil et ce client. Les autres utilisateurs le verront au rechargement.')
 }catch(e:any){setMessage(e.message||'Enregistrement impossible')}finally{setSaving(false)}}
 if(loading)return <p>{_ui("Chargement du menu…")}</p>
 return <section className="mt-6 border-t border-border pt-5 space-y-4"><h2 className="font-bold text-heading">{_ui("Menu du profil ·")}{" "}{activeDomain?.domain_name}</h2><p className="text-caption text-fg-secondary">{_ui("Ces réglages ne changent pas les droits. L’aperçu utilise la matrice affichée : enregistrez séparément les permissions modifiées. L’accès Rôles & Permissions reste visible aux utilisateurs habilités.")}</p>{error?<p role="alert" className="text-warning">{_uiNode(error)}</p>:<>
 <label className="block text-caption">{_ui("Page d’accueil")}<select aria-label={_ui("Page d’accueil du profil")} className="block border border-border bg-surface-raised rounded p-2 mt-1" value={config.home} onChange={e=>setConfig(c=>({...c,home:e.target.value}))}><option value="">{_ui("Accueil automatique existant")}</option>{preview.flatMap(g=>g.items).map(i=><option key={i.href} value={i.href}>{_uiNode(i.label)}</option>)}</select></label>
 <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4"><div className="space-y-3">{ordered.map((g,index)=><details key={g.section} className="border border-border rounded-lg p-3"><summary className="cursor-pointer font-semibold" style={{borderLeft:`3px solid ${g.color}`,paddingLeft:8}}>{g.section}</summary><div className="flex flex-wrap gap-2 my-3"><Button size="xs" variant="ghost" disabled={index===0} onClick={()=>move('sections',g.section,-1)}>{_ui("↑ Monter")}</Button><Button size="xs" variant="ghost" disabled={index===ordered.length-1} onClick={()=>move('sections',g.section,1)}>{_ui("↓ Descendre")}</Button><Button size="xs" variant="ghost" onClick={()=>toggle(g.items.map(i=>i.href),false)}>{_ui("Tout afficher")}</Button><Button size="xs" variant="ghost" onClick={()=>toggle(g.items.map(i=>i.href),true)}>{_ui("Masquer")}</Button></div><label className="text-caption"><input type="checkbox" checked={config.expanded.includes(g.section)} onChange={e=>setConfig(c=>({...c,expanded:e.target.checked?[...c.expanded,g.section]:c.expanded.filter(s=>s!==g.section)}))}/> {" "}{_ui("Déplié par défaut")}</label>{g.items.map((i,n)=><div key={i.href} className="flex items-center justify-between gap-2 py-2 border-b border-border"><label className="text-caption"><input type="checkbox" disabled={i.href==='/admin/roles'} checked={!config.hidden.includes(i.href)} onChange={e=>toggle([i.href],!e.target.checked)}/> {_uiNode(i.label)}{i.platformOnly?_ui("· plateforme"):i.moduleCode&&!can(i.moduleCode)?_ui("· sans droit de consultation"):''}</label><div className="flex"><Button size="xs" variant="ghost" aria-label={_ui("Monter {v0}",{v0:String(i.label)})} disabled={n===0} onClick={()=>move('items',i.href,-1)}>↑</Button><Button size="xs" variant="ghost" aria-label={_ui("Descendre {v0}",{v0:String(i.label)})} disabled={n===g.items.length-1} onClick={()=>move('items',i.href,1)}>↓</Button></div></div>)}</details>)}</div>
 <aside className="rounded-lg border border-border bg-surface-sunk p-4 self-start"><h3 className="font-bold mb-3">{_ui("Aperçu du profil standard")}</h3>{preview.map(g=><div key={g.section} className="mb-4"><p className="font-semibold text-caption" style={{borderLeft:`3px solid ${g.color}`,paddingLeft:8}}>{g.section}</p>{g.items.map(i=><p className="text-caption ml-3 mt-2" key={i.href}>{_uiNode(i.label)}{config.home===i.href?_ui("· Accueil"):''}</p>)}</div>)}</aside></div>
 <div className="flex flex-wrap gap-2"><Button onClick={save} loading={saving}>{_ui("Enregistrer le menu")}</Button><Button variant="ghost" disabled={saving} onClick={()=>{setConfig(defaultMenu);setMessage('Menu standard restauré dans l’aperçu. Enregistrez pour appliquer.')}}>{_ui("Restaurer le menu standard")}</Button></div></>}{message&&<p role="status" className="text-caption">{_uiNode(message)}</p>}</section>
}
