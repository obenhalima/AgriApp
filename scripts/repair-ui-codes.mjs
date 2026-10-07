import fs from 'node:fs'
import path from 'node:path'
const codes=new Set(['costKg','marginKg','marginArea','fontSize','fontColor','kMAD','cost_entries','avg_price_export','GEMINI_API_KEY','ai-analyze-cpc','confirm'])
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(f.endsWith('.tsx')){const old=fs.readFileSync(f,'utf8');const next=old.replace(/<style([^>]*)>\{_ui\(("(?:\\.|[^"\\])*")\)\}<\/style>/g,(_,attrs,s)=>'<style'+attrs+'>{'+s+'}</style>').replace(/_ui\(("(?:\\.|[^"\\])*")\)/g,(full,s)=>codes.has(JSON.parse(s))||/^[.#][\w-]+.*\{/.test(JSON.parse(s))?s:full);if(next!==old)fs.writeFileSync(f,next)}}}
walk('app');walk('components')
