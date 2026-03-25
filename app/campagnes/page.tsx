import {
  getCampaignsPageData,
  getDisplayStatus,
  getSourceLabel,
  getSourceTone,
} from '@/lib/core-data'

function formatDate(date: string | null) {
  if (!date) {
    return '-'
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

export default async function CampagnesPage() {
  const { source, items } = await getCampaignsPageData()
  const activeCampaign = items.find((item) => item.status === 'en_cours') ?? items[0]

  return (
    <div style={{ padding: '22px 26px', background: '#f4f9f4', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <h2 style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 700, color: '#1b3a2d' }}>
              Campagnes de Production
            </h2>
            <span className={getSourceTone(source)}>Source: {getSourceLabel(source)}</span>
          </div>
          <p style={{ fontSize: 13, color: '#5a7a66' }}>
            {items.length} campagne(s) disponible(s)
          </p>
        </div>
        <button className="btn-primary" disabled>
          + Nouvelle campagne
        </button>
      </div>

      {activeCampaign ? (
        <div className="card" style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 18, fontWeight: 800, color: '#1b3a2d', marginBottom: 3 }}>
                {activeCampaign.name}
              </div>
              <div style={{ fontSize: 12.5, color: '#5a7a66' }}>
                {activeCampaign.farmName} · {formatDate(activeCampaign.plantingStart)} → {formatDate(activeCampaign.campaignEnd)}
              </div>
            </div>
            <span className={activeCampaign.status === 'en_cours' ? 'tag-green' : 'tag-blue'}>
              {getDisplayStatus(activeCampaign.status)}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14 }}>
            {[
              ['Serres engagees', activeCampaign.greenhouseCount.toString()],
              ['Objectif production', `${(activeCampaign.productionTargetKg / 1000).toFixed(1)} t`],
              ['Budget total', `${(activeCampaign.budgetTotal / 1000000).toFixed(2)} M MAD`],
              ['Recolte a ce jour', `${(activeCampaign.actualProductionKg / 1000).toFixed(1)} t`],
              [
                'Avancement',
                activeCampaign.productionTargetKg > 0
                  ? `${((activeCampaign.actualProductionKg / activeCampaign.productionTargetKg) * 100).toFixed(1)}%`
                  : '0%',
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: '#5a7a66', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  {label}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1b3a2d' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 18, textAlign: 'center', padding: 32 }}>
          <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 18, fontWeight: 700, color: '#1b3a2d', marginBottom: 8 }}>
            Aucune campagne
          </div>
          <p style={{ color: '#5a7a66' }}>
            Ajoutez une campagne dans Supabase pour commencer a suivre les objectifs et les recoltes.
          </p>
        </div>
      )}

      <div className="card">
        <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 14, fontWeight: 700, color: '#1b3a2d', marginBottom: 14 }}>
          Historique des campagnes
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                {['Campagne', 'Ferme', 'Periode', 'Objectif', 'Recolte', 'Budget', 'Statut'].map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600, color: '#1b3a2d' }}>{item.name}</td>
                  <td style={{ color: '#5a7a66' }}>{item.farmName}</td>
                  <td style={{ color: '#5a7a66', fontSize: 12 }}>
                    {formatDate(item.plantingStart)} → {formatDate(item.campaignEnd)}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {(item.productionTargetKg / 1000).toFixed(1)} t
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>
                    {(item.actualProductionKg / 1000).toFixed(1)} t
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {(item.budgetTotal / 1000).toFixed(0)} k MAD
                  </td>
                  <td>
                    <span className={item.status === 'en_cours' ? 'tag-green' : 'tag-blue'}>
                      {getDisplayStatus(item.status)}
                    </span>
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
