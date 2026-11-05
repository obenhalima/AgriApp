// Read-only local readiness check; no browser session or credentials are inspected.
const base=process.env.TEST_BASE_URL||'http://localhost:3103'
const response=await fetch(base+'/factures'),html=await response.text()
console.log(JSON.stringify({path:'/factures',status:response.status}))
const files=Array.from(new Set(Array.from(html.matchAll(/src="(\/_next\/static\/[^" ]+)"/g),m=>m[1].replaceAll('&amp;','&'))))
for(const path of files){const result=await fetch(base+path);console.log(JSON.stringify({path,status:result.status}));if(!result.ok)process.exitCode=1}
