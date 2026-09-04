'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { UserCog, UserPlus, Lock, Users, UserCheck, Pencil, ShieldCheck } from 'lucide-react'
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
import { UserProfile, UserDomainMembership, listUserProfiles, listUserDomainMemberships, replaceUserDomainMemberships, updateProfileRole, updateProfileActive, updateUserProfile, createUser } from '@/lib/adminUsers'
import { listRoles } from '@/lib/adminRoles'
import { listDomains, type Domain } from '@/lib/domains'

export default function UsersAdminPage() {
  const { isAdmin, isPlatformAdmin } = useAuth()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [domains, setDomains] = useState<Domain[]>([])
  const [memberships, setMemberships] = useState<Record<string, UserDomainMembership[]>>({})
  const [loading, setLoading] = useState(true)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [invite, setInvite] = useState({ email: '', password: '', full_name: '', role_id: '' })
  const [inviteDomains, setInviteDomains] = useState<string[]>([])
  const [inviting, setInviting] = useState(false)
  const [editing, setEditing] = useState<UserProfile | null>(null)
  const [editForm, setEditForm] = useState({ full_name: '', phone: '', role_id: '', is_active: true, is_platform_admin: false })
  const [editMemberships, setEditMemberships] = useState<UserDomainMembership[]>([])
  const [savingEdit, setSavingEdit] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const [u, r, d] = await Promise.all([listUserProfiles(), listRoles(), listDomains()])
      const membershipsByUser = await listUserDomainMemberships(u.map(user => user.id))
      setUsers(u); setRoles(r); setDomains(d); setMemberships(membershipsByUser)
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
    if (isPlatformAdmin && (!invite.role_id || inviteDomains.length === 0)) { toast.error('Sélectionne un rôle et au moins un domaine'); return }
    setInviting(true)
    try {
      const created = await createUser({
        email: invite.email.trim(), password: invite.password,
        full_name: invite.full_name.trim() || undefined, role_id: invite.role_id || undefined,
      })
      if (isPlatformAdmin) {
        await replaceUserDomainMemberships(created.id, inviteDomains.map((domainId, index) => ({
          domain_id: domainId, role_id: invite.role_id, is_active: true, is_default: index === 0,
        })))
      }
      setInviteOpen(false)
      setInvite({ email: '', password: '', full_name: '', role_id: '' })
      setInviteDomains([])
      toast.success('Utilisateur créé')
      await load()
    } catch (e: any) { toast.error(e.message) }
    finally { setInviting(false) }
  }

  const openEdit = (u: UserProfile) => {
    setEditing(u)
    setEditForm({
      full_name: u.full_name ?? '',
      phone: u.phone ?? '',
      role_id: u.role_id ?? '',
      is_active: u.is_active,
      is_platform_admin: Boolean(u.is_platform_admin),
    })
    setEditMemberships((memberships[u.id] ?? []).map(item => ({ ...item })))
  }

  const toggleDomain = (domainId: string, enabled: boolean) => {
    if (!enabled) {
      setEditMemberships(items => {
        const next = items.filter(item => item.domain_id !== domainId)
        if (next.length && !next.some(item => item.is_default)) next[0].is_default = true
        return [...next]
      })
      return
    }
    const defaultRoleId = editForm.role_id || roles[0]?.id || ''
    setEditMemberships(items => [...items, {
      domain_id: domainId, role_id: defaultRoleId, is_active: true, is_default: items.length === 0,
    }])
  }

  const updateMembership = (domainId: string, patch: Partial<UserDomainMembership>) => {
    setEditMemberships(items => items.map(item => {
      if (patch.is_default) return { ...item, is_default: item.domain_id === domainId }
      return item.domain_id === domainId ? { ...item, ...patch } : item
    }))
  }

  const submitEdit = async () => {
    if (!editing) return
    if (isPlatformAdmin && !editForm.is_platform_admin && editForm.is_active && editMemberships.length === 0) {
      toast.error('Sélectionne au moins un domaine pour cet utilisateur actif.')
      return
    }
    if (isPlatformAdmin && editMemberships.some(item => !item.role_id)) {
      toast.error('Sélectionne un rôle pour chaque domaine autorisé.')
      return
    }
    setSavingEdit(true)
    try {
      const patch: Parameters<typeof updateUserProfile>[1] = {
        full_name: editForm.full_name.trim(),
        phone: editForm.phone.trim(),
        role_id: editForm.role_id || null,
        is_active: editForm.is_active,
      }
      if (isPlatformAdmin) {
        patch.is_platform_admin = editForm.is_platform_admin
      }
      await updateUserProfile(editing.id, patch)
      if (isPlatformAdmin) await replaceUserDomainMemberships(editing.id, editMemberships)
      toast.success('Utilisateur modifié')
      setEditing(null)
      await load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSavingEdit(false) }
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
          { label: 'Super admins', value: String(users.filter(u => u.is_platform_admin).length), icon: ShieldCheck, color: '#8b5cf6' },
        ]}
      />

      <Card animate padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-md space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : users.length === 0 ? (
          <EmptyState icon={Users} title="Aucun utilisateur" />
        ) : (
          <DataTable minWidth={1000}>
            <THead><TR><TH>Utilisateur</TH><TH>Email</TH><TH>Niveau plateforme</TH><TH>Rôle</TH><TH>Statut</TH><TH>Dernière connexion</TH><TH>Actions</TH></TR></THead>
            <tbody>
              {users.map((u, i) => (
                <TR key={u.id} animate delay={0.04 + i * 0.02} className={!u.is_active ? 'opacity-50' : ''}>
                  <TD>
                    <div className="flex items-center gap-sm">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-caption font-bold flex-shrink-0"
                        style={{ background: 'color-mix(in srgb, var(--neon) 20%, transparent)', color: 'var(--neon)' }}>
                        {(u.full_name ?? u.email).slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-display font-semibold text-fg-primary">{u.full_name ?? '—'}</div>
                        {u.phone && <div className="text-caption text-fg-tertiary">{u.phone}</div>}
                      </div>
                    </div>
                  </TD>
                  <TD mono className="text-caption">{u.email}</TD>
                  <TD>
                    {u.is_platform_admin ? (
                      <Badge variant="danger" size="sm"><ShieldCheck size={11} /> Super admin</Badge>
                    ) : (
                      <span className="text-caption text-fg-tertiary">Utilisateur</span>
                    )}
                  </TD>
                  <TD>
                    <TSelect value={u.role_id ?? ''} onChange={(e) => onChangeRole(u.id, e.target.value)} className="h-7 text-caption w-auto min-w-[140px]">
                      <option value="">— Aucun —</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.name}{r.is_admin ? ' (admin)' : ''}</option>)}
                    </TSelect>
                  </TD>
                  <TD>
                    <button onClick={() => onToggleActive(u.id, !u.is_active)}
                      disabled={u.is_platform_admin && !isPlatformAdmin}
                      className={`px-2.5 py-0.5 rounded text-caption font-mono uppercase font-semibold border transition-colors ${u.is_active ? 'border-success/40 bg-success/15 text-success' : 'border-border bg-transparent text-fg-tertiary'}`}>
                      {u.is_active ? 'Actif' : 'Désactivé'}
                    </button>
                  </TD>
                  <TD className="text-caption text-fg-tertiary">{u.last_login_at ? new Date(u.last_login_at).toLocaleString('fr') : '—'}</TD>
                  <TD>
                    <Button variant="secondary" size="sm" onClick={() => openEdit(u)}>
                      <Pencil size={12} /> Modifier
                    </Button>
                  </TD>
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

      {editing && (
        <Modal title={`MODIFIER — ${editing.full_name ?? editing.email}`} onClose={() => setEditing(null)} size="md">
          <div className="space-y-md">
            <FormRow>
              <FormGroup label="Nom complet">
                <TInput value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
              </FormGroup>
              <FormGroup label="Téléphone">
                <TInput value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              </FormGroup>
            </FormRow>
            <FormGroup label="Email">
              <div>
                <TInput value={editing.email} disabled />
                <div className="mt-1 text-caption text-fg-tertiary">
                  Le changement d'email sera ajouté via l'administration Supabase Auth.
                </div>
              </div>
            </FormGroup>
            <FormRow>
              <FormGroup label="Rôle actuel">
                <TSelect value={editForm.role_id} onChange={(e) => setEditForm({ ...editForm, role_id: e.target.value })}>
                  <option value="">— Aucun —</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}{r.is_admin ? ' (admin)' : ''}</option>)}
                </TSelect>
              </FormGroup>
              <FormGroup label="Statut du compte">
                <TSelect value={editForm.is_active ? 'active' : 'inactive'} onChange={(e) => setEditForm({ ...editForm, is_active: e.target.value === 'active' })}>
                  <option value="active">Actif</option>
                  <option value="inactive">Désactivé</option>
                </TSelect>
              </FormGroup>
            </FormRow>
            {isPlatformAdmin && (
              <FormGroup label="Domaines autorisés *">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-xs rounded-md border border-border p-sm">
                  {domains.map(domain => (
                    <label key={domain.id} className="flex items-center gap-sm p-xs text-body-sm cursor-pointer">
                      <input
                        type="checkbox" checked={inviteDomains.includes(domain.id)}
                        onChange={e => setInviteDomains(current => e.target.checked ? [...current, domain.id] : current.filter(id => id !== domain.id))}
                      />
                      {domain.name}
                    </label>
                  ))}
                </div>
              </FormGroup>
            )}
            <div className="rounded-md border border-border bg-surface-sunk p-md">
              <label className="flex items-start gap-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-purple-600"
                  checked={editForm.is_platform_admin}
                  disabled={!isPlatformAdmin}
                  onChange={(e) => setEditForm({ ...editForm, is_platform_admin: e.target.checked })}
                />
                <span>
                  <span className="flex items-center gap-1.5 font-semibold text-body-sm text-fg-primary">
                    <ShieldCheck size={14} className="text-purple-500" /> Super-administrateur plateforme
                  </span>
                  <span className="block mt-1 text-caption text-fg-tertiary">
                    Accès global à tous les domaines. Seul un super-administrateur peut modifier ce statut.
                  </span>
                </span>
              </label>
            </div>
            {isPlatformAdmin && (
              <div className="rounded-md border border-border p-md space-y-sm">
                <div className="font-semibold text-body-sm text-fg-primary">Domaines autorisés</div>
                <div className="text-caption text-fg-tertiary">Sélectionne un ou plusieurs domaines et le rôle appliqué dans chacun.</div>
                {domains.map(domain => {
                  const membership = editMemberships.find(item => item.domain_id === domain.id)
                  return (
                    <div key={domain.id} className="grid grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_auto] items-center gap-sm rounded-md border border-border bg-surface-sunk px-sm py-sm">
                      <label className="flex items-center gap-sm text-body-sm font-medium cursor-pointer">
                        <input type="checkbox" checked={Boolean(membership)} onChange={e => toggleDomain(domain.id, e.target.checked)} />
                        <span>{domain.name}<span className="block font-mono text-[10px] text-fg-tertiary">{domain.code}</span></span>
                      </label>
                      <TSelect value={membership?.role_id ?? ''} onChange={e => updateMembership(domain.id, { role_id: e.target.value })} disabled={!membership}>
                        <option value="">— Rôle —</option>
                        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </TSelect>
                      <label className="flex items-center gap-xs text-caption text-fg-secondary">
                        <input type="radio" name="default-domain" checked={Boolean(membership?.is_default)} disabled={!membership} onChange={() => updateMembership(domain.id, { is_default: true })} /> Défaut
                      </label>
                    </div>
                  )
                })}
                {!editForm.is_platform_admin && editForm.is_active && editMemberships.length === 0 && (
                  <div className="text-caption text-danger">Un utilisateur actif doit avoir au moins un domaine.</div>
                )}
              </div>
            )}
            <ModalFooter
              onCancel={() => setEditing(null)} onSave={submitEdit} loading={savingEdit}
              disabled={isPlatformAdmin && ((!editForm.is_platform_admin && editForm.is_active && editMemberships.length === 0) || editMemberships.some(item => !item.role_id))}
              saveLabel="ENREGISTRER"
            />
          </div>
        </Modal>
      )}
    </div>
  )
}
