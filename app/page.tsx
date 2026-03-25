import Link from 'next/link'
import {
  getCampaignsPageData,
  getDisplayStatus,
  getGreenhousesPageData,
  getHarvestsPageData,
  getSourceLabel,
  getSourceTone,
} from '@/lib/core-data'

function formatNumber(value: number) {
  return value.toLocaleString('fr-FR')
}

function formatDate(value: string | null) {
  if (!value) {
    return '-'
  }

  return new Date(value).toLocaleDateString('fr-FR')
}

export default async function DashboardPage() {
  const [greenhousesData, campaignsData, harvestsData] = await Promise.all([
    getGreenhousesPageData(),
    getCampaignsPageData(),
    getHarvestsPageData(),
  ])

  const greenhouses = greenhousesData.items
  const campaigns = campaignsData.items
  const harvests = harvestsData.items

  const source = greenhousesData.source
  const totalExploitableArea = greenhouses.reduce((sum, greenhouse) => sum + greenhouse.exploitableArea, 0)
  const activeGreenhouses = greenhouses.filter((greenhouse) => greenhouse.status === 'active').length
  const totalHarvestKg = harvests.reduce((sum, harvest) => sum + harvest.total, 0)
  const totalTargetKg = campaigns.reduce((sum, campaign) => sum + campaign.productionTargetKg, 0)
  const totalActualProductionKg = campaigns.reduce((sum, campaign) => sum + campaign.actualProductionKg, 0)
  const totalBudget = campaigns.reduce((sum, campaign) => sum + campaign.budgetTotal, 0)
  const achievementRate = totalTargetKg > 0 ? (totalActualProductionKg / totalTargetKg) * 100 : 0

  const latestHarvests = harvests.slice(0, 5)
  const topGreenhouses = [...greenhouses]
    .sort((left, right) => right.productionTons - left.productionTons)
    .slice(0, 5)
  const currentCampaigns = campaigns.slice(0, 5)

  return (
    <div style={{ padding: '22px 26px', background: '#f4f9f4', minHeight: '100vh' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 18,
          padding: '14px 16px',
          background: '#ffffff',
          border: '1px solid #cce5d4',
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(27,58,45,0.05)',
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#5a7a66', textTransform: 'uppercase', letterSpacing: '.6px' }}>
            Vue generale
          </div>
          <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 22, fontWeight: 800, color: '#1b3a2d' }}>
            Tableau de bord
          </div>
        </div>

        <span className={getSourceTone(source)} style={{ marginLeft: 'auto' }}>
          Source: {getSourceLabel(source)}
        </span>

        <Link href="/recoltes" className="btn-primary" style={{ textDecoration: 'none' }}>
          + Saisir recolte
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 18 }}>
        {[
          {
            label: 'Serres actives',
            value: activeGreenhouses.toString(),
            sub: `${greenhouses.length} serres au total`,
            color: '#2d6a4f',
          },
          {
            label: 'Surface exploitable',
            value: `${formatNumber(Math.round(totalExploitableArea))} m2`,
            sub: 'surface configuree',
            color: '#40916c',
          },
          {
            label: 'Recolte cumulee',
            value: `${formatNumber(Math.round(totalHarvestKg))} kg`,
            sub: `${latestHarvests.length} recoltes recentes`,
            color: '#74c69d',
          },
          {
            label: 'Objectif atteint',
            value: `${achievementRate.toFixed(1)}%`,
            sub: `${formatNumber(Math.round(totalActualProductionKg))} / ${formatNumber(Math.round(totalTargetKg))} kg`,
            color: '#f4a261',
          },
        ].map((item) => (
          <div key={item.label} className="kpi-card" style={{ borderTop: `3px solid ${item.color}` }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#5a7a66', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
              {item.label}
            </div>
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 25, fontWeight: 800, color: '#1b3a2d', marginBottom: 6 }}>
              {item.value}
            </div>
            <div style={{ fontSize: 12, color: '#5a7a66' }}>{item.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ fontFamily: 'Syne,sans-serif', fontSize: 14, fontWeight: 700, color: '#1b3a2d' }}>
              Campagnes en suivi
            </h3>
            <Link href="/campagnes" style={{ fontSize: 11, color: '#40916c', fontWeight: 600, textDecoration: 'none' }}>
              Voir detail →
            </Link>
          </div>

          {currentCampaigns.length === 0 ? (
            <div style={{ fontSize: 13, color: '#5a7a66' }}>
              Aucune campagne disponible pour le moment.
            </div>
          ) : (
            currentCampaigns.map((campaign) => (
              <div key={campaign.id} style={{ padding: '10px 0', borderBottom: '1px solid #e8f5ec' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1b3a2d' }}>{campaign.name}</div>
                    <div style={{ fontSize: 11.5, color: '#5a7a66', marginTop: 2 }}>
                      {campaign.farmName} · {campaign.greenhouseCount} serres
                    </div>
                  </div>
                  <span className="tag-green">{getDisplayStatus(campaign.status)}</span>
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 11.5, color: '#5a7a66' }}>
                  <span>Plantation: {formatDate(campaign.plantingStart)}</span>
                  <span>Recolte: {formatDate(campaign.harvestStart)}</span>
                  <span>Budget: {formatNumber(Math.round(campaign.budgetTotal))} MAD</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ fontFamily: 'Syne,sans-serif', fontSize: 14, fontWeight: 700, color: '#1b3a2d' }}>
              Serres les plus productives
            </h3>
            <Link href="/serres" style={{ fontSize: 11, color: '#40916c', fontWeight: 600, textDecoration: 'none' }}>
              Gerer →
            </Link>
          </div>

          {topGreenhouses.length === 0 ? (
            <div style={{ fontSize: 13, color: '#5a7a66' }}>
              Aucune serre configuree pour le moment.
            </div>
          ) : (
            topGreenhouses.map((greenhouse) => (
              <div key={greenhouse.code} style={{ padding: '10px 0', borderBottom: '1px solid #e8f5ec' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1b3a2d' }}>
                      {greenhouse.code} · {greenhouse.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#5a7a66', marginTop: 2 }}>
                      {greenhouse.varieties.length > 0 ? greenhouse.varieties.join(', ') : 'Aucune variete affectee'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2d6a4f' }}>
                      {greenhouse.productionTons.toFixed(2)} t
                    </div>
                    <div style={{ fontSize: 10.5, color: '#5a7a66' }}>
                      {greenhouse.actualYield.toFixed(1)} kg/m2
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ fontFamily: 'Syne,sans-serif', fontSize: 14, fontWeight: 700, color: '#1b3a2d' }}>
              Dernieres recoltes
            </h3>
            <Link href="/recoltes" style={{ fontSize: 11, color: '#40916c', fontWeight: 600, textDecoration: 'none' }}>
              Voir tout →
            </Link>
          </div>

          {latestHarvests.length === 0 ? (
            <div style={{ fontSize: 13, color: '#5a7a66' }}>
              Aucune recolte enregistree.
            </div>
          ) : (
            latestHarvests.map((harvest) => (
              <div key={harvest.id} style={{ padding: '10px 0', borderBottom: '1px solid #e8f5ec' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1b3a2d' }}>
                      {harvest.greenhouseCode} · {harvest.varietyName}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#5a7a66', marginTop: 2 }}>
                      {formatDate(harvest.date)} · Lot {harvest.lotNumber}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2d6a4f' }}>
                      {formatNumber(Math.round(harvest.total))} kg
                    </div>
                    <div style={{ fontSize: 10.5, color: '#5a7a66' }}>
                      Cat1 {formatNumber(Math.round(harvest.category1))}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h3 style={{ fontFamily: 'Syne,sans-serif', fontSize: 14, fontWeight: 700, color: '#1b3a2d', marginBottom: 14 }}>
            Situation actuelle
          </h3>

          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ padding: '12px 14px', borderRadius: 10, background: '#eef8f1', border: '1px solid #d8f3dc' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#40916c', textTransform: 'uppercase', marginBottom: 4 }}>
                Base de donnees
              </div>
              <div style={{ fontSize: 13, color: '#1b3a2d' }}>
                {greenhouses.length === 0 && campaigns.length === 0 && harvests.length === 0
                  ? 'La base semble vide pour le moment.'
                  : 'Des donnees reelles sont presentes sur les modules principaux.'}
              </div>
            </div>

            <div style={{ padding: '12px 14px', borderRadius: 10, background: '#fffaf0', border: '1px solid #f3ddb7' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#b7791f', textTransform: 'uppercase', marginBottom: 4 }}>
                Budget campagnes
              </div>
              <div style={{ fontSize: 13, color: '#1b3a2d' }}>
                {formatNumber(Math.round(totalBudget))} MAD cumules sur {campaigns.length} campagne(s).
              </div>
            </div>

            <div style={{ padding: '12px 14px', borderRadius: 10, background: '#f8f9fa', border: '1px solid #dde2e6' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5a7a66', textTransform: 'uppercase', marginBottom: 4 }}>
                Prochaine action
              </div>
              <div style={{ fontSize: 13, color: '#1b3a2d' }}>
                Commence par creer des serres, une campagne, puis des affectations avant de saisir des recoltes.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
