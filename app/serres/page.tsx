'use client'
import { KpiCard } from '@/components/dashboard/KpiCard'

const SERRES = [
  { code:'S01', nom:'Serre Nord A', superficie:6200, exploitable:5800, statut:'active', type:'Tunnel', varietes:['Vitalia','Torero'], rendement_th:47, rendement_reel:44.2, production:256, couleur:'#e05c3b' },
  { code:'S02', nom:'Serre Nord B', superficie:6200, exploitable:5800, statut:'active', type:'Tunnel', varietes:['Torero'], rendement_th:50, rendement_reel:48.8, production:283, couleur:'#3fb950' },
  { code:'S03', nom:'Serre Sud A', superficie:5500, exploitable:5100, statut:'active', type:'Chapelle', varietes:['Grappe Premium'], rendement_th:40, rendement_reel:38.5, production:196, couleur:'#a371f7' },
  { code:'S04', nom:'Serre Sud B', superficie:5500, exploitable:5000, statut:'active', type:'Chapelle', varietes:['Cherry Sun'], rendement_th:35, rendement_reel:33.2, production:166, couleur:'#388bfd' },
  { code:'S05', nom:'Serre Est A', superficie:4800, exploitable:4400, statut:'active', type:'Venlo', varietes:['Vitalia'], rendement_th:45, rendement_reel:43.0, production:189, couleur:'#d29922' },
  { code:'S06', nom:'Serre Est B', superficie:4800, exploitable:4200, statut:'en_preparation', type:'Venlo', varietes:[], rendement_th:48, rendement_reel:0, production:0, couleur:'#4a5568' },
  { code:'S07', nom:'Serre Ouest A', superficie:5100, exploitable:4700, statut:'active', type:'Tunnel', varietes:['Brillante'], rendement_th:35, rendement_reel:34.0, production:160, couleur:'#f07050' },
  { code:'S08', nom:'Serre Centrale', superficie:3900, exploitable:3500, statut:'active', type:'Chapelle', varietes:['Cherry Sun'], rendement_th:30, rendement_reel:27.5, production:96, couleur:'#58a6ff' },
]

const COLORS = ['#e05c3b','#3fb950','#388bfd','#a371f7','#d29922']

export default function SerresPage() {
  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-xl font-bold mb-1">🏗️ Serres & Infrastructure</h2>
          <p className="text-sm text-[#8b949e]">Domaine Souss Agri · 8 serres · 42 000 m² exploitable</p>
        </div>
        <button className="btn-primary">+ Nouvelle Serre</button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-5">
        <KpiCard label="Serres actives" value="7" sub="1 en préparation" color="green" />
        <KpiCard label="Surface totale" value="42 000 m²" sub="exploitable cette campagne" color="blue" />
        <KpiCard label="En production" value="7" sub="serres actives" color="tomato" />
        <KpiCard label="Rendement moyen" value="41.4 kg/m²" sub="campagne en cours" color="amber" />
      </div>

      <div className="grid grid-cols-4 gap-4">
        {SERRES.map(s => {
          const pct = s.rendement_th > 0 ? Math.round((s.rendement_reel / s.rendement_th) * 100) : 0
          return (
            <div key={s.code} className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden hover:border-[#e05c3b] hover:-translate-y-0.5 transition-all cursor-pointer">
              <div className="flex items-start justify-between p-4 border-b border-[#30363d]">
                <div>
                  <div className="font-display text-[15px] font-bold mb-1">{s.nom}</div>
                  <div className="text-xs text-[#4a5568]">{s.code} · {s.type}</div>
                </div>
                <span className={s.statut === 'active' ? 'status-active' : 'status-pending'}>
                  {s.statut === 'active' ? '● actif' : '● prép.'}
                </span>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <div className="text-[10px] text-[#4a5568] mb-1">Superficie totale</div>
                    <div className="text-sm font-semibold">{s.superficie.toLocaleString('fr')} m²</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#4a5568] mb-1">Exploitable</div>
                    <div className="text-sm font-semibold">{s.exploitable.toLocaleString('fr')} m²</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#4a5568] mb-1">Production</div>
                    <div className="text-sm font-semibold" style={{ color: '#f07050' }}>
                      {s.production > 0 ? `${s.production} t` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#4a5568] mb-1">Rendement</div>
                    <div className="text-sm font-semibold" style={{ color: s.rendement_reel >= s.rendement_th * 0.95 ? '#3fb950' : '#d29922' }}>
                      {s.rendement_reel > 0 ? `${s.rendement_reel} kg/m²` : '—'}
                    </div>
                  </div>
                </div>
                {s.varietes.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10px] text-[#4a5568] mb-2">Variétés plantées</div>
                    <div className="flex flex-wrap gap-1">
                      {s.varietes.map((v, i) => (
                        <span key={v} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#1c2333] border border-[#30363d]">
                          <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % 5] }} />
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {s.statut === 'active' && s.rendement_reel > 0 && (
                  <div>
                    <div className="flex justify-between text-[10px] text-[#4a5568] mb-1">
                      <span>Avancement récolte</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-[#232c3d] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: s.couleur }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
