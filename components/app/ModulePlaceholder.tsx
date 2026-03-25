type ModulePlaceholderProps = {
  title: string
  description: string
}

export function ModulePlaceholder({ title, description }: ModulePlaceholderProps) {
  return (
    <div style={{ padding: '22px 26px', background: '#f4f9f4', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h2 style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 700, color: '#1b3a2d', marginBottom: 6 }}>
            {title}
          </h2>
          <p style={{ fontSize: 13, color: '#5a7a66' }}>
            Ce module n&apos;utilise plus de donnees de demonstration.
          </p>
        </div>
        <button className="btn-primary" disabled>
          Action indisponible
        </button>
      </div>

      <div className="card" style={{ padding: 32 }}>
        <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 18, fontWeight: 700, color: '#1b3a2d', marginBottom: 8 }}>
          Module en attente de branchement
        </div>
        <p style={{ fontSize: 13, color: '#5a7a66', lineHeight: 1.6, maxWidth: 720 }}>
          {description}
        </p>
        <div style={{ marginTop: 16, fontSize: 12, color: '#5a7a66' }}>
          Les boutons ajouter, modifier et supprimer ont ete neutralises tant que le flux reel n&apos;est pas implemente.
        </div>
      </div>
    </div>
  )
}
