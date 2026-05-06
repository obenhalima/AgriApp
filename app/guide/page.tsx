'use client'
import { useEffect, useRef, useState } from 'react'
import { BookOpen, ExternalLink, Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'

export default function GuidePage() {
  const [loaded, setLoaded] = useState(false)
  const [src, setSrc] = useState('/guide-utilisateur.html')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const hash = window.location.hash
    if (hash) setSrc(`/guide-utilisateur.html${hash}`)
    const onHash = () => {
      const h = window.location.hash
      if (iframeRef.current) iframeRef.current.src = `/guide-utilisateur.html${h}`
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="flex flex-col gap-md h-[calc(100vh-100px)]">
      <PageHeader
        title="Guide utilisateur" subtitle="Aide" icon={BookOpen} iconColor="#0ea5e9"
        description="Documentation complète du Domaine BENHALIMA — MES"
        actions={
          <div className="flex gap-xs">
            <a href={src} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost"><ExternalLink size={14} strokeWidth={2.2} /> Plein écran</Button>
            </a>
            <a href="/guide-utilisateur.html" download="guide-utilisateur-benhalima-mes.html">
              <Button variant="ghost"><Download size={14} strokeWidth={2.2} /> Télécharger</Button>
            </a>
          </div>
        }
      />

      <div className="flex-1 relative rounded-lg border border-border overflow-hidden bg-white">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center text-fg-tertiary text-body-sm">
            Chargement du guide…
          </div>
        )}
        <iframe
          ref={iframeRef} src={src}
          onLoad={() => setLoaded(true)}
          className="w-full h-full border-none transition-opacity duration-200"
          style={{ opacity: loaded ? 1 : 0 }}
          title="Guide utilisateur Domaine BENHALIMA"
        />
      </div>
    </div>
  )
}
