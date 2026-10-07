import fs from 'node:fs'
for(const file of ['app/agronomie/dashboard/page.tsx','components/agronomy/TerrainOverview.tsx']){
 const source=fs.readFileSync(file,'utf8')
 const result=source.replace('{unit}</p>','{_ui(String(unit))}</p>').replace('{a.family} ·','{_ui(a.family)} ·').replace(/_ui\("(#[a-z-]+)"\)/g,'"$1"').replace('{days} j / {absence} j','{days} {_ui("jours")} / {absence} {_ui("jours")}')
 if(source!==result)fs.writeFileSync(file,result)
}
