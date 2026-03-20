export default function Page() {
  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-xl font-bold mb-1">📈 Suivi Production</h2>
          <p className="text-sm text-[#8b949e]">Module complet — Campagne 2025-2026</p>
        </div>
        <button className="bg-[#e05c3b] text-white px-4 py-2 rounded-lg text-sm font-medium">+ Nouveau</button>
      </div>
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-16 text-center">
        <div className="text-5xl mb-4 opacity-30">🍅</div>
        <div className="font-display text-base font-bold text-[#8b949e] mb-2">Module en cours de déploiement</div>
        <div className="text-sm text-[#4a5568] max-w-sm mx-auto">
          Ce module avec saisie de données, formulaires et historique complet est branché sur Supabase en production.
        </div>
      </div>
    </div>
  )
}
