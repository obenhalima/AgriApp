import {
  getHarvestsPageData,
  getSourceLabel,
  getSourceTone,
} from '@/lib/core-data'

function formatHarvestDate(value: string) {
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    return value
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

export default async function RecoltesPage() {
  const { source, items } = await getHarvestsPageData()

  return (
    <div style={{ padding: '22px 26px', background: '#f4f9f4', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <h2 style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 700, color: '#1b3a2d' }}>
              Recoltes
            </h2>
            <span className={getSourceTone(source)}>Source: {getSourceLabel(source)}</span>
          </div>
          <p style={{ fontSize: 13, color: '#5a7a66' }}>
            {items.length} recolte(s) recente(s)
          </p>
        </div>
        <button className="btn-primary" disabled>
          + Nouvelle recolte
        </button>
      </div>

      {items.length > 0 ? (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 14, fontWeight: 700, color: '#1b3a2d' }}>
              Recoltes recentes
            </div>
            <button className="btn-secondary" disabled>
              Export
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  {['Date', 'Serre', 'Variete', 'Cat 1 (kg)', 'Cat 2 (kg)', 'Cat 3 (kg)', 'Dechets', 'Total', 'Lot'].map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: '#5a7a66' }}>
                      {formatHarvestDate(item.date)}
                    </td>
                    <td style={{ fontWeight: 600, color: '#1b3a2d' }}>{item.greenhouseCode}</td>
                    <td style={{ color: '#1b3a2d' }}>{item.varietyName}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: '#2d6a4f', fontWeight: 700 }}>
                      {item.category1.toLocaleString('fr-FR')}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.category2.toLocaleString('fr-FR')}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: '#d97706' }}>
                      {item.category3.toLocaleString('fr-FR')}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: '#e63946' }}>
                      {item.waste.toLocaleString('fr-FR')}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>
                      {item.total.toLocaleString('fr-FR')}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: '#5a7a66' }}>{item.lotNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 18, fontWeight: 700, color: '#1b3a2d', marginBottom: 8 }}>
            Aucune recolte
          </div>
          <p style={{ color: '#5a7a66' }}>
            La table `harvests` est vide pour le moment. Ajoutez des recoltes dans Supabase pour alimenter cette vue.
          </p>
        </div>
      )}
    </div>
  )
}
