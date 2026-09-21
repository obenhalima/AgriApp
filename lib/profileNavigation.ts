import {NAV,type NavSection} from './navigation'
export type MenuConfig={hidden:string[];sections:string[];items:string[];expanded:string[];home:string}
export const defaultMenu:MenuConfig={hidden:[],sections:[],items:[],expanded:[],home:''}
export function profileNavigation(config:MenuConfig|null,can:(module:string)=>boolean,platform=false):NavSection[]{
 const c=config||defaultMenu
 const rank=(key:string,list:string[])=>list.includes(key)?list.indexOf(key):list.length
 return NAV.map(g=>({...g,items:g.items.filter(i=>(!i.moduleCode||can(i.moduleCode))&&(!i.platformOnly||platform)&&(!c.hidden.includes(i.href)||i.href==='/admin/roles')).sort((a,b)=>rank(a.href,c.items)-rank(b.href,c.items))})).filter(g=>g.items.length).sort((a,b)=>rank(a.section,c.sections)-rank(b.section,c.sections))
}
