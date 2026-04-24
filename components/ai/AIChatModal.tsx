'use client'
import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { sendChatMessage, ChatMessage, AIChatInput } from '@/lib/aiChat'

// Rendu markdown minimaliste
function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split('\n')
  const out: React.ReactNode[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    out.push(<p key={out.length} style={{ margin: '0 0 8px', lineHeight: 1.5 }}>{inline(paragraph.join(' '))}</p>)
    paragraph = []
  }
  const flushList = () => {
    if (!list) return
    const items = list.items
    const Tag = list.ordered ? 'ol' : 'ul'
    out.push(<Tag key={out.length} style={{ margin: '0 0 10px', paddingLeft: 22, lineHeight: 1.55 } as any}>
      {items.map((it, i) => <li key={i}>{inline(it)}</li>)}
    </Tag>)
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
      const style: any = level === 1
        ? { fontSize: 16, fontWeight: 800, margin: '10px 0 8px', color: 'var(--tx-1)' }
        : level === 2
        ? { fontSize: 14, fontWeight: 700, margin: '12px 0 6px', color: 'var(--tx-1)' }
        : { fontSize: 12, fontWeight: 700, margin: '10px 0 4px', color: 'var(--tx-1)' }
      const Tag = (level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3') as any
      out.push(<Tag key={out.length} style={style}>{inline(text)}</Tag>)
      continue
    }
    const bullet = /^\s*-\s+(.+)$/.exec(line)
    if (bullet) {
      flushParagraph()
      if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] } }
      list.items.push(bullet[1]); continue
    }
    const ordered = /^\s*\d+\.\s+(.+)$/.exec(line)
    if (ordered) {
      flushParagraph()
      if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] } }
      list.items.push(ordered[1]); continue
    }
    paragraph.push(line)
  }
  flushParagraph(); flushList()
  return out
}

function inline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let m, key = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index))
    const token = m[0]
    if (token.startsWith('**')) parts.push(<strong key={key++} style={{ fontWeight: 700, color: 'var(--tx-1)' }}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('*')) parts.push(<em key={key++}>{token.slice(1, -1)}</em>)
    else if (token.startsWith('`')) parts.push(<code key={key++} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--bg-deep)', padding: '1px 5px', borderRadius: 3 }}>{token.slice(1, -1)}</code>)
    lastIndex = m.index + token.length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

// Questions rapides suggérées
const SUGGESTED = [
  { label: '📋 Revue complète', q: 'Produis une revue d\'audit complète du compte d\'exploitation : synthèse, qualité des données, écarts financiers majeurs, risques, recommandations priorisées.' },
  { label: '🚨 Qu\'est-ce qui cloche ?', q: 'Quels sont les problèmes les plus urgents que tu identifies dans les données actuelles ? Priorise par impact financier.' },
  { label: '🌱 Récoltes en retard', q: 'Analyse les récoltes en retard ou sous-performantes. Quelles causes probables et quelles actions ?' },
  { label: '💰 Gaps de saisie', q: 'Liste les saisies manquantes probables (budget sans réel, coûts non catégorisés). Combien ça représente et qu\'est-ce que ça biaise ?' },
  { label: '📊 EBITDA & marges', q: 'Analyse l\'EBITDA et les marges actuelles par rapport au budget. Est-ce qu\'on tient les objectifs ?' },
]

export function AIChatModal(props: {
  baseInput: Omit<AIChatInput, 'messages'>
  onClose: () => void
}) {
  const { baseInput, onClose } = props
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [model, setModel] = useState<string>('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll en bas sur nouveau message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const send = async (content: string) => {
    const trimmed = content.trim()
    if (!trimmed || loading) return
    const next = [...messages, { role: 'user' as const, content: trimmed }]
    setMessages(next)
    setInput('')
    setLoading(true)
    setError('')
    try {
      const { reply, model: m } = await sendChatMessage({ ...baseInput, messages: next })
      setModel(m)
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (e: any) {
      setError(e.message ?? 'Erreur IA')
    } finally { setLoading(false) }
  }

  return (
    <Modal title="🤖 ASSISTANT IA — COMPTE D'EXPLOITATION" onClose={onClose} size="lg">
      {/* Bandeau contexte */}
      <div style={{ padding: 8, marginBottom: 10, background: 'var(--bg-deep)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 11, color: 'var(--tx-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <strong>Campagne :</strong> {baseInput.context.campaignName} · <strong>Version :</strong> {baseInput.context.versionName} · <strong>Périmètre :</strong> {
            baseInput.context.scope === 'domain' ? 'Domaine' :
            baseInput.context.scope === 'farm' ? `Ferme ${baseInput.context.farmName ?? ''}` :
            `Serre ${baseInput.context.greenhouseCode ?? ''}`
          }
        </div>
        {model && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)' }}>{model}</span>}
      </div>

      {/* Questions suggérées (uniquement tant qu'il n'y a aucun message) */}
      {messages.length === 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--tx-3)', marginBottom: 8 }}>
            Pose une question ou clique une question rapide pour démarrer.
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SUGGESTED.map((s, i) => (
              <button key={i} onClick={() => send(s.q)} disabled={loading}
                style={{
                  padding: '6px 10px',
                  background: 'color-mix(in srgb, var(--neon) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--neon) 35%, transparent)',
                  color: 'var(--neon)',
                  borderRadius: 20,
                  cursor: loading ? 'wait' : 'pointer',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Zone messages */}
      <div ref={scrollRef} style={{
        maxHeight: '55vh',
        overflowY: 'auto',
        padding: '4px 2px',
        marginBottom: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
            padding: '10px 14px',
            borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
            background: m.role === 'user'
              ? 'color-mix(in srgb, var(--neon) 15%, transparent)'
              : 'var(--bg-deep)',
            border: '1px solid var(--bd-1)',
            color: 'var(--tx-2)',
            fontSize: 12.5,
          }}>
            <div style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginBottom: 4 }}>
              {m.role === 'user' ? 'VOUS' : '🤖 ASSISTANT'}
            </div>
            {m.role === 'user' ? (
              <div style={{ whiteSpace: 'pre-wrap', color: 'var(--tx-1)' }}>{m.content}</div>
            ) : (
              <div>{renderMarkdown(m.content)}</div>
            )}
          </div>
        ))}
        {loading && (
          <div style={{
            alignSelf: 'flex-start', padding: '10px 14px',
            borderRadius: '12px 12px 12px 2px', background: 'var(--bg-deep)',
            border: '1px solid var(--bd-1)', fontSize: 12, color: 'var(--tx-3)',
          }}>
            <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid var(--bd-1)', borderTopColor: 'var(--neon)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginRight: 8, verticalAlign: 'middle' }} />
            L'assistant réfléchit…
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}
        {error && (
          <div style={{
            alignSelf: 'stretch', padding: 10, background: 'var(--red-dim)',
            border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', borderRadius: 8,
            color: 'var(--red)', fontSize: 11,
          }}>
            ⚠ {error}
          </div>
        )}
      </div>

      {/* Zone saisie */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
          }}
          placeholder="Pose une question… (Entrée pour envoyer, Shift+Entrée pour nouvelle ligne)"
          rows={2}
          disabled={loading}
          style={{
            flex: 1, padding: 10, background: 'var(--bg-deep)', color: 'var(--tx-1)',
            border: '1px solid var(--bd-1)', borderRadius: 8, fontSize: 13, resize: 'vertical',
            fontFamily: 'inherit', lineHeight: 1.4,
          }}
        />
        <button onClick={() => send(input)} disabled={loading || !input.trim()}
          style={{
            padding: '0 18px',
            background: (!input.trim() || loading) ? 'transparent' : 'var(--neon-dim)',
            border: `1px solid ${(!input.trim() || loading) ? 'var(--bd-1)' : 'color-mix(in srgb, var(--neon) 40%, transparent)'}`,
            color: (!input.trim() || loading) ? 'var(--tx-3)' : 'var(--neon)',
            borderRadius: 8,
            cursor: (!input.trim() || loading) ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            letterSpacing: 1,
          }}>
          ENVOYER
        </button>
      </div>
    </Modal>
  )
}
