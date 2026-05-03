'use client'
import { useEffect, useRef, useState } from 'react'

export default function GuidePage() {
  const [loaded, setLoaded] = useState(false)
  const [src, setSrc] = useState('/guide-utilisateur.html')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Récupère le hash de l'URL (#recoltes, #couts…) et l'applique à l'iframe
  useEffect(() => {
    const hash = window.location.hash // "#recoltes" ou ""
    if (hash) setSrc(`/guide-utilisateur.html${hash}`)
    // Réagit aux changements de hash sans recharger la page
    const onHash = () => {
      const h = window.location.hash
      if (iframeRef.current) {
        iframeRef.current.src = `/guide-utilisateur.html${h}`
      }
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div style={{ height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-main)' }}>
            📖 Guide utilisateur
          </h1>
          <div style={{ color: 'var(--text-sub)', fontSize: 12.5, marginTop: 2 }}>
            Documentation complète du Domaine BENHALIMA — MES
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <a href={src} target="_blank" rel="noopener noreferrer"
            style={{
              padding: '8px 14px', textDecoration: 'none',
              border: '1px solid var(--bd-2)', borderRadius: 6,
              color: 'var(--text-main)', fontSize: 12.5,
              background: 'var(--bg-1)',
            }}>
            ⤴ Plein écran
          </a>
          <a href="/guide-utilisateur.html" download="guide-utilisateur-benhalima-mes.html"
            style={{
              padding: '8px 14px', textDecoration: 'none',
              border: '1px solid var(--bd-2)', borderRadius: 6,
              color: 'var(--text-main)', fontSize: 12.5,
              background: 'var(--bg-1)',
            }}>
            ⬇ Télécharger
          </a>
        </div>
      </header>

      <div style={{
        flex: 1, position: 'relative',
        border: '1px solid var(--bd-1)', borderRadius: 10, overflow: 'hidden',
        background: '#fff',
      }}>
        {!loaded && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-sub)', fontSize: 13,
          }}>
            Chargement du guide…
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={src}
          onLoad={() => setLoaded(true)}
          style={{
            width: '100%', height: '100%', border: 'none',
            opacity: loaded ? 1 : 0, transition: 'opacity .2s',
          }}
          title="Guide utilisateur Domaine BENHALIMA"
        />
      </div>
    </div>
  )
}
