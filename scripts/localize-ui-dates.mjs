import fs from 'node:fs'
import ts from 'typescript'
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=dir+'/'+entry.name;if(entry.isDirectory()){walk(file);continue}if(!file.endsWith('.tsx'))continue
const text=fs.readFileSync(file,'utf8'),source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[],owners=new Set()
function owner(n){for(let p=n.parent;p;p=p.parent){if(ts.isFunctionDeclaration(p)&&p.body&&p.name&&/^[A-Z]/.test(p.name.text))return p;if(ts.isArrowFunction(p)&&ts.isBlock(p.body)&&ts.isVariableDeclaration(p.parent)&&/^[A-Z]/.test(p.parent.name.getText()))return p}return null}
function visit(n){if(ts.isStringLiteral(n)&&n.text==='fr-FR'){const fn=owner(n);if(fn&&fn.body.getText().includes('const {t:_ui,text:_uiNode}')){edits.push({start:n.getStart(),end:n.end,value:'_uiLocale'});owners.add(fn)}}ts.forEachChild(n,visit)}visit(source)
for(const fn of owners){const pos=text.indexOf('const {t:_ui,text:_uiNode}',fn.body.getStart());if(pos>=0&&pos<fn.body.end)edits.push({start:pos,end:pos+'const {t:_ui,text:_uiNode}'.length,value:'const {t:_ui,text:_uiNode,intlLocale:_uiLocale}'})}
let result=text;for(const e of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,e.start)+e.value+result.slice(e.end);if(result!==text)fs.writeFileSync(file,result)
}}
walk('app');walk('components')
