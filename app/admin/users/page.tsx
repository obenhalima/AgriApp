'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { UserCog, UserPlus, Lock, Users, UserCheck } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect, Field } from '@/components/ui/Input'
import { Modal, FormRow, FormGroup, ModalFooter } from '@/components/ui/Modal'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'
import { useAuth, Role } from '@/lib/auth'
import { UserProfile, listUserProfiles, updateProfileRole, updateProfileActive, createUser } from '@/lib/adminUsers'
import { listRoles } from '@/lib/adminRoles'

export default function UsersAdminPage() {
  const { isAdmin } = useAuth()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [invite, setInvite] = useState({ email: '', password: '', full_name: '', role_id: '' })
  const [inviting, setInviting] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const [u, r] = await Promise.all([listUserProfiles(), listRoles()])
      setUsers(u); setRoles(r)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const onChangeRole = async (userId: string, roleId: string) => {
    try {
      await updateProfileRole(userId, roleId || null)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role_id: roleId || null, role_name: roles.find(r => r.id === roleId)?.name ?? null, is_admin: roles.find(r => r.id === roleId)?.is_admin ?? false } : u))
      toast.success('Rôle mis à jour')
    } catch (e: any) { toast.error(e.message) }
  }

  const onToggleActive = async (userId: string, next: boolean) => {
    try {
      await updateProfileActive(userId, next)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: next } : u))
      toast.success(next ? 'Utilisateur activé' : 'Utilisateur désactivé')
    } catch (e: any) { toast.error(e.message) }
  }

  const submitInvite = async () => {
    if (!invite.email || !invite.password) { toast.error('Email et mot de passe requis'); return }
    setInviting(true)
    try {
      await createUser({
        email: invite.email.trim(), password: invite.password,
        full_name: invite.full_name.trim() || undefined, role_id: invite.role_id || undefined,
      })
      setInviteOpen(false)
      setInvite({ email: '', password: '', full_name: '', role_id: '' })
      toast.success('Utilisateur créé')
      await load()
    } catch (e: any) { toast.error(e.message) }
    finally { setInviting(false) }
  }

  if (!isAdmin) return (
    <EmptyState icon={Lock} title="Accès réservé aux administrateurs" />
  )

  return (
    <div>
      <PageHeader
        title="Utilisateurs" subtitle="Administration" icon={UserCog} iconColor="#ef4444"
        description={`${users.length} utilisateur${users.length > 1 ? 's' : ''} · ${users.filter(u => u.is_active).length} actif${users.filter(u => u.is_active).length > 1 ? 's' : ''}`}
        actions={<Button onClick={() => setInviteOpen(true)} variant="primary"><UserPlus size={14} strokeWidth={2.5} /> Inviter un utilisateur</Button>}
        stats={loading ? [] : [
          { label: 'Total', value: String(users.length), icon: Users, color: '#0ea5e9' },
          { label: 'Actifs', value: String(users.filter(u => u.is_active).length), icon: UserCheck, color: '#10b981' },
          { label: 'Admins', value: String(users.filter(u => u.is_admin).length), icon: UserCog, color: '#ef4444' },
        ]}
      />

      <Card animate padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-md space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : users.length === 0 ? (
          <EmptyState icon={Users} title="Aucun utilisateur" />
        ) : (
          <DataTable minWidth={1000}>
            <THead><TR><TH>Utilisateur</TH><TH>Email</TH><TH>Rôle</TH><TH>Statut</TH><TH>Dernière connexion</TH><TH>Créé le</TH></TR></THead>
            <tbody>
              {users.map((u, i) => (
                <TR key={u.id} animate delay={0.04 + i * 0.02} className={!u.is_active ? 'opacity-50' : ''}>
                  <TD>
                    <div className="flex items-center gap-sm">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-caption font-bold flex-shrink-0"
                        style={{ background: 'color-mix(in srgb, var(--neon) 20%, transparent)', color: 'var(--neon)' }}>
                        {(u.full_name ?? u.email).slice(0, 1).toUpperCase()}
                      </div>
                      <div className="font-display font-semibold text-fg-primary">{u.full_name ?? '—'}</div>
                    </div>
                  </TD>
                  <TD mono className="text-caption">{u.email}</TD>
                  <TD>
                    <TSelect value={u.role_id ?? ''} onChange={(e) => onChangeRole(u.id, e.target.value)} className="h-7 text-caption w-auto min-w-[140px]">
                      <option value="">— Aucun —</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.name}{r.is_admin ? ' (admin)' : ''}</option>)}
                    </TSelect>
                  </TD>
                  <TD>
                    <button onClick={() => onToggleActive(u.id, !u.is_active)}
                      className={`px-2.5 py-0.5 rounded text-caption font-mono uppercase font-semibold border transition-colors ${u.is_active ? 'border-success/40 bg-success/15 text-success' : 'border-border bg-transparent text-fg-tertiary'}`}>
                      {u.is_active ? 'Actif' : 'Désactivé'}
                    </button>
                  </TD>
                  <TD className="text-caption text-fg-tertiary">{u.last_login_at ? new Date(u.last_login_at).toLocaleString('fr') : '—'}</TD>
                  <TD className="text-caption text-fg-tertiary">{new Date(u.created_at).toLocaleDateString('fr')}</TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>

      {inviteOpen && (
        <Modal title="INVITER UN UTILISATEUR" onClose={() => setInviteOpen(false)} size="md">
          <div className="space-y-md">
            <div className="rounded-md bg-surface-sunk border border-border p-md text-caption text-fg-tertiary">
              L'utilisateur sera créé avec email confirmé. Communique-lui son mot de passe par un canal sécurisé.
            </div>
            <FormRow>
              <FormGroup label="Email *"><TInput type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="user@domaine.com" /></FormGroup>
              <FormGroup label="Nom complet"><TInput value={invite.full_name} onChange={(e) => setInvite({ ...invite, full_name: e.target.value })} placeholder="Prénom Nom" /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Mot de passe * (min 8 car.)"><TInput type="password" value={invite.password} onChange={(e) => setInvite({ ...invite, password: e.target.value })} placeholder="••••••••" /></FormGroup>
              <FormGroup label="Rôle">
                <TSelect value={invite.role_id} onChange={(e) => setInvite({ ...invite, role_id: e.target.value })}>
                  <option value="">— Plus tard —</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </TSelect>
              </FormGroup>
            </FormRow>
            <ModalFooter onCancel={() => setInviteOpen(false)} onSave={submitInvite} loading={inviting} disabled={!invite.email || !invite.password || invite.password.length < 8} saveLabel="CRÉER L'UTILISATEUR" />
          </div>
        </Modal>
      )}
    </div>
  )
}
