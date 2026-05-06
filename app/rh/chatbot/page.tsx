'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { MessageSquare, UserPlus, Users, Clock, MessageCircle, Eye, Send, Info, Sprout, Bell } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect, Field } from '@/components/ui/Input'
import { Modal, FormGroup, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'

type ChatbotUser = {
  id: string; worker_id: string | null; channel: string; channel_user_id: string | null
  channel_username: string | null; language: string; enrollment_code: string | null
  enrollment_code_expires_at: string | null; is_active: boolean; enrolled_at: string | null
  last_message_at: string | null; created_at: string; receive_recap?: boolean
}
type Worker = { id: string; first_name: string; last_name: string; matricule: string | null; category: string | null; is_active: boolean }
type ChatMessage = { id: string; chatbot_user_id: string | null; direction: 'in' | 'out'; content: string | null; intent: string | null; created_at: string; created_harvest_id: string | null; created_alert_id: string | null }

const generateCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function ChatbotPage() {
  const [users, setUsers] = useState<ChatbotUser[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'users' | 'messages' | 'recap'>('users')

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<{ worker_id: string; language: string }>({ worker_id: '', language: 'fr' })
  const [generated, setGenerated] = useState<{ code: string; expires: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const [recapPreview, setRecapPreview] = useState<string>('')
  const [recapSending, setRecapSending] = useState(false)
  const [recapResult, setRecapResult] = useState<{ sent: number; failed: number } | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  const [recapDate, setRecapDate] = useState(today)

  const load = async () => {
    setLoading(true)
    try {
      const [u, w, m] = await Promise.all([
        supabase.from('chatbot_users').select('*').order('created_at', { ascending: false }),
        supabase.from('workers').select('id, first_name, last_name, matricule, category, is_active').eq('is_active', true).order('last_name'),
        supabase.from('chatbot_messages').select('*').order('created_at', { ascending: false }).limit(200),
      ])
      if (u.error) throw u.error
      setUsers((u.data ?? []) as any); setWorkers((w.data ?? []) as any); setMessages((m.data ?? []) as any)
    } catch (e: any) { toast.error(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const generateInvitation = async () => {
    if (!form.worker_id) { toast.error('Sélectionne un employé'); return }
    setSaving(true)
    try {
      const existing = users.find(u => u.worker_id === form.worker_id && u.is_active && u.enrolled_at)
      if (existing && !confirm("Cet employé a déjà un compte chatbot actif. Régénérer un nouveau code ?")) {
        setSaving(false); return
      }
      const code = generateCode()
      const expires = new Date(Date.now() + 7 * 86400000).toISOString()
      const tmpId = `pending_${code}`
      const { error } = await supabase.from('chatbot_users').upsert({
        worker_id: form.worker_id, channel: 'telegram', channel_user_id: tmpId,
        language: form.language, enrollment_code: code, enrollment_code_expires_at: expires, is_active: true,
      }, { onConflict: 'channel,channel_user_id' })
      if (error) throw error
      setGenerated({ code, expires })
      toast.success('Code généré')
      load()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  const closeModal = () => { setModalOpen(false); setGenerated(null); setForm({ worker_id: '', language: 'fr' }) }

  const deactivate = async (id: string) => {
    if (!confirm('Désactiver ce compte chatbot ?')) return
    try {
      const { error } = await supabase.from('chatbot_users').update({ is_active: false }).eq('id', id)
      if (error) throw error
      toast.success('Compte désactivé'); load()
    } catch (e: any) { toast.error(e.message) }
  }

  const toggleRecap = async (u: ChatbotUser) => {
    const next = !(u.receive_recap ?? false)
    try {
      const { error } = await supabase.from('chatbot_users').update({ receive_recap: next }).eq('id', u.id)
      if (error) throw error
      toast.success(next ? 'Récap activé' : 'Récap désactivé'); load()
    } catch (e: any) { toast.error(e.message) }
  }

  const previewRecap = async () => {
    setRecapSending(true); setRecapResult(null); setRecapPreview('')
    try {
      const { data, error } = await supabase.functions.invoke('daily-recap', { body: { date: recapDate, dryRun: true } })
      if (error) throw error
      setRecapPreview((data as any)?.recap ?? '')
    } catch (e: any) { toast.error(e.message) }
    setRecapSending(false)
  }

  const sendRecapNow = async () => {
    if (!confirm(`Envoyer le récap du ${recapDate} à tous les destinataires ?`)) return
    setRecapSending(true); setRecapResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('daily-recap', { body: { date: recapDate, dryRun: false } })
      if (error) throw error
      const result = { sent: (data as any).sent ?? 0, failed: (data as any).failed ?? 0 }
      setRecapResult(result)
      toast.success(`Envoyé à ${result.sent}${result.failed > 0 ? ` · ${result.failed} échec(s)` : ''}`)
    } catch (e: any) { toast.error(e.message) }
    setRecapSending(false)
  }

  const enrolledCount = useMemo(() => users.filter(u => u.enrolled_at && u.is_active).length, [users])
  const pendingCount = useMemo(() => users.filter(u => u.enrollment_code && !u.enrolled_at && u.is_active).length, [users])

  return (
    <div>
      <PageHeader
        title="Chatbot Telegram" subtitle="Ressources humaines" icon={MessageSquare} iconColor="#26a5e4"
        description="Saisie des récoltes par message — pour les ouvriers ne maîtrisant pas le PC"
        actions={<Button onClick={() => { setModalOpen(true); setGenerated(null) }} variant="primary"><UserPlus size={14} strokeWidth={2.5} /> Inviter un employé</Button>}
        stats={loading ? [] : [
          { label: 'Inscrits actifs', value: String(enrolledCount), icon: Users, color: '#10b981' },
          { label: 'En attente', value: String(pendingCount), icon: Clock, color: '#f59e0b' },
          { label: 'Messages (200 max)', value: String(messages.length), icon: MessageCircle, color: '#0ea5e9' },
        ]}
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-md">
        {[
          { k: 'users', l: 'Utilisateurs', icon: Users },
          { k: 'messages', l: 'Messages', icon: MessageCircle },
          { k: 'recap', l: 'Récap quotidien', icon: Bell },
        ].map(t => {
          const Icon = t.icon
          const active = tab === t.k
          return (
            <button key={t.k} onClick={() => setTab(t.k as any)}
              className={cn('flex items-center gap-2 h-10 px-md text-body-sm font-semibold transition-colors',
                active ? 'text-brand border-b-2 border-brand' : 'text-fg-tertiary hover:text-fg-primary border-b-2 border-transparent')}>
              <Icon size={14} strokeWidth={2.2} /> {t.l}
            </button>
          )
        })}
      </div>

      {tab === 'users' && (
        <Card animate padding="none" className="overflow-hidden">
          {loading ? (
            <div className="p-md space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : users.length === 0 ? (
            <EmptyState icon={MessageSquare} title="Aucun compte" description="Cliquer Inviter un employé." action={<Button onClick={() => setModalOpen(true)}><UserPlus size={14} /> Inviter</Button>} />
          ) : (
            <DataTable minWidth={1200}>
              <THead><TR><TH>Employé</TH><TH>Canal</TH><TH>Statut</TH><TH>Code</TH><TH>Récap 18h</TH><TH>Inscrit le</TH><TH>Dernier msg</TH><TH right>Actions</TH></TR></THead>
              <tbody>
                {users.map((u, i) => {
                  const w = workers.find(x => x.id === u.worker_id)
                  const status = u.enrolled_at ? 'enrolled' : (u.enrollment_code ? 'pending' : 'inactive')
                  return (
                    <TR key={u.id} animate delay={0.04 + i * 0.02} className={!u.is_active ? 'opacity-50' : ''}>
                      <TD>
                        <div className="font-display font-semibold text-fg-primary">{w ? `${w.last_name} ${w.first_name}` : '—'}</div>
                        {w?.matricule && <div className="font-mono text-[10px] text-fg-tertiary">{w.matricule}</div>}
                      </TD>
                      <TD className="text-caption">📱 {u.channel}{u.channel_username && <span className="text-fg-tertiary ml-1">@{u.channel_username}</span>}</TD>
                      <TD>
                        {status === 'enrolled' && <Badge variant="success" size="sm" dot>Inscrit</Badge>}
                        {status === 'pending' && <Badge variant="warning" size="sm">⏳ En attente</Badge>}
                        {status === 'inactive' && <Badge variant="default" size="sm">○ Inactif</Badge>}
                      </TD>
                      <TD mono className={`text-caption font-bold ${status === 'pending' ? 'text-warning' : 'text-fg-tertiary'}`}>{u.enrollment_code ?? '—'}</TD>
                      <TD>
                        {u.enrolled_at ? (
                          <button onClick={() => toggleRecap(u)}
                            className={cn('px-2.5 py-0.5 rounded-full text-caption font-semibold transition-colors',
                              u.receive_recap ? 'bg-success/15 text-success' : 'bg-surface-sunk text-fg-tertiary')}>
                            {u.receive_recap ? '✓ ON' : '○ OFF'}
                          </button>
                        ) : <span className="text-fg-tertiary">—</span>}
                      </TD>
                      <TD className="text-caption text-fg-tertiary">{u.enrolled_at ? new Date(u.enrolled_at).toLocaleString('fr-FR') : '—'}</TD>
                      <TD className="text-caption text-fg-tertiary">{u.last_message_at ? new Date(u.last_message_at).toLocaleString('fr-FR') : '—'}</TD>
                      <TD right>{u.is_active && <Button onClick={() => deactivate(u.id)} variant="ghost" size="xs">Désactiver</Button>}</TD>
                    </TR>
                  )
                })}
              </tbody>
            </DataTable>
          )}
        </Card>
      )}

      {tab === 'messages' && (
        <Card animate padding="none" className="overflow-hidden">
          {loading ? (
            <div className="p-md space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : messages.length === 0 ? (
            <EmptyState icon={MessageCircle} title="Aucun message" description="Lance ton premier test depuis Telegram." />
          ) : (
            <DataTable>
              <THead><TR><TH>Date</TH><TH>Employé</TH><TH>Sens</TH><TH>Intent</TH><TH>Contenu</TH><TH>Action créée</TH></TR></THead>
              <tbody>
                {messages.map((m, i) => {
                  const u = users.find(x => x.id === m.chatbot_user_id)
                  const w = u ? workers.find(x => x.id === u.worker_id) : null
                  return (
                    <TR key={m.id} animate delay={0.02 + i * 0.01}>
                      <TD mono className="text-caption text-fg-tertiary whitespace-nowrap">{new Date(m.created_at).toLocaleString('fr-FR')}</TD>
                      <TD className="text-caption">{w ? `${w.last_name} ${w.first_name}` : <span className="text-fg-tertiary">—</span>}</TD>
                      <TD><Badge variant={m.direction === 'in' ? 'info' : 'default'} size="xs">{m.direction === 'in' ? '← IN' : '→ OUT'}</Badge></TD>
                      <TD mono className="text-caption text-fg-tertiary">{m.intent ?? '—'}</TD>
                      <TD className="text-caption max-w-[400px] whitespace-normal">{m.content}</TD>
                      <TD>
                        <div className="flex gap-1">
                          {m.created_harvest_id && <Badge variant="success" size="xs"><Sprout size={9} /> Récolte</Badge>}
                          {m.created_alert_id && <Badge variant="warning" size="xs"><Bell size={9} /> Alerte</Badge>}
                        </div>
                      </TD>
                    </TR>
                  )
                })}
              </tbody>
            </DataTable>
          )}
        </Card>
      )}

      {tab === 'recap' && (
        <div>
          <Card animate className="mb-md">
            <div className="flex items-center gap-sm mb-sm">
              <Bell size={14} className="text-info" />
              <span className="font-display text-body font-bold text-fg-primary">Récap quotidien automatique</span>
            </div>
            <p className="text-body-sm text-fg-secondary leading-relaxed mb-md">
              Un message Telegram est envoyé chaque jour à <strong>18h00 (heure du Maroc)</strong> aux utilisateurs avec récap activé.
              Inclut : récoltes du jour, dispatches, récoltes non dispatchées, dispatches sans prix, alertes journée sans récolte.
            </p>
            <div className="flex flex-wrap gap-sm items-center">
              <span className="text-body-sm text-fg-secondary">Date :</span>
              <TInput type="date" value={recapDate} onChange={(e) => setRecapDate(e.target.value)} className="w-auto h-8" />
              <Button onClick={previewRecap} loading={recapSending} variant="secondary" size="sm"><Eye size={12} /> Prévisualiser</Button>
              <Button onClick={sendRecapNow} loading={recapSending} disabled={!recapPreview} variant="primary" size="sm"><Send size={12} /> Envoyer</Button>
              <span className="ml-auto text-caption text-fg-tertiary">
                Destinataires : <strong className="text-success">{users.filter(u => u.receive_recap && u.enrolled_at).length}</strong>
              </span>
            </div>
            {recapResult && (
              <div className={cn('mt-md rounded-md p-sm text-body-sm border',
                recapResult.failed > 0 ? 'border-warning/30 bg-warning/5 text-warning' : 'border-success/30 bg-success/5 text-success')}>
                ✅ Envoyé à {recapResult.sent} destinataire(s){recapResult.failed > 0 && ` · ⚠ ${recapResult.failed} échec(s)`}
              </div>
            )}
          </Card>

          {recapPreview && (
            <Card animate padding="none">
              <div className="px-md py-sm border-b border-border font-mono text-caption uppercase tracking-wider text-fg-tertiary">
                Aperçu du message
              </div>
              <div className="p-lg bg-white text-black whitespace-pre-wrap text-body leading-relaxed max-h-[600px] overflow-auto"
                dangerouslySetInnerHTML={{ __html: recapPreview.replace(/\n/g, '<br>') }} />
            </Card>
          )}

          <Card variant="ghost" className="mt-md border-info/30 bg-info/5">
            <div className="flex items-start gap-sm text-body-sm text-fg-secondary">
              <Info size={14} className="text-info flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-fg-primary">Cron quotidien :</strong>
                <pre className="mt-sm rounded-md bg-surface-sunk p-sm text-caption text-fg-secondary overflow-auto">{`SELECT cron.schedule(
  'daily-harvest-recap',
  '0 17 * * *',  -- 17:00 UTC = 18:00 Maroc
  $$ SELECT net.http_post(
    url := 'https://<projet>.supabase.co/functions/v1/daily-recap',
    headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>')
  ) $$
);`}</pre>
              </div>
            </div>
          </Card>
        </div>
      )}

      {modalOpen && (
        <Modal title="Inviter un employé sur le bot Telegram" onClose={closeModal} size="lg">
          {generated ? (
            <div className="text-center space-y-md">
              <div className="text-5xl">📲</div>
              <div className="font-display text-heading-lg font-bold text-fg-primary">Invitation générée</div>
              <div className="rounded-lg border-2 border-dashed border-brand bg-brand/5 p-lg">
                <div className="text-caption text-fg-tertiary mb-sm">Code à transmettre :</div>
                <div className="font-mono text-display-lg font-extrabold text-brand tracking-[0.5em]">{generated.code}</div>
                <div className="text-caption text-fg-tertiary mt-sm">Expire le {new Date(generated.expires).toLocaleDateString('fr-FR')}</div>
              </div>
              <div className="text-left rounded-md border border-border bg-surface-sunk p-md text-body-sm text-fg-secondary leading-relaxed">
                <strong className="text-fg-primary">Instructions à envoyer :</strong>
                <ol className="list-decimal list-inside mt-sm space-y-1">
                  <li>Ouvre Telegram</li>
                  <li>Cherche le bot <code className="text-brand">@TonBot_BENHALIMA</code></li>
                  <li>Envoie : <code className="text-brand">/start {generated.code}</code></li>
                </ol>
              </div>
              <div className="flex justify-end">
                <Button onClick={closeModal} variant="primary">Fermer</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-md">
              <Field label="Employé" required>
                <TSelect value={form.worker_id} onChange={(e) => setForm(s => ({ ...s, worker_id: e.target.value }))}>
                  <option value="">— Sélectionner —</option>
                  {workers.map(w => <option key={w.id} value={w.id}>{w.last_name} {w.first_name} {w.matricule ? `(${w.matricule})` : ''}</option>)}
                </TSelect>
              </Field>
              <Field label="Langue">
                <TSelect value={form.language} onChange={(e) => setForm(s => ({ ...s, language: e.target.value }))}>
                  <option value="fr">Français</option>
                  <option value="ar">العربية</option>
                </TSelect>
              </Field>
              <div className="rounded-md bg-surface-sunk border border-border p-md text-body-sm text-fg-tertiary">
                Un code unique sera généré (valable 7 jours). Transmets-le à l'employé qui l'enverra au bot via <code className="text-brand">/start CODE</code>.
              </div>
              <ModalFooter onCancel={closeModal} onSave={generateInvitation} loading={saving} saveLabel="GÉNÉRER LE CODE" disabled={!form.worker_id} />
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
