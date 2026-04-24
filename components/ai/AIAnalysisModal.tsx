'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { analyzeCPC, AICPCInput } from '@/lib/aiAnalysis'

/**
 * Rendu markdown minimaliste sans dépendance externe.
 * Gère : # ## ### titres, **bold**, *italic*, `code`, listes - et 1., paragraphes.
 */
function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split('\n')
  const out: React.ReactNode[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    out.push(<p key={out.length} style={{ margin: '0 0 10px', color: 'var(--tx-2)', fontSize: 13, lineHeight: 1.5 }}>{inlineFormat(paragraph.join(' '))}</p>)
    paragraph = []
  }
  const flushList = () => {
    if (!list) return
    const items = list.items
    if (list.ordered) {
      out.push(<ol key={out.length} style={{ margin: '0 0 12px', paddingLeft: 22, color: 'var(--tx-2)', fontSize: 13, lineHeight: 1.6 }}>
        {items.map((it, i) => <li key={i}>{inlineFormat(it)}</li>)}
      </ol>)
    } else {
      out.push(<ul key={out.length} style={{ margin: '0 0 12px', paddingLeft: 22, color: 'var(--tx-2)', fontSize: 13, lineHeight: 1.6 }}>
        {items.map((it, i) => <li key={i}>{inlineFormat(it)}</li>)}
      </ul>)
    }
    list = null
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) { flushParagraph(); flushList(); continue }
    const h = /^(#{1,3})\s+(.+)$/.exec(line)
    if (h) {
      flushParagraph(); flushList()
      const level = h[1].length
      const text = h[2]
      const style = level === 1
        ? { fontSize: 18, fontWeight: 800, color: 'var(--tx-1)', margin: '16px 0 10px', paddingBottom: 6, borderBottom: '1px solid var(--bd-1)' }
        : level === 2
        ? { fontSize: 15, fontWeight: 700, color: 'var(--tx-1)', margin: '18px 0 8px' }
        : { fontSize: 13, fontWeight: 700, color: 'var(--tx-1)', margin: '14px 0 6px' }
      const Tag = (level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3') as any
      out.push(<Tag key={out.length} style={style}>{inlineFormat(text)}</Tag>)
      continue
    }
    const bullet = /^\s*-\s+(.+)$/.exec(line)
    if (bullet) {
      flushParagraph()
      if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] } }
      list.items.push(bullet[1])
      continue
    }
    const ordered = /^\s*\d+\.\s+(.+)$/.exec(line)
    if (ordered) {
      flushParagraph()
      if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] } }
      list.items.push(ordered[1])
      continue
    }
    paragraph.push(line)
  }
  flushParagraph(); flushList()
  return out
}

/** Inline : **bold**, *italic*, `code` */
function inlineFormat(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let i = 0
  let key = 0
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let lastIndex = 0
  let m
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index))
    const token = m[0]
    if (token.startsWith('**')) parts.push(<strong key={key++} style={{ color: 'var(--tx-1)', fontWeight: 700 }}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('*')) parts.push(<em key={key++}>{token.slice(1, -1)}</em>)
    else if (token.startsWith('`')) parts.push(<code key={key++} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--bg-deep)', padding: '1px 5px', borderRadius: 3 }}>{token.slice(1, -1)}</code>)
    lastIndex = m.index + token.length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

export function AIAnalysisModal(props: {
  input: AICPCInput
  onClose: () => void
}) {
  const { input, onClose } = props
  const [loading, setLoading] = useState(true)
  const [analysis, setAnalysis] = useState('')
  const [error, setError] = useState('')

  const run = async () => {
    setLoading(true); setError(''); setAnalysis('')
    try {
      const result = await analyzeCPC(input)
      setAnalysis(result)
    } catch (e: any) {
      setError(e.message ?? 'Erreur inconnue')
    } finally { setLoading(false) }
  }

  useEffect(() => { run() }, [])

  const copyToClipboard = () => {
    navigator.clipboard.writeText(analysis)
    alert('Analyse copiée dans le presse-papier')
  }

  return (
    <Modal title="🤖 ANALYSE IA — COMPTE D'EXPLOITATION" onClose={onClose} size="lg">
      <div style={{ padding: 8, marginBottom: 12, background: 'var(--bg-deep)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 11, color: 'var(--tx-3)' }}>
        <strong>Campagne :</strong> {input.context.campaignName} · <strong>Version :</strong> {input.context.versionName} · <strong>Périmètre :</strong> {
          input.context.scope === 'domain' ? 'Domaine entier' :
          input.context.scope === 'farm' ? `Ferme ${input.context.farmName ?? ''}` :
          `Serre ${input.context.greenhouseCode ?? ''}`
        }
      </div>

      {loading && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', width: 24, height: 24, border: '2px solid var(--bd-1)', borderTopColor: 'var(--neon)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <div style={{ marginTop: 14, color: 'var(--tx-2)', fontSize: 12, fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>
            L'IA analyse vos chiffres...
          </div>
          <div style={{ marginTop: 6, color: 'var(--tx-3)', fontSize: 10 }}>
            ~5 secondes
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {error && (
        <div style={{ padding: 12, background: 'var(--red-dim)', border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', borderRadius: 8, color: 'var(--red)', fontSize: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>⚠ Erreur</div>
          <div>{error}</div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--tx-3)' }}>
            Vérifie que <code>GEMINI_API_KEY</code> est bien configuré dans les secrets Supabase (Dashboard → Edge Functions → <strong>ai-analyze-cpc</strong> → Secrets).
            La Edge Function doit aussi avoir JWT verification <strong>désactivé</strong>.
          </div>
          <button onClick={run} style={{ marginTop: 10, padding: '6px 12px', background: 'transparent', border: '1px solid var(--red)50', color: 'var(--red)', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
            Réessayer
          </button>
        </div>
      )}

      {analysis && !loading && (
        <>
          <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '4px 2px' }}>
            {renderMarkdown(analysis)}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--bd-1)' }}>
            <button onClick={copyToClipboard}
              style={{ padding: '7px 12px', background: 'transparent', border: '1px solid var(--bd-1)', color: 'var(--tx-2)', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
              📋 Copier
            </button>
            <button onClick={run}
              style={{ padding: '7px 12px', background: 'transparent', border: '1px solid var(--bd-1)', color: 'var(--tx-2)', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
              🔄 Re-analyser
            </button>
            <button onClick={onClose}
              style={{ padding: '7px 12px', background: 'var(--neon-dim)', border: '1px solid color-mix(in srgb, var(--neon) 40%, transparent)', color: 'var(--neon)', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
              Fermer
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
