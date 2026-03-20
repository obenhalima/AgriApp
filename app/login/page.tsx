'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [selected, setSelected] = useState<'demo'|'empty'|null>(null)
  const [loading, setLoading] = useState(false)

  const start = () => {
    if (!selected) return
    setLoading(true)
    localStorage.setItem('tomatopilot_profile', selected)
    setTimeout(() => router.push('/'), 800)
  }

  const PROFILES = [
    { id: 'demo' as const, icon: '\u{1F331}', title: 'Profil Démo', desc: 'Données réalistes pré-chargées : 8 serres, 5 variétés, clients, factures, stocks et campagne complète.', tags: ['8 serres','5 variétés','6 clients','Campagne 2025-26'], accent: '#e05c3b', accentDim: 'rgba(224,92,59,0.08)', accentBorder: 'rgba(224,92,59,0.25)', tagBg: 'rgba(224,92,59,0.15)', tagColor: '#f07050' },
    { id: 'empty' as const, icon: '\u{1F3D7}\u{FE0F}', title: 'Démarrage Réel', desc: 'Application vide, prête à configurer avec vos propres fermes, serres, variétés et données réelles.', tags: ['Base vide','Votre ferme','Vos données','Connecté Supabase'], accent: '#388bfd', accentDim: 'rgba(56,139,253,0.08)', accentBorder: 'rgba(56,139,253,0.25)', tagBg: 'rgba(56,139,253,0.15)', tagColor: '#388bfd' },
  ]

  return (
    <div className="min-h-screen flex items-center justify-center" style={{background:'#0d1117'}}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-5" style={{background:'radial-gradient(circle, #e05c3b, transparent)'}} />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full opacity-5" style={{background:'radial-gradient(circle, #3fb950, transparent)'}} />
      </div>
      <div className="relative w-full max-w-lg px-6">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{background:'linear-gradient(135deg,#e05c3b,#c0392b)',boxShadow:'0 0 40px rgba(224,92,59,0.4)'}}>
            <span className="text-3xl">🍅</span>
          </div>
          <h1 className="font-display text-3xl font-extrabold mb-2">TomatoPilot</h1>
          <p className="text-[#8b949e] text-sm">Gestion de ferme de tomates sous serre</p>
        </div>
        <p className="text-center text-sm text-[#8b949e] mb-5 font-medium">Choisissez votre mode de démarrage</p>
        <div className="grid grid-cols-2 gap-4 mb-6">
          {PROFILES.map(p => (
            <button key={p.id} onClick={() => setSelected(p.id)}
              className="relative p-5 rounded-xl border-2 text-left transition-all duration-200 cursor-pointer"
              style={{background: selected===p.id ? p.accentDim : '#161b22', borderColor: selected===p.id ? p.accent : '#30363d', boxShadow: selected===p.id ? `0 0 20px ${p.accentDim}` : 'none'}}>
              {selected===p.id && <div className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center text-xs text-white" style={{background:p.accent}}>✓</div>}
              <div className="text-2xl mb-3">{p.icon}</div>
              <div className="font-display font-bold text-sm mb-2">{p.title}</div>
              <div className="text-[11px] text-[#8b949e] leading-relaxed mb-3">{p.desc}</div>
              <div className="flex flex-wrap gap-1">
                {p.tags.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded" style={{background:p.tagBg,color:p.tagColor}}>{t}</span>)}
              </div>
            </button>
          ))}
        </div>
        <button onClick={start} disabled={!selected||loading}
          className="w-full py-3 rounded-xl font-display font-bold text-sm transition-all duration-200"
          style={{background: selected ? (selected==='demo'?'#e05c3b':'#388bfd') : '#232c3d', color: selected?'white':'#4a5568', cursor: selected?'pointer':'not-allowed', opacity: loading?0.7:1}}>
          {loading ? '⏳ Chargement...' : selected ? `Démarrer ${selected==='demo'?'avec les données démo':'avec une base vide'}` : 'Sélectionnez un profil'}
        </button>
        <p className="text-center text-[11px] text-[#4a5568] mt-4">Accès démo — aucun identifiant requis</p>
      </div>
    </div>
  )
}
