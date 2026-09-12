// Reports locations only, never secret values. Run before publishing source files.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','.env.example','.gitignore','.vercelignore','app','components','lib','public','scripts','supabase/migrations','supabase/verification','supabase/functions','docs','package.json','package-lock.json','next.config.js','tsconfig.json','vitest.config.mts','vercel.json'],{encoding:'utf8'}).trim().split(/\r?\n/)
const rules=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['github-token',/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/],['supabase-secret',/\bsb_secret_[A-Za-z0-9_-]{20,}\b/],['telegram-token',/\b\d{8,15}:[A-Za-z0-9_-]{30,}\b/],['google-api-key',/\bAIza[A-Za-z0-9_-]{30,}\b/],['jwt-literal',/\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/]]
let count=0
for(const file of new Set(paths)){
 if(!file||!fs.existsSync(file)||!fs.statSync(file).isFile())continue
 if(!/\.(?:ts|tsx|js|mjs|mts|json|md|sql|ps1|ya?ml)$/.test(file)&&file!=='.env.example')continue
 const lines=fs.readFileSync(file,'utf8').split('\n')
 for(let i=0;i<lines.length;i++)for(const [name,regex] of rules)if(regex.test(lines[i])){console.log(`${file}:${i+1} ${name}`);count++}
}
console.log(`Secret scan: ${count} candidate(s); ${new Set(paths).size} source paths inspected.`)
if(count)process.exitCode=1
