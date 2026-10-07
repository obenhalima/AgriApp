'use client'
import {useLanguage} from '@/lib/i18n'

import { useEffect, useRef, useState } from 'react'
import { BookOpen, ExternalLink, Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { UserWiki } from '@/components/help/UserWiki'
import { FullscreenGuide } from '@/components/help/FullscreenGuide'
import '@/components/help/branding.css'

export default function GuidePage() {
 const {t:_ui,text:_uiNode,locale}=useLanguage()

  const [loaded, setLoaded] = useState(false)
  const [mode,setMode]=useState<'wiki'|'guide'>('wiki')
  const [src, setSrc] = useState('/guide-utilisateur.html')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const guidePath=locale==='fr'?'/guide-utilisateur.html':`/guide-utilisateur.${locale}.html`

  useEffect(() => {
    const hash = window.location.hash
    if(hash)setMode('guide')
    setLoaded(false)
    setSrc(`${guidePath}${hash}`)
    const onHash = () => {
      const h = window.location.hash
      if(h)setMode('guide')
      if (iframeRef.current) iframeRef.current.src = `${guidePath}${h}`
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [guidePath])

  return (
    <div className="itrix-documentation itrix-guide-page flex min-h-[calc(100vh-100px)] flex-col gap-md">
      <section className="itrix-guide-hero"><div><small>ITRIX FARM · ITRIX TECHNOLOGIES</small><p>{_ui('Des données à de meilleurs horizons')}</p></div><div className="itrix-guide-logo"><img src="/itrix-logo.png" alt="ItriX"/></div></section>
      <PageHeader
        title={_ui("Guide utilisateur")} subtitle={_ui("Aide")} icon={BookOpen} iconColor="#0B3D2E"
        description={_ui("Documentation complète de ItriX Farm")}
        actions={
          <div className="flex gap-xs">
            <FullscreenGuide src={src}/>
            <a href={guidePath} download={`guide-itrix-farm-${locale}.html`}>
              <Button variant="ghost"><Download size={14} strokeWidth={2.2} /> {" "}{_ui("Télécharger")}</Button>
            </a>
          </div>
        }
      />

      <div className="flex gap-2" role="group" aria-label={_ui('Documentation')}><Button variant={mode==='wiki'?'primary':'ghost'} onClick={()=>setMode('wiki')}>{_ui('Wiki global')}</Button><Button variant={mode==='guide'?'primary':'ghost'} onClick={()=>setMode('guide')}>{_ui('Guide général')}</Button></div>
      {mode==='wiki'?<UserWiki/>:

      <div className="flex-1 min-h-[650px] relative rounded-lg border border-border overflow-hidden bg-white">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center text-fg-tertiary text-body-sm">
            {" "}{_ui("Chargement du guide…")}{" "}</div>
        )}
        <iframe
          ref={iframeRef} src={src}
          onLoad={() => setLoaded(true)}
          className="w-full min-h-[650px] h-[75vh] border-none transition-opacity duration-200"
          style={{ opacity: loaded ? 1 : 0 }}
          title={_ui("Guide utilisateur ItriX Farm")}
        />
      </div>
      }
    </div>
  )
}
