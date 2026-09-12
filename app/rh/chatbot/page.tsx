'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

type Worker = { id: string; first_name: string; last_name: string; farm_id: string; farm_name: string }
type Access = { id: string; worker_id: string | null; farm_id: string | null; is_active: boolean; enrolled_at: string | null; enrollment_code_expires_at: string | null; language: string }
const botUsername = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? '').replace(/^@/, '')
const validBotUsername = /^[A-Za-z0-9_]{5,32}$/.test(botUsername)

export default function ChatbotPage() {
  const { activeDomain } = useAuth()
  const domainId = activeDomain?.domain_id
  const [workers, setWorkers] = useState<Worker[]>([])
  const [users, setUsers] = useState<Access[]>([])
  const [workerId, setWorkerId] = useState('')
  const [language, setLanguage] = useState('darija')
  const [invitation, setInvitation] = useState<{ code: string; expires_at: string; domain_id: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [loadedDomain, setLoadedDomain] = useState<string>()
  useEffect(() => {
    let cancelled = false
    setWorkers([]); setUsers([]); setWorkerId(''); setInvitation(null); setError(''); setLoadedDomain(undefined)
    if (!domainId) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      supabase.rpc('telegram_invitable_workers', { p_domain_id: domainId }),
      supabase.from('chatbot_users').select('id,worker_id,farm_id,is_active,enrolled_at,enrollment_code_expires_at,language')
        .eq('domain_id', domainId).order('created_at', { ascending: false }),
    ]).then(([w, u]) => {
      if (cancelled) return
      if (w.error || u.error) throw w.error || u.error
      setWorkers(w.data ?? []); setUsers(u.data ?? []); setLoadedDomain(domainId)
    }).catch(e => { if (!cancelled) setError(e.message ?? 'Chargement impossible') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [domainId, revision])

  const invite = async () => {
    if (!domainId || loadedDomain !== domainId || !workerId || saving) return
    if (!confirm('Cette invitation remplacera tout ancien accès et code Telegram de cet employé. Continuer ?')) return
    setSaving(true); setInvitation(null)
    try {
      const { data, error } = await supabase.rpc('invite_telegram_worker', {
        p_domain_id: domainId, p_worker_id: workerId, p_language: language,
      })
      if (error) throw error
      if (!data?.[0]) throw new Error('Invitation non retournée')
      setInvitation({ ...data[0], domain_id: domainId })
      toast.success('Invitation créée. Conservez le code avant de rafraîchir la liste.')
    } catch (e: any) { toast.error(e.message ?? 'Invitation impossible') }
    finally { setSaving(false) }
  }
  const disable = async (id: string) => {
    if (saving || !confirm('Désactiver cet accès Telegram et son code ?')) return
    setSaving(true)
    try {
      const { error } = await supabase.rpc('disable_telegram_user', { p_id: id })
      if (error) throw error
      setRevision(r => r + 1); toast.success('Accès désactivé')
    } catch (e: any) { toast.error(e.message ?? 'Désactivation impossible') }
    finally { setSaving(false) }
  }
  const ready = loadedDomain === domainId && !!domainId
  return <div className="space-y-5">
    <h1 className="text-2xl font-semibold">Chatbot Telegram</h1>
    <p>Invitations personnelles — {activeDomain?.domain_name ?? 'Sélectionnez une société'}</p>
    <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      Pilote sécurisé : inscription et vérification d’accès uniquement. Les saisies métier, le vocal et les récapitulatifs restent suspendus.
      La migration 113 et le déploiement des fonctions sont nécessaires ; cet écran ne prouve pas que le bot est activé.
    </div>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    <section className="rounded border bg-white p-4 space-y-3">
      <h2 className="font-semibold">Inviter une personne</h2>
      <label className="block">Employé et ferme
        <select className="block w-full border rounded p-2" value={ready ? workerId : ''} disabled={!ready || saving}
          onChange={e => { setWorkerId(e.target.value); setInvitation(null) }}>
          <option value="">Sélectionner un employé</option>
          {ready && workers.map(w => <option key={w.id} value={w.id}>{w.first_name} {w.last_name} — {w.farm_name}</option>)}
        </select>
      </label>
      {ready && !workers.length && <p>Aucun employé accessible : vérifiez votre rôle administrateur et le rattachement des employés actifs à une ferme active de cette société.</p>}
      <label className="block">Langue souhaitée (pour les prochains parcours métier)
        <select className="block border rounded p-2" value={language} onChange={e => setLanguage(e.target.value)}>
          <option value="darija">Darija</option><option value="fr">Français</option>
          <option value="ar">Arabe</option><option value="en">Anglais</option>
        </select>
      </label>
      <p className="text-sm">Code valable 7 jours, utilisable une seule fois en conversation privée. Un compte Telegram actif par personne ; pas de groupe ni de nom libre.</p>
      <button className="rounded bg-indigo-600 text-white p-2 disabled:opacity-50" onClick={invite} disabled={!ready || !workerId || saving}>
        {saving ? 'Traitement…' : 'Générer une invitation'}
      </button>
      {ready && invitation && invitation.domain_id === domainId && <div className="rounded border p-3 space-y-2" role="status">
        <p>À transmettre uniquement à la personne concernée :</p>
        <code className="block break-all">/start {invitation.code}</code>
        <p>Expiration : {new Date(invitation.expires_at).toLocaleString('fr-FR')}</p>
        {validBotUsername
          ? <a className="text-indigo-600 underline" href={`https://t.me/${botUsername}?start=${invitation.code}`} target="_blank" rel="noreferrer">Ouvrir l’invitation Telegram</a>
          : <p>Nom du bot non configuré : définir NEXT_PUBLIC_TELEGRAM_BOT_USERNAME puis redémarrer l’application. Ne jamais mettre le jeton Telegram dans cette variable.</p>}
        <p>Après l’inscription, envoyer /statut pour vérifier la société et la ferme.</p>
      </div>}
    </section>
    <section className="rounded border bg-white p-4">
      <div className="flex justify-between"><h2 className="font-semibold">Accès de la société</h2>
        <button onClick={() => setRevision(r => r + 1)} disabled={saving || loading}>Actualiser</button></div>
      {loading ? <p>Chargement…</p> : ready && <div className="overflow-auto"><table className="w-full text-sm">
        <thead><tr><th className="text-left p-2">Employé</th><th className="text-left">Ferme</th><th className="text-left">Statut</th><th>Action</th></tr></thead>
        <tbody>{users.map(u => {
          const w = workers.find(w => w.id === u.worker_id)
          const status = !u.is_active ? 'Désactivé' : !w || w.farm_id !== u.farm_id ? 'Accès bloqué : rattachement à vérifier'
            : u.enrolled_at ? 'Inscrit' : !u.enrollment_code_expires_at || new Date(u.enrollment_code_expires_at) <= new Date() ? 'Invitation expirée' : 'En attente'
          return <tr key={u.id}><td className="p-2">{w ? `${w.first_name} ${w.last_name}` : 'Employé inactif ou inaccessible'}</td>
            <td>{w?.farm_id === u.farm_id ? w.farm_name : 'À vérifier'}</td><td>{status}</td>
            <td className="text-center">{u.is_active && <button className="text-red-600" disabled={saving} onClick={() => disable(u.id)}>Désactiver</button>}</td></tr>
        })}</tbody>
      </table>{!users.length && <p>Aucun accès dans cette société.</p>}</div>}
    </section>
  </div>
}
