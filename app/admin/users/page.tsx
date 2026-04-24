'use client'
import { useEffect, useState } from 'react'
import { Modal, FormGroup, FormRow, Input, Select, ModalFooter } from '@/components/ui/Modal'
import { useAuth, Role } from '@/lib/auth'
import { UserProfile, listUserProfiles, updateProfileRole, updateProfileActive, createUser } from '@/lib/adminUsers'
import { listRoles } from '@/lib/adminRoles'

export default function UsersAdminPage() {
  const { isAdmin } = useAuth()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [inviteOpen, setInviteOpen] = useState(false)
  const [invite, setInvite] = useState({ email: '', password: '', full_name: '', role_id: '' })
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      const [u, r] = await Promise.all([listUserProfiles(), listRoles()])
      setUsers(u); setRoles(r)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const onChangeRole = async (userId: string, roleId: string) => {
    try {
      await updateProfileRole(userId, roleId || null)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role_id: roleId || null, role_name: roles.find(r => r.id === roleId)?.name ?? null, is_admin: roles.find(r => r.id === roleId)?.is_admin ?? false } : u))
    } catch (e: any) { alert('Erreur : ' + e.message) }
  }
  const onToggleActive = async (userId: string, next: boolean) => {
    try {
      await updateProfileActive(userId, next)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: next } : u))
    } catch (e: any) { alert('Erreur : ' + e.message) }
  }

  const submitInvite = async () => {
    if (!invite.email || !invite.password) { setInviteError('Email et mot de passe requis'); return }
    setInviting(true); setInviteError('')
    try {
      await createUser({
        email: invite.email.trim(),
        password: invite.password,
        full_name: invite.full_name.trim() || undefined,
        role_id: invite.role_id || undefined,
      })
      setInviteOpen(false)
      setInvite({ email: '', password: '', full_name: '', role_id: '' })
      await load()
    } catch (e: any) { setInviteError(e.message) }
    finally { setInviting(false) }
  }

  if (!isAdmin) return (
    <div className="empty-state">
      <div className="empty-icon">🔒</div>
      <div className="empty-title">Accès réservé aux administrateurs</div>
    </div>
  )

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="page-title">UTILISATEURS</div>
          <div className="page-sub">{users.length} utilisateur(s) · {users.filter(u => u.is_active).length} actif(s)</div>
        </div>
        <button className="btn-primary" onClick={() => setInviteOpen(true)}>+ INVITER UN UTILISATEUR</button>
      </div>

      {error && <div style={{ padding: 12, background: 'var(--red-dim)', color: 'var(--red)', borderRadius: 8, marginBottom: 12 }}>⚠ {error}</div>}

      {loading ? (
        <div style={{ padding: 40, color: 'var(--tx-3)', textAlign: 'center' }}>CHARGEMENT...</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="tbl" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                {['Utilisateur', 'Email', 'Rôle', 'Statut', 'Dernière connexion', 'Créé le', ''].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.5 }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'color-mix(in srgb, var(--neon) 20%, transparent)', color: 'var(--neon)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
                        {(u.full_name ?? u.email).slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--tx-1)', fontWeight: 600 }}>{u.full_name ?? '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-2)' }}>{u.email}</span></td>
                  <td>
                    <select value={u.role_id ?? ''} onChange={e => onChangeRole(u.id, e.target.value)}
                      style={{ padding: '5px 8px', background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 5, fontSize: 12 }}>
                      <option value="">— Aucun —</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.name}{r.is_admin ? ' (admin)' : ''}</option>)}
                    </select>
                  </td>
                  <td>
                    <button onClick={() => onToggleActive(u.id, !u.is_active)}
                      style={{
                        padding: '3px 10px', borderRadius: 5, fontSize: 11, fontFamily: 'var(--font-mono)',
                        border: `1px solid ${u.is_active ? 'color-mix(in srgb, var(--neon) 40%, transparent)' : 'var(--bd-1)'}`,
                        background: u.is_active ? 'color-mix(in srgb, var(--neon) 15%, transparent)' : 'transparent',
                        color: u.is_active ? 'var(--neon)' : 'var(--tx-3)',
                        cursor: 'pointer',
                      }}>
                      {u.is_active ? 'ACTIF' : 'Désactivé'}
                    </button>
                  </td>
                  <td><span style={{ fontSize: 11, color: 'var(--tx-3)' }}>{u.last_login_at ? new Date(u.last_login_at).toLocaleString('fr') : '—'}</span></td>
                  <td><span style={{ fontSize: 11, color: 'var(--tx-3)' }}>{new Date(u.created_at).toLocaleDateString('fr')}</span></td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {inviteOpen && (
        <Modal title="INVITER UN UTILISATEUR" onClose={() => { setInviteOpen(false); setInviteError('') }} size="md">
          {inviteError && <div style={{ padding: 8, marginBottom: 10, background: 'var(--red-dim)', color: 'var(--red)', borderRadius: 6, fontSize: 11 }}>⚠ {inviteError}</div>}
          <div style={{ padding: 8, marginBottom: 10, background: 'var(--bg-deep)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 11, color: 'var(--tx-3)' }}>
            L'utilisateur sera créé avec email confirmé. Communique-lui son mot de passe par un canal sécurisé — il pourra le changer ensuite.
          </div>
          <FormRow>
            <FormGroup label="Email *">
              <Input type="email" value={invite.email} onChange={e => setInvite({ ...invite, email: e.target.value })} placeholder="user@domaine.com" />
            </FormGroup>
            <FormGroup label="Nom complet">
              <Input value={invite.full_name} onChange={e => setInvite({ ...invite, full_name: e.target.value })} placeholder="Prénom Nom" />
            </FormGroup>
          </FormRow>
          <FormRow>
            <FormGroup label="Mot de passe * (min 8 car.)">
              <Input type="password" value={invite.password} onChange={e => setInvite({ ...invite, password: e.target.value })} placeholder="••••••••" />
            </FormGroup>
            <FormGroup label="Rôle">
              <Select value={invite.role_id} onChange={e => setInvite({ ...invite, role_id: e.target.value })}>
                <option value="">-- À assigner plus tard --</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </FormGroup>
          </FormRow>
          <ModalFooter
            onCancel={() => setInviteOpen(false)}
            onSave={submitInvite}
            loading={inviting}
            disabled={!invite.email || !invite.password || invite.password.length < 8}
            saveLabel="CRÉER L'UTILISATEUR"
          />
        </Modal>
      )}
    </div>
  )
}
