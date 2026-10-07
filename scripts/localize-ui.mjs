/** Source-aware UI migration. Never rewrites persisted values, query filters or codes. */
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const normalized = s => s.replace(/\s+/g, ' ').trim()
const protectedText = /^(?:ItriX.*|ITRIX.*|MAD|DH|CNSS|DAR|LMR|EC|pH|PH|GPS|FIFO|NPK|AMM|KPI|CA|CPC|EBITDA|kg|g|L|ml|m[lL]|ha|m²|m³|kg\/ha|kg\/m²|kg\/m³|DH\/kg|MAD\/kg|PDF|CSV|Excel|WhatsApp|Telegram|Supabase|LIVE|OK|FR|EN|AR|STN-.*|BL-.*|NPK 20-20-20|0\.00|8\.50|12\.50|100)$/i
const natural = s => /[a-zÀ-ÿ]{2}/i.test(s) && !protectedText.test(s) && !/^(?:https?:|\/|#[\da-f]+$|var\(|\d{4}-\d{2}-\d{2})/i.test(s)
const attributes = new Set(['title','label','placeholder','aria-label','description','subtitle','empty','saveLabel','message','tooltip','emptyMessage','emptyTitle','emptyDescription','searchPlaceholder','loadingText'])
const componentFunctions = new Set()
const sources = new Map()
const files = []
function collectFiles(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    const file = `${dir}/${entry.name}`
    if (entry.isDirectory()) collectFiles(file)
    else if (/\.tsx$/.test(file) && !/\.test\./.test(file) && !['app/layout.tsx','app/pwa/[icon]/route.tsx'].includes(file)) files.push(file)
  }
}
collectFiles('app'); collectFiles('components')
const plans = []
function add(source,file) {
  source = normalized(source)
  if (!natural(source)) return false
  if (!sources.has(source)) sources.set(source, new Set())
  sources.get(source).add(file)
  return true
}
function componentOwner(node) {
  for (let p=node.parent;p;p=p.parent) {
    if (ts.isFunctionDeclaration(p) && p.body && (p.name && /^[A-Z]/.test(p.name.text) || p.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword))) return p
    if ((ts.isArrowFunction(p)||ts.isFunctionExpression(p)) && ts.isBlock(p.body)) {
      let parent=p.parent
      if (ts.isCallExpression(parent) && /(?:forwardRef|memo)$/.test(parent.expression.getText())) parent=parent.parent
      if (ts.isVariableDeclaration(parent) && /^[A-Z]/.test(parent.name.getText())) return p
    }
  }
  return null
}
function contains(node,other) { return node.pos<=other.pos && node.end>=other.end }
function isUIExpression(node) {
  for(let p=node;p.parent;p=p.parent) {
    const parent=p.parent
    if(ts.isJsxElement(parent)&&['style','script','code'].includes(parent.openingElement.tagName.getText()))return false
    if(ts.isJsxAttribute(parent)&&!attributes.has(parent.name.getText()))return false
    if(ts.isCallExpression(parent)&& /(?:^|\.)(?:alert|confirm|prompt|success|error|warning|info)$/.test(parent.expression.getText()) && !/console\./.test(parent.expression.getText()) && parent.arguments.includes(p)) return true
    if(ts.isJsxExpression(parent)) {
      if(ts.isJsxAttribute(parent.parent)&&!attributes.has(parent.parent.name.getText()))return false
      return true
    }
    if(ts.isBinaryExpression(parent)&&[ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken,ts.SyntaxKind.EqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsToken].includes(parent.operatorToken.kind))return false
    if(ts.isPropertyAssignment(parent)&&!['label','title','description','subtitle','detail','text','message','empty','saveLabel'].includes(parent.name.getText().replace(/['"]/g,'')))return false
    if(ts.isCallExpression(parent)) {
      const name=parent.expression.getText()
      if(/(?:_ui|\bt|\.includes|\.eq|\.in|\.rpc|\.from|\.insert|\.update|\.select|\.order|\.getItem|\.setItem|new URL)/.test(name))return false
      if(parent.arguments.includes(p))return false
    }
    if(ts.isConditionalExpression(parent)&&contains(parent.condition,p))return false
    if(ts.isSourceFile(parent))return false
  }
  return false
}
for(const file of files) {
  let text=fs.readFileSync(file,'utf8')
  if(process.argv.includes('--repair-attributes')) {
    text=text.replace(/([\w:-]+)\s*=\s*_ui\(\s*("(?:\\.|[^"\\])*")\s*\)/g,(_,name,value)=>name+'='+value)
    fs.writeFileSync(file,text)
  }
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  const edits=[],owners=new Set()
  function emit(node,sourceText,replacement,start=node.getStart(source),end=node.end) {
    const owner=componentOwner(node)
    if(!owner||!add(sourceText,file))return
    edits.push({start,end,replacement});owners.add(owner)
  }
  function visit(node) {
    if(ts.isJsxElement(node)&&['style','script','code'].includes(node.openingElement.tagName.getText()))return
    if(ts.isJsxExpression(node)&&!ts.isJsxAttribute(node.parent)&&node.expression) {
      const exp=node.expression
      const name=ts.isIdentifier(exp)?exp.text:ts.isPropertyAccessExpression(exp)?exp.name.text:''
      const map=ts.isElementAccessExpression(exp)&&/(?:label|title|heading|status|field)/i.test(exp.expression.getText())
      if(/^(?:label|heading|subtitle|hint|empty|error|msg|message|sub|description|detail|headline|oneLiner)$/.test(name)||map) {
        const owner=componentOwner(node)
        if(owner){edits.push({start:exp.getStart(source),end:exp.end,replacement:`_uiNode(${exp.getText(source)})`});owners.add(owner)}
      }
    }
    if(ts.isJsxText(node)) {
      const label=normalized(node.text)
      const before=/^\s/.test(node.text)?'{" "}':''
      const after=/\s$/.test(node.text)?'{" "}':''
      emit(node,label,`${before}{_ui(${JSON.stringify(label)})}${after}`)
    } else if(ts.isJsxAttribute(node)&&attributes.has(node.name.getText())&&node.initializer&&ts.isStringLiteral(node.initializer)) {
      const label=normalized(node.initializer.text)
      emit(node,label,`{_ui(${JSON.stringify(label)})}`,node.initializer.getStart(source),node.initializer.end)
      return
    } else if(ts.isStringLiteral(node)&&isUIExpression(node)&&!(/^[a-z][a-z\d_.-]*$/.test(node.text))) {
      const label=normalized(node.text)
      emit(node,label,`_ui(${JSON.stringify(label)})`)
    } else if(ts.isNoSubstitutionTemplateLiteral(node)&&isUIExpression(node)) {
      const label=normalized(node.text)
      emit(node,label,`_ui(${JSON.stringify(label)})`)
    } else if(ts.isTemplateExpression(node)&&isUIExpression(node)) {
      let label=node.head.text;const values=[]
      node.templateSpans.forEach((part,index)=>{label+=`{v${index}}`+part.literal.text;values.push(`v${index}:String(${part.expression.getText(source)})`)})
      emit(node,label,`_ui(${JSON.stringify(normalized(label))},{${values.join(',')}})`)
      return
    }
    ts.forEachChild(node,visit)
  }
  visit(source)
  // Discover component labels held in constant maps/arrays. They are translated
  // at the display boundary, not in these objects (some are also persisted).
  function discover(node) {
    if(ts.isCallExpression(node)&&['_ui','t'].includes(node.expression.getText())&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))add(node.arguments[0].text,file)
    if(ts.isStringLiteral(node)&&node.parent&&ts.isPropertyAssignment(node.parent)&&['label','title','description','subtitle','detail','text','message','empty','saveLabel'].includes(node.parent.name.getText().replace(/['"]/g,''))) add(node.text,file)
    if(ts.isStringLiteral(node)&&node.parent&&ts.isNewExpression(node.parent)&&node.parent.expression.getText()==='Error')add(node.text,file)
    if(ts.isVariableDeclaration(node)&&/(?:LABEL|STATUS|TABS|FIELDS|COLUMNS|SECTIONS|REASON|CAT|GUIDE)/i.test(node.name.getText())&&node.initializer){
      const literals=n=>{if(ts.isStringLiteral(n)&&!(ts.isPropertyAssignment(n.parent)&&n.parent.name===n))add(n.text,file);ts.forEachChild(n,literals)}
      literals(node.initializer)
    }
    ts.forEachChild(node,discover)
  }
  discover(source)
  if(edits.length) {
    for(const owner of owners) {
      componentFunctions.add(file+':'+(owner.name?.text||'render'))
      if(!owner.body.getText(source).includes('t:_ui'))edits.push({start:owner.body.getStart(source)+1,end:owner.body.getStart(source)+1,replacement:'\n const {t:_ui,text:_uiNode}=useLanguage()\n'})
    }
    // Recreate callbacks that now close over a translated UI message.
    function callbacks(node) {
      if(ts.isCallExpression(node)&&['useCallback','useMemo','useEffect'].includes(node.expression.getText())&&node.arguments.length>1&&ts.isArrayLiteralExpression(node.arguments[1])) {
        const cb=node.arguments[0],deps=node.arguments[1]
        if(edits.some(e=>e.start>=cb.pos&&e.end<=cb.end)&&!deps.elements.some(e=>e.getText()==='_ui')) edits.push({start:deps.end-1,end:deps.end-1,replacement:deps.elements.length?',_ui':'_ui'})
      }
      ts.forEachChild(node,callbacks)
    }
    callbacks(source)
    if(!text.includes("from '@/lib/i18n'")&&!text.includes('from "@/lib/i18n"')) {
      const hasClient=source.statements[0]?.getText(source).includes('use client')
      const position=hasClient?source.statements[0].end:0
      edits.push({start:position,end:position,replacement:(hasClient?'\n':"'use client'\n")+"import {useLanguage} from '@/lib/i18n'\n"})
    }
    plans.push({file,text,edits})
  }
}
// App-owned messages from TypeScript utilities can appear in toast/error boxes.
for(const file of ['lib/navigation.tsx','lib/aiInsights.ts','lib/agronomy360.ts','lib/modules.ts','lib/harvestPeople.ts','lib/harvestMigration.ts','lib/costWorkbookExchange.ts','lib/costWorkbookPlan.ts']) {
  if(!fs.existsSync(file))continue
  const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true)
  function visit(node){
    if(ts.isStringLiteral(node)&&natural(node.text)&&(/[À-ÿ ]/.test(node.text)||node.text==='Dashboard'))add(node.text,file)
    if(ts.isTemplateExpression(node)){let label=node.head.text;node.templateSpans.forEach((p,i)=>label+=`{v${i}}`+p.literal.text);add(label,file)}
    ts.forEachChild(node,visit)
  }visit(source)
}
// Only system reference labels are extracted from migrations, never tenant seeds.
for(const filename of fs.readdirSync('supabase/migrations').filter(f=>/(?:reference_lists|purchase_category_ref|account_categories)/.test(f))) {
  const file='supabase/migrations/'+filename,text=fs.readFileSync(file,'utf8')
  const labels=/\(\s*'[^']+'\s*,\s*'[^']+'\s*,\s*'((?:''|[^'])+)'/g
  for(const match of text.matchAll(labels))add(match[1].replace(/''/g,"'"),file)
}
fs.mkdirSync('tmp',{recursive:true})
const entries=[...sources].map(([source,files])=>({source,files:[...files]})).sort((a,b)=>a.source.localeCompare(b.source,'fr'))
fs.writeFileSync('tmp/i18n-sources.json',JSON.stringify(entries,null,2)+'\n')
if(process.argv.includes('--apply')) {
  // This is a mechanical source migration. Refuse overlapping replacements.
  for(const {file,text,edits} of plans) {
    let output=text,previous=text.length+1
    for(const edit of edits.sort((a,b)=>b.start-a.start||b.end-a.end)) {
      if(edit.end>previous)throw Error('Overlapping UI edits: '+file+' '+edit.start)
      output=output.slice(0,edit.start)+edit.replacement+output.slice(edit.end);previous=edit.start
    }
    fs.writeFileSync(file,output)
  }
}
console.log(JSON.stringify({files:files.length,changedFiles:plans.length,components:componentFunctions.size,strings:entries.length,applied:process.argv.includes('--apply')}))
