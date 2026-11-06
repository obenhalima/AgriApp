import {describe,it,expect} from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import {messages} from './i18nCatalog'
import {FIELD_DOCS,SCREEN_DOCS} from './userDocumentation'
import {harvestWorkflow} from './harvestWorkflowDocumentation'

const technical=/^(?:ItriX.*|ITRIX.*|MAD(?:\/kg)?|DH|CNSS|DAR|LMR|EC|pH|PH|GPS|FIFO|NPK|AMM|KPI|CA|CPC|EBITDA|kg|g|L|ml|ha|m²|m³|PDF|CSV|Excel|WhatsApp|Telegram|Supabase|LIVE|OK|FR|EN|AR|DocIndex|https?:.*|ERP_[A-Z_]+|dik_.*|STN-.*|NPK [\d -]+|BL-[\d-]+)$/i
const attributes=new Set(['title','label','placeholder','description','subtitle','aria-label','aria-description','alt','saveLabel','cancelLabel','hint','help','emptyText'])

describe('Global interface translation coverage',()=>{
 it('provides Arabic and English for interface messages, attributes and conditional labels',()=>{
  const missing=new Set<string>()
  function check(file:string,value:string){
   const key=value.replace(/\s+/g,' ').trim()
   if(!/[a-zÀ-ÿ]{2}/i.test(key)||technical.test(key))return
   const pair=messages[key]
   if(!pair||pair.length!==2||pair.some(item=>typeof item!=='string'||!item.trim()))missing.add(file+': '+key)
  }
  function literal(file:string,node:ts.Expression){
   if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))check(file,node.text)
   else if(ts.isConditionalExpression(node)){literal(file,node.whenTrue);literal(file,node.whenFalse)}
  }
  function walk(directory:string){
   for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name)
    if(entry.isDirectory()){walk(file);continue}
    if(!file.endsWith('.tsx'))continue
    const tree=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
    function visit(node:ts.Node){
     if(ts.isPropertyAssignment(node)&&node.name.getText(tree)==='l')literal(file,node.initializer)
     if(ts.isCallExpression(node)&&['_ui','t','_uiNode','text','translateUI'].includes(node.expression.getText(tree))&&node.arguments[0])literal(file,node.arguments[0])
     if(ts.isJsxAttribute(node)&&node.initializer){
      const tag=node.parent.parent.tagName.getText(tree)
      const name=node.name.getText(tree)
      if(attributes.has(name)||(tag==='TranslatedText'&&name==='text')){
       if(ts.isStringLiteral(node.initializer))check(file,node.initializer.text)
       else if(ts.isJsxExpression(node.initializer)&&node.initializer.expression)literal(file,node.initializer.expression)
      }
     }
     ts.forEachChild(node,visit)
    }
    visit(tree)
   }
  }
  walk('app');walk('components')
  for(const field of FIELD_DOCS){
   for(const value of [...field.labels,field.purpose,field.example,field.caution])if(value)check('Field guide',value)
  }
  for(const screen of SCREEN_DOCS){
   for(const value of [screen.purpose,...screen.steps,...screen.cautions])check('Screen guide',value)
  }
  for(const value of [harvestWorkflow.purpose,...harvestWorkflow.prerequisites])check('Harvest guide',value)
  for(const stage of harvestWorkflow.stages){
   for(const value of [stage.name,stage.action,stage.result,stage.next])check('Harvest guide',value)
  }
  for(const rule of harvestWorkflow.billing){
   for(const value of [rule.mode,rule.behavior,rule.check])check('Billing guide',value)
  }
  expect([...missing]).toEqual([])
 },60000)
})
