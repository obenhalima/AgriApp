// Remplace les placeholders du guide HTML par les vrais screenshots dans /guide-screenshots/.
// Chaque <div class="sw">...placeholder...</div> est remplacé par <div class="sw"><img.../></div>.
// Mapping basé sur le titre dans le placeholder (font-weight:700;color:#1e293b).

import fs from 'node:fs'
import path from 'node:path'

const file = path.resolve('public/guide-utilisateur.html')
let html = fs.readFileSync(file, 'utf8')

// Mapping titre placeholder → nom de fichier
const map = [
  { match: 'Dashboard — Capture réelle',                file: 'dashboard.png',     alt: 'Dashboard' },
  { match: 'Dashboard — KPIs & Graphiques',              file: 'dashboard-kpis.png', alt: 'Dashboard — KPIs' },
  { match: 'Récoltes — 9 lots · 13.7t · 146k MAD',       file: 'recoltes.png',      alt: 'Récoltes' },
  { match: 'Production — 5 plantations · 2.12ha · 1003t',file: 'production.png',    alt: 'Production' },
  { match: 'Agronomie — Journal cultural',               file: 'agronomie.png',     alt: 'Agronomie' },
  { match: 'Factures — 95 000 MAD encaissés',            file: 'factures.png',      alt: 'Factures' },
  { match: 'Campagnes — 2025-2026 active',               file: 'campagnes.png',     alt: 'Campagnes' },
  { match: 'Fournisseurs — 3 fournisseurs',              file: 'fournisseurs.png',  alt: 'Fournisseurs' },
  { match: 'Stocks — 4 articles · 1 alerte critique',    file: 'stocks.png',        alt: 'Stocks' },
  { match: 'Coûts & Budget — 1135 kMAD réels',           file: 'couts.png',         alt: 'Coûts & Budget' },
]

let replaced = 0
for (const m of map) {
  // Le bloc placeholder est :
  // <div class="sw"><div style="background:#eef2ff;...">
  //   <div style="font-size:2rem;...">EMOJI</div>
  //   <div style="font-weight:700;...">TITRE</div>
  //   <div style="color:#64748b;...">SOUS-TITRE</div>
  // </div></div>
  //
  // On le remplace par : <div class="sw"><img .../></div>
  const re = new RegExp(
    '<div class="sw"><div style="background:#[^"]*">[\\s\\S]*?' +
    m.match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    '[\\s\\S]*?</div></div>',
    'g'
  )
  const before = html.length
  html = html.replace(re, () => {
    replaced++
    return `<div class="sw"><img src="/guide-screenshots/${m.file}" alt="${m.alt}" loading="lazy" style="max-width:100%;border-radius:10px;border:1px solid #e5e7eb;display:block;box-shadow:0 1px 3px rgba(0,0,0,.08)" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<div style=\\'background:#fef3c7;border-radius:10px;padding:24px;text-align:center;border:2px dashed #f59e0b;color:#92400e;font-size:0.9rem\\'>⚠ Image manquante : /guide-screenshots/${m.file}</div>')"/></div>`
  })
  if (html.length === before) {
    console.warn(`⚠ Pattern not found for: ${m.match}`)
  }
}

fs.writeFileSync(file, html, 'utf8')
console.log(`✓ ${replaced}/${map.length} placeholders remplacés.`)
