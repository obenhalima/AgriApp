import {describe,it,expect} from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import {messages} from './i18nCatalog'
describe('Global interface translation coverage',()=>{
 it('provides both languages for every explicit interface message',()=>{
  const missing:string[]=[]
  function walk(dir:string){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory()){walk(file);continue}if(!file.endsWith('.tsx'))continue
  const tree=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  function visit(n:ts.Node){if(ts.isCallExpression(n)&&['_ui','t'].includes(n.expression.getText(tree))&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0])){const key=n.arguments[0].text.replace(/\s+/g,' ').trim();if(/[a-zÀ-ÿ]{2}/i.test(key)&&!messages[key]&&!/^(?:ItriX.*|ITRIX.*|MAD|DH|CNSS|DAR|LMR|EC|pH|PH|GPS|FIFO|NPK|AMM|KPI|CA|CPC|EBITDA|kg|g|L|ml|ha|m²|m³|PDF|CSV|Excel|WhatsApp|Telegram|Supabase|LIVE|OK|FR|EN|AR)$/i.test(key))missing.push(file+': '+key)}ts.forEachChild(n,visit)}visit(tree)
  }}walk('app');walk('components')
  expect(missing).toEqual([])
 },30000)
})
