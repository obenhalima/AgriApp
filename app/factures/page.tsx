'use client'
import { KpiCard } from '@/components/dashboard/KpiCard'

const FACTURES = [
  { num:'FV-2026-0089', client:'Souss Export SARL', date:'12/03/2026', echeance:'11/04/2026', montant:48500, statut:'en_attente' },
  { num:'FV-2026-0088', client:'Marjane Distribution', date:'08/03/2026', echeance:'07/04/2026', montant:32800, statut:'partiellement_paye' },
  { num:'FV-2026-0087', client:'EuroVeggie BV', date:'05/03/2026', echeance:'04/04/2026', montant:67200, statut:'en_attente' },
  { num:'FV-2026-0086', client:'Groupe Carrefour', date:'01/03/2026', echeance:'31/03/2026', montant:41000, statut:'en_retard' },
  { num:'FV-2026-0085', client:'Atlas Fresh Ltd', date:'25/02/2026', echeance:'26/03/2026', montant:29500, statut:'paye' },
  { num:'FV-2026-0084', client:'Marché Central Agadir', date:'20/02/2026', echeance:'21/03/2026', montant:12800, statut:'paye' },
]

const STATUS_STYLE: Record<string, string> = {
  paye: 'bg-[#0d2149] text-[#388bfd]',
  en_attente: 'bg-[#3d2e0a] text-[#d29922]',
  partiellement_paye: 'bg-[#3d2e0a] text-[#d29922]',
  en_retard: 'bg-[#4a1a1a] text-[#f85149]',
}
const STATUS_LABEL: Record<string, string> = {
  paye: '● payé', en_attente: '● en attente',
  partiellement_paye: '● part. payé', en_retard: '● en retard',
}

const totalFacture = FACTURES.reduce((s, f) => s + f.montant, 0)
const totalPaye = FACTURES.filter(f => f.statut === 'paye').reduce((s, f) => s + f.montant, 0)
const totalAttente = FACTURES.filter(f => f.statut === 'en_attente' || f.statut === 'partiellement_paye').reduce((s, f) => s + f.montant, 0)
const totalRetard = FACTURES.filter(f => f.statut === 'en_retard').reduce((s, f) => s + f.montant, 0)

export default function FacturesPage() {
  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-xl font-bold mb-1">🧾 Factures Clients</h2>
          <p className="text-sm text-[#8b949e]">6 factures · Encours : {totalAttente.toLocaleString('fr')} MAD</p>
        </div>
        <button className="btn-primary">+ Nouvelle Facture</button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-5">
        <KpiCard label="Total Facturé" value={`${(totalFacture/1000).toFixed(0)} k MAD`} sub="ce mois" color="blue" />
        <KpiCard label="Encaissé" value={`${(totalPaye/1000).toFixed(0)} k MAD`} sub="récupérés" color="green" />
        <KpiCard label="En attente" value={`${(totalAttente/1000).toFixed(0)} k MAD`} sub="à encaisser" color="amber" />
        <KpiCard label="En retard" value={`${(totalRetard/1000).toFixed(0)} k MAD`} sub="1 facture échue" color="red" />
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <input type="text" placeholder="🔍  N° facture, client…" className="form-input" style={{maxWidth:240}} />
            <select className="form-input" style={{maxWidth:160}}>
              <option>Tous statuts</option><option>En attente</option><option>En retard</option><option>Payé</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary text-xs">📥 Excel</button>
            <button className="btn-secondary text-xs">🖨️ PDF</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#30363d]">
                {['N° Facture','Client','Date','Échéance','Montant (MAD)','Statut','Actions'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#4a5568] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FACTURES.map(f => (
                <tr key={f.num} className="border-b border-[#30363d]/50 hover:bg-[#1c2333] transition-colors">
                  <td className="px-3 py-3 font-mono text-xs font-semibold">{f.num}</td>
                  <td className="px-3 py-3 font-medium">{f.client}</td>
                  <td className="px-3 py-3 text-[#8b949e] text-xs">{f.date}</td>
                  <td className="px-3 py-3 text-xs" style={{color: f.statut === 'en_retard' ? '#f85149' : '#8b949e', fontWeight: f.statut === 'en_retard' ? 700 : 400}}>
                    {f.echeance}
                  </td>
                  <td className="px-3 py-3 font-mono font-semibold">{f.montant.toLocaleString('fr')}</td>
                  <td className="px-3 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[f.statut]}`}>
                      {STATUS_LABEL[f.statut]}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <button className="btn-ghost text-xs px-2 py-1">👁️</button>
                      <button className="btn-secondary text-xs px-2 py-1">🖨️ PDF</button>
                      {f.statut !== 'paye' && <button className="btn-primary text-xs px-2 py-1">💳 Payer</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
