import {
  getDisplayStatus,
  getGreenhousesPageData,
  getSourceLabel,
  getSourceTone,
} from '@/lib/core-data'

const COLORS = ['#40916c', '#2d6a4f', '#74c69d', '#e9c46a', '#f4a261']

export default async function SerresPage() {
  const { source, items } = await getGreenhousesPageData()

  const activeCount = items.filter((item) => item.status === 'active').length
  const productiveCount = items.filter((item) => item.productionTons > 0).length
  const totalArea = items.reduce((sum, item) => sum + item.exploitableArea, 0)
  const yieldRows = items.filter((item) => item.actualYield > 0)
  const averageYield = yieldRows.length > 0
    ? yieldRows.reduce((sum, item) => sum + item.actualYield, 0) / yieldRows.length
    : 0

  return (
    <div style={{ padding: '22px 26px', background: '#f4f9f4', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <h2 style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 700, color: '#1b3a2d' }}>
              Serres & Infrastructure
            </h2>
            <span className={getSourceTone(source)}>Source: {getSourceLabel(source)}</span>
          </div>
          <p style={{ fontSize: 13, color: '#5a7a66' }}>
            {items.length} serres chargees depuis {source === 'supabase' ? 'la base de donnees' : 'la configuration locale'}
          </p>
        </div>
        <button className="btn-primary" disabled>
          + Nouvelle serre
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Serres actives', val: activeCount.toString(), sub: `${items.length - activeCount} hors production`, color: '#2d6a4f' },
          { label: 'Surface exploitable', val: `${Math.round(totalArea).toLocaleString('fr-FR')} m2`, sub: 'totale', color: '#40916c' },
          { label: 'En production', val: productiveCount.toString(), sub: 'avec recoltes enregistrees', color: '#74c69d' },
          { label: 'Rendement moyen', val: `${averageYield.toFixed(1)} kg/m2`, sub: 'sur les serres actives', color: '#f4a261' },
        ].map((card) => (
          <div key={card.label} className="kpi-card" style={{ borderTop: `3px solid ${card.color}` }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#5a7a66', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>
              {card.label}
            </div>
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 800, color: '#1b3a2d', marginBottom: 3 }}>
              {card.val}
            </div>
            <div style={{ fontSize: 11, color: '#5a7a66' }}>{card.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {items.map((item) => {
          const progress = Math.round(item.achievementRate)
          return (
            <div key={item.code} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #e8f5ec', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 14, fontWeight: 700, color: '#1b3a2d', marginBottom: 2 }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#5a7a66' }}>
                    {item.code} · {item.type}
                  </div>
                </div>
                <span className={item.status === 'active' ? 'tag-green' : 'tag-amber'}>
                  {getDisplayStatus(item.status)}
                </span>
              </div>

              <div style={{ padding: '12px 16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#5a7a66', marginBottom: 2 }}>Superficie</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1b3a2d' }}>
                      {Math.round(item.totalArea).toLocaleString('fr-FR')} m2
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#5a7a66', marginBottom: 2 }}>Production</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: item.productionTons > 0 ? '#2d6a4f' : '#5a7a66' }}>
                      {item.productionTons > 0 ? `${item.productionTons.toFixed(1)} t` : '-'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#5a7a66', marginBottom: 2 }}>Rend. cible</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1b3a2d' }}>
                      {item.targetYield > 0 ? `${item.targetYield.toFixed(1)} kg/m2` : '-'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#5a7a66', marginBottom: 2 }}>Rend. reel</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: item.actualYield >= item.targetYield * 0.95 ? '#2d6a4f' : '#d97706' }}>
                      {item.actualYield > 0 ? `${item.actualYield.toFixed(1)} kg/m2` : '-'}
                    </div>
                  </div>
                </div>

                {item.varieties.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: '#5a7a66', marginBottom: 5 }}>Varietes associees</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {item.varieties.map((variety, index) => (
                        <span
                          key={variety}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '3px 8px',
                            borderRadius: 20,
                            fontSize: 11,
                            fontWeight: 500,
                            background: '#f4f9f4',
                            border: '1px solid #cce5d4',
                            color: '#1b3a2d',
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: COLORS[index % COLORS.length],
                              display: 'inline-block',
                            }}
                          />
                          {variety}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {progress > 0 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#5a7a66', marginBottom: 3 }}>
                      <span>Atteinte objectif</span>
                      <span>{progress}%</span>
                    </div>
                    <div style={{ height: 5, background: '#e8f5ec', borderRadius: 3, overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(progress, 100)}%`,
                          background: progress >= 95 ? '#2d6a4f' : '#e9c46a',
                          borderRadius: 3,
                        }}
                      />
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
