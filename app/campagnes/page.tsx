// Campagnes
export default function CampagnesPage() {
  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-xl font-bold mb-1">📅 Campagnes de Production</h2>
          <p className="text-sm text-[#8b949e]">1 campagne en cours</p>
        </div>
        <button className="bg-[#e05c3b] text-white px-4 py-2 rounded-lg text-sm font-medium">+ Nouvelle Campagne</button>
      </div>

      <div className="bg-[#161b22] border rounded-xl p-5 mb-5" style={{borderColor:'rgba(224,92,59,0.3)', background:'linear-gradient(135deg,rgba(224,92,59,0.05),transparent)'}}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="font-display text-lg font-extrabold mb-1">Campagne 2025-2026</div>
            <div className="text-sm text-[#8b949e]">01 Octobre 2025 → 30 Juin 2026 · Domaine Souss Agri</div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-[#1a4a24] text-[#3fb950]">● En cours</span>
        </div>
        <div className="grid grid-cols-5 gap-4 mb-4">
          {[
            ['Surface Totale','42 000 m²'],['Objectif Production','1 850 t'],
            ['Budget Total','4.20 M MAD'],['Récolte à ce jour','1 124 t'],['Avancement','60.8%']
          ].map(([k,v]) => (
            <div key={k}>
              <div className="text-[10px] text-[#4a5568] mb-1">{k}</div>
              <div className="text-base font-bold">{v}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="text-[10px] text-[#4a5568] mb-2">Jalons de la campagne</div>
          <div className="h-1.5 bg-[#232c3d] rounded-full mb-2 overflow-hidden">
            <div className="h-full rounded-full" style={{width:'65%',background:'linear-gradient(90deg,#e05c3b,#f07050)'}} />
          </div>
          <div className="flex justify-between text-[10px] text-[#4a5568]">
            <span>✓ Préparation (Oct)</span><span>✓ Plantation (Nov)</span>
            <span>✓ 1ère récolte (Jan)</span><span className="text-[#f07050]">▶ En cours (Mars)</span><span>Fin récolte (Juin)</span>
          </div>
        </div>
      </div>

      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
        <div className="font-display font-bold text-sm mb-4">Historique des Campagnes</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#30363d]">
              {['Campagne','Période','Surface','Prod. Réelle','CA','Marge','Statut'].map(h=>(
                <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-[#4a5568] uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['Campagne 2025-2026','Oct 2025 → Jun 2026','42 000 m²','1 124 t (en cours)','3.01 M MAD','38.4%','active'],
              ['Campagne 2024-2025','Oct 2024 → Jun 2025','38 500 m²','1 742 t','5.22 M MAD','36.3%','done'],
              ['Campagne 2023-2024','Oct 2023 → Jun 2024','35 200 m²','1 389 t','4.51 M MAD','31.8%','done'],
            ].map(([nom,periode,surface,prod,ca,marge,st]) => (
              <tr key={nom} className="border-b border-[#30363d]/50 hover:bg-[#1c2333]">
                <td className="px-3 py-3 font-semibold">{nom}</td>
                <td className="px-3 py-3 text-[#8b949e] text-xs">{periode}</td>
                <td className="px-3 py-3 font-mono text-xs">{surface}</td>
                <td className="px-3 py-3 font-mono text-xs">{prod}</td>
                <td className="px-3 py-3 font-mono text-xs">{ca}</td>
                <td className="px-3 py-3 font-mono text-xs text-[#3fb950] font-semibold">{marge}</td>
                <td className="px-3 py-3">
                  <span className={st==='active'?'px-2 py-0.5 rounded-full text-xs bg-[#1a4a24] text-[#3fb950]':'px-2 py-0.5 rounded-full text-xs bg-[#0d2149] text-[#388bfd]'}>
                    {st==='active'?'● En cours':'● Terminée'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
