'use client'
import {useEffect,useMemo,useState} from 'react'
import Link from 'next/link'
import {Search,BookOpen} from 'lucide-react'
import {NAV} from '@/lib/navigation'
import {useAuth} from '@/lib/auth'
import {useLanguage} from '@/lib/i18n'
import {FIELD_DOCS,findScreenDoc} from '@/lib/userDocumentation'
import {DocumentationArticle} from './DocumentationArticle'
const normalize=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase()
export function UserWiki({embedded=false}:{embedded?:boolean}){
 const history={replaceState:(...args:Parameters<History['replaceState']>)=>{if(!embedded)window.history.replaceState(...args)}}
 const {t}=useLanguage(), {canAccessModule,isPlatformAdmin}=useAuth()
 const [query,setQuery]=useState(''),[selected,setSelected]=useState('/recoltes')
 useEffect(()=>{const screen=new URLSearchParams(window.location.search).get('screen');if(screen&&!embedded)setSelected(screen)},[embedded])
 const entries=useMemo(()=>NAV.flatMap(section=>section.items.filter(i=>i.href!=='/guide'&&(!i.platformOnly||isPlatformAdmin)&&(!i.moduleCode||canAccessModule(i.moduleCode))).map(item=>({item,section:section.section,doc:findScreenDoc(item.href)}))),[canAccessModule,isPlatformAdmin])
 const terms=normalize(query).trim().split(/\s+/).filter(Boolean)
 const matches=entries.filter(e=>{const content=normalize([t(e.item.label),t(e.section),t(e.item.description??''),t(e.doc?.purpose??''),...(e.doc?.steps??[]).map(value=>t(value)),...(e.doc?.cautions??[]).map(value=>t(value)),...(e.doc?.fields??[]).map(key=>{const f=FIELD_DOCS.find(v=>v.key===key);return f?[...f.labels,f.purpose,f.example,f.caution].map(value=>t(value??'')).join(' '):''})].join(' '));return terms.every(term=>content.includes(term))})
 useEffect(()=>{if(query.trim()&&matches.length&&!matches.some(e=>e.item.href===selected))setSelected(matches[0].item.href)},[query,selected,matches])
 const entry=entries.find(e=>e.item.href===selected),doc=entry?.doc
 return <div className="space-y-5"><section className="rounded-xl border border-border bg-surface-raised p-4"><label htmlFor="wiki-search" className="mb-2 block font-medium">{t('Rechercher dans le wiki')}</label><div className="flex items-center gap-3"><Search size={18}/><input id="wiki-search" type="search" value={query} onChange={e=>setQuery(e.target.value)} className="w-full rounded-lg border border-border bg-surface-input p-3" placeholder={t('Fonctionnalité, champ ou indicateur…')}/></div><p className="mt-3 text-sm text-fg-secondary">{t('Fiches détaillées')} : {entries.filter(e=>!!e.doc).length} / {entries.length} · {FIELD_DOCS.length} {t('Champs documentés')}</p></section><div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]"><nav aria-label={t('Articles du wiki')} className="max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-surface-raised p-3">{matches.length===0&&<p className="p-3 text-sm">{t('Aucun résultat')}</p>}{matches.map(e=><button type="button" key={e.item.href} onClick={()=>{setSelected(e.item.href);const url=new URL(window.location.href);url.searchParams.set('screen',e.item.href);history.replaceState(null,'',url)}} className={`mb-1 block w-full rounded-lg p-3 text-start ${selected===e.item.href?'bg-brand/10 text-brand':'hover:bg-surface-input'}`}><span className="block text-xs text-fg-secondary">{t(e.section)}</span><span className="block font-medium">{t(e.item.label)}</span><span className="block text-xs">{t(e.doc?'Fiche détaillée':'Présentation générale')}</span></button>)}</nav><section className="min-w-0 rounded-xl border border-border bg-surface-raised p-5"><h2 className="mb-4 flex items-center gap-2 text-xl font-semibold"><BookOpen size={20}/>{t(entry?.item.label??'Sélectionner une fonctionnalité')}</h2>{doc?<DocumentationArticle doc={doc}/>:entry?<div className="space-y-4"><p>{t(entry.item.description??entry.item.label)}</p><p className="rounded-lg border border-border p-3 text-sm">{t('La fiche détaillée de cet écran reste à compléter. Consultez le wiki et le guide général.')}</p></div>:null}{entry&&<Link href={entry.item.href} className="btn mt-5 inline-flex">{t('Ouvrir la fonctionnalité')}</Link>}</section></div></div>
}
