import { KpiCard } from '@/components/dashboard/KpiCard'

const ALERTES = [
  { type:'error', titre:'Facture en retard', msg:'Groupe Carrefour — FV-2026-0086 — 41 000 MAD — Échue le 31/03', date:"Aujourd'hui" },
  { type:'warning', titre:'Stock critique', msg:'Filets 1kg cerise — Stock actuel 4800 < Seuil minimum 5000 unités', date:'Hier' },
  { type:'warning', titre:'Stock critique', msg:'Nitrate de Calcium — Stock 320 kg < Seuil 400 kg — Réapprovisionnement conseillé', date:'Hier' },
  { type:'info', titre:'Budget dépassé', msg:'Catégorie Engrais — Réel 412 000 MAD vs Prévu 380 000 MAD (+8.4%)', date:'Il y a 2 jours' },
  { type:'info', titre:'Rendement Serre S04', msg:'Production en dessous de l\'objectif — 33.2 kg/m² vs 35 attendus (-5.1%)', date:'Il y a 3 jours' },
]

const STYLE: Record<string, string> = {
  error: 'bg-[#4a1a1a] border-[rgba(248,81,73,0.3)] text-[#f85149]',
  warning: 'bg-[#3d2e0a] border-[rgba(210,153,34,0.3)] text-[#d29922]',
  info: 'bg-[#0d2149] border-[rgba(56,139,253,0.3)] text-[#388bfd]',
}

export default function AlertesPage() {
  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-xl font-bold mb-1">🔔 Centre d'Alertes</h2>
          <p className="text-sm text-[#8b949e]">{ALERTES.length} alertes actives</p>
        </div>
        <button className="bg-[#232c3d] text-[#e6edf3] px-4 py-2 rounded-lg text-sm font-medium border border-[#30363d]">✓ Tout marquer lu</button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-5">
        <KpiCard label="Critiques" value="1" color="red" />
        <KpiCard label="Avertissements" value="3" color="amber" />
        <KpiCard label="Informations" value="1" color="blue" />
        <KpiCard label="Résolues ce mois" value="8" color="green" />
      </div>

      <div className="flex flex-col gap-3">
        {ALERTES.map((a, i) => (
          <div key={i} className={`flex items-start justify-between p-4 rounded-xl border ${STYLE[a.type]}`}>
            <div>
              <div className="font-semibold text-sm mb-1">{a.titre}</div>
              <div className="text-xs opacity-85 mb-1">{a.msg}</div>
              <div className="text-[11px] opacity-60">{a.date}</div>
            </div>
            <div className="flex gap-2 ml-4 flex-shrink-0">
              <button className="px-3 py-1 rounded-lg text-xs bg-[#232c3d] text-[#e6edf3] border border-[#30363d] hover:bg-[#1c2333]">Voir</button>
              <button className="px-3 py-1 rounded-lg text-xs bg-transparent border border-current opacity-60 hover:opacity-100">✓ Résoudre</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
