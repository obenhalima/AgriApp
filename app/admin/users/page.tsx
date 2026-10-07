'use client'
import {useLanguage} from '@/lib/i18n'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { UserCog, UserPlus, Lock, Users, UserCheck, Pencil, ShieldCheck, KeyRound, Briefcase, Mail, RefreshCw } from 'lucide-react'
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
import { UserProfile, UserDomainMembership, listUserProfiles, listUserDomainMemberships, replaceUserDomainMemberships, setUserMembershipInManagedDomain, updateProfileRole, updateProfileActive, updateUserProfile, createUser, sendUserPasswordReset, setTemporaryUserPassword } from '@/lib/adminUsers'
import { listRoles } from '@/lib/adminRoles'
import { listDomains, type Domain } from '@/lib/domains'
import { BusinessCapability, FunctionCapability, OperationalFunction, getUserOrganizationConfig, listOrganizationCatalog, saveUserOrganizationConfig } from '@/lib/organization'

export default function UsersAdminPage() {
 const {t:_ui,text:_uiNode}=useLanguage()

  const { user, isAdmin, isPlatformAdmin, activeDomain } = useAuth()
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
  const [sendingReset, setSendingReset] = useState(false)
  const [temporaryResetOpen, setTemporaryResetOpen] = useState(false)
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [temporaryPasswordApplied, setTemporaryPasswordApplied] = useState(false)
  const [applyingTemporaryPassword, setApplyingTemporaryPassword] = useState(false)
  const [orgFunctions, setOrgFunctions] = useState<OperationalFunction[]>([])
  const [orgCapabilities, setOrgCapabilities] = useState<BusinessCapability[]>([])
  const [functionCapabilities, setFunctionCapabilities] = useState<FunctionCapability[]>([])
  const [orgDomainId, setOrgDomainId] = useState('')
  const [selectedFunctions, setSelectedFunctions] = useState<string[]>([])
  const [capabilityOverrides, setCapabilityOverrides] = useState<Record<string, 'inherit' | 'grant' | 'deny'>>({})
  const [orgLoading, setOrgLoading] = useState(false)
  const [orgSaving, setOrgSaving] = useState(false)
  const manageableDomains = isPlatformAdmin ? domains : domains.filter(domain => {
    const ownMembership = (memberships[user?.id ?? ''] ?? []).find(item => item.domain_id === domain.id && item.is_active)
    return roles.find(role => role.id === ownMembership?.role_id)?.is_admin
  })

  const openInvite = () => {
    setInviteDomains(manageableDomains.length === 1 ? [manageableDomains[0].id] : [])
    setInviteOpen(true)
  }

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

  useEffect(() => {
    listOrganizationCatalog().then(catalog => {
      setOrgFunctions(catalog.functions)
      setOrgCapabilities(catalog.capabilities)
      setFunctionCapabilities(catalog.mappings)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!editing || !orgDomainId || orgFunctions.length === 0) return
    setOrgLoading(true)
    getUserOrganizationConfig(editing.id, orgDomainId).then(config => {
      setSelectedFunctions(config.assignments.filter(item => !item.farm_id).map(item => item.function_id))
      setCapabilityOverrides(config.overrides.filter(item => !item.farm_id).reduce((out:Record<string,'grant'|'deny'>,item) => {
        out[item.capability_id] = item.granted ? 'grant' : 'deny'
        return out
      }, {}))
    }).catch(e => toast.error(e.message)).finally(() => setOrgLoading(false))
  }, [editing?.id, orgDomainId, orgFunctions.length])

  const onChangeRole = async (userId: string, roleId: string) => {
    try {
      await updateProfileRole(userId, roleId || null)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role_id: roleId || null, role_name: roles.find(r => r.id === roleId)?.name ?? null, is_admin: roles.find(r => r.id === roleId)?.is_admin ?? false } : u))
      toast.success(_ui("Rôle mis à jour"))
    } catch (e: any) { toast.error(e.message) }
  }

  const onToggleActive = async (userId: string, next: boolean) => {
    try {
      await updateProfileActive(userId, next)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: next } : u))
      toast.success(next ? _ui("Utilisateur activé") : _ui("Utilisateur désactivé"))
    } catch (e: any) { toast.error(e.message) }
  }

  const submitInvite = async () => {
    if (!invite.email || !invite.password) { toast.error(_ui("Email et mot de passe requis")); return }
    if (!invite.role_id || inviteDomains.length === 0) { toast.error(_ui("Sélectionne un rôle et au moins une société")); return }
    setInviting(true)
    try {
      const created = await createUser({
        email: invite.email.trim(), password: invite.password,
        full_name: invite.full_name.trim() || undefined, role_id: invite.role_id || undefined,
        memberships: inviteDomains.map((domainId,index)=>({ domain_id:domainId,role_id:invite.role_id,is_default:index===0 })),
      })
      setInviteOpen(false)
      setInvite({ email: '', password: '', full_name: '', role_id: '' })
      setInviteDomains([])
      toast.success(_ui("Utilisateur créé"))
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
    const available = (memberships[u.id] ?? []).filter(item => item.is_active && manageableDomains.some(domain => domain.id === item.domain_id))
    setOrgDomainId(available[0]?.domain_id ?? '')
    setSelectedFunctions([])
    setCapabilityOverrides({})
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
      toast.error(_ui("Sélectionne au moins une société pour cet utilisateur actif."))
      return
    }
    if (isPlatformAdmin && editMemberships.some(item => !item.role_id)) {
      toast.error(_ui("Sélectionne un rôle pour chaque société autorisée."))
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
      if (isPlatformAdmin) {
        await replaceUserDomainMemberships(editing.id, editMemberships)
      } else {
        for (const company of manageableDomains) {
          const membership = editMemberships.find(item => item.domain_id === company.id)
          const previous = (memberships[editing.id] ?? []).find(item => item.domain_id === company.id)
          if (!membership && !previous) continue
          await setUserMembershipInManagedDomain(
            editing.id, company.id,
            membership?.role_id || previous?.role_id || editForm.role_id,
            Boolean(membership),
          )
        }
      }
      toast.success(_ui("Utilisateur modifié"))
      setEditing(null)
      await load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSavingEdit(false) }
  }

  const sendPasswordReset = async () => {
    if (!editing) return
    setSendingReset(true)
    try {
      await sendUserPasswordReset(editing.id)
      toast.success(_ui("Lien de réinitialisation envoyé à {v0}",{v0:String(editing.email)}))
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSendingReset(false)
    }
  }

  const generateTemporaryPassword = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
    const bytes = new Uint32Array(14)
    crypto.getRandomValues(bytes)
    setTemporaryPassword(Array.from(bytes, value => alphabet[value % alphabet.length]).join(''))
    setTemporaryPasswordApplied(false)
  }

  const openTemporaryReset = () => {
    setTemporaryResetOpen(true)
    setTemporaryPasswordApplied(false)
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
    const bytes = new Uint32Array(14)
    crypto.getRandomValues(bytes)
    setTemporaryPassword(Array.from(bytes, value => alphabet[value % alphabet.length]).join(''))
  }

  const applyTemporaryPassword = async () => {
    if (!editing || temporaryPassword.length < 8) return
    setApplyingTemporaryPassword(true)
    try {
      await setTemporaryUserPassword(editing.id, temporaryPassword)
      setTemporaryPasswordApplied(true)
      toast.success(_ui("Mot de passe temporaire appliqué. Le changement sera obligatoire à la connexion."))
    } catch (e: any) { toast.error(e.message) }
    finally { setApplyingTemporaryPassword(false) }
  }

  const prepareTemporaryPasswordEmail = () => {
    if (!editing || !temporaryPasswordApplied) return
    const subject = encodeURIComponent('ItriX Farm — Votre mot de passe temporaire')
    const body = encodeURIComponent(`Bonjour ${editing.full_name || ''},\n\nVotre mot de passe ItriX Farm a été réinitialisé.\n\nIdentifiant : ${editing.email}\nMot de passe temporaire : ${temporaryPassword}\n\nÀ votre prochaine connexion, vous devrez obligatoirement choisir un nouveau mot de passe personnel.\n\nCordialement,`)
    window.location.href = `mailto:${encodeURIComponent(editing.email)}?subject=${subject}&body=${body}`
  }

  const saveOrganization = async () => {
    if (!editing || !orgDomainId) return
    setOrgSaving(true)
    try {
      await saveUserOrganizationConfig(
        editing.id,
        orgDomainId,
        selectedFunctions.map(functionId => ({ function_id: functionId, farm_id: null, valid_from: new Date().toISOString().slice(0, 10) })),
        Object.entries(capabilityOverrides).filter(([,value]) => value !== 'inherit').map(([capabilityId,value]) => ({
          capability_id: capabilityId, farm_id: null, granted: value === 'grant', reason: 'Paramétrage depuis la fiche utilisateur',
        })),
      )
      toast.success(_ui("Fonctions et habilitations enregistrées"))
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setOrgSaving(false)
    }
  }

  const inheritedCapabilities = new Set(functionCapabilities
    .filter(mapping => selectedFunctions.includes(mapping.function_id))
    .map(mapping => mapping.capability_id))

  if (!isAdmin) return (
    <EmptyState icon={Lock} title={_ui("Accès réservé aux administrateurs")} />
  )

  return (
    <div>
      <PageHeader
        title={_ui("Utilisateurs")} subtitle={_ui("Administration")} icon={UserCog} iconColor="#ef4444"
        description={_ui("{v0} utilisateur{v1} · {v2} actif{v3}",{v0:String(users.length),v1:String(users.length > 1 ? 's' : ''),v2:String(users.filter(u => u.is_active).length),v3:String(users.filter(u => u.is_active).length > 1 ? 's' : '')})}
        actions={<Button onClick={openInvite} variant="primary"><UserPlus size={14} strokeWidth={2.5} /> {" "}{_ui("Inviter un utilisateur")}</Button>}
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
          <EmptyState icon={Users} title={_ui("Aucun utilisateur")} />
        ) : (
          <DataTable minWidth={1000}>
            <THead><TR><TH>{_ui("Utilisateur")}</TH><TH>{_ui("Email")}</TH><TH>{_ui("Clients / Sociétés")}</TH><TH>{_ui("Niveau plateforme")}</TH><TH>{_ui("Rôle")}</TH><TH>{_ui("Statut")}</TH><TH>{_ui("Dernière connexion")}</TH><TH>{_ui("Actions")}</TH></TR></THead>
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
                    <div className="flex flex-wrap gap-1">
                      {(memberships[u.id] ?? []).filter(m => m.is_active).map(m => {
                        const domain = domains.find(d => d.id === m.domain_id)
                        return domain ? <Badge key={m.domain_id} variant={m.is_default ? 'brand' : 'default'} size="sm">{domain.name}{m.is_default ? _ui("· défaut") : ''}</Badge> : null
                      })}
                      {(memberships[u.id] ?? []).filter(m => m.is_active).length === 0 && <span className="text-caption text-fg-tertiary">—</span>}
                    </div>
                  </TD>
                  <TD>
                    {u.is_platform_admin ? (
                      <Badge variant="danger" size="sm"><ShieldCheck size={11} /> {" "}{_ui("Super admin")}</Badge>
                    ) : (
                      <span className="text-caption text-fg-tertiary">{_ui("Utilisateur")}</span>
                    )}
                  </TD>
                  <TD>
                    <TSelect value={u.role_id ?? ''} onChange={(e) => onChangeRole(u.id, e.target.value)} disabled={!isPlatformAdmin} className="h-7 text-caption w-auto min-w-[140px]">
                      <option value="">{_ui("— Aucun —")}</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.name}{r.is_admin ? _ui("(admin)") : ''}</option>)}
                    </TSelect>
                  </TD>
                  <TD>
                    <button onClick={() => onToggleActive(u.id, !u.is_active)}
                      disabled={u.is_platform_admin && !isPlatformAdmin}
                      className={`px-2.5 py-0.5 rounded text-caption font-mono uppercase font-semibold border transition-colors ${u.is_active ? 'border-success/40 bg-success/15 text-success' : 'border-border bg-transparent text-fg-tertiary'}`}>
                      {u.is_active ? _ui("Actif") : _ui("Désactivé")}
                    </button>
                  </TD>
                  <TD className="text-caption text-fg-tertiary">{u.last_login_at ? new Date(u.last_login_at).toLocaleString('fr') : '—'}</TD>
                  <TD>
                    <Button variant="secondary" size="sm" onClick={() => openEdit(u)}>
                      <Pencil size={12} /> {" "}{_ui("Modifier")}{" "}</Button>
                  </TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>

      {inviteOpen && (
        <Modal title={_ui("INVITER UN UTILISATEUR")} onClose={() => setInviteOpen(false)} size="md">
          <div className="space-y-md">
            <div className="rounded-md bg-surface-sunk border border-border p-md text-caption text-fg-tertiary">
              {" "}{_ui("L'utilisateur sera créé avec email confirmé. Communique-lui son mot de passe par un canal sécurisé.")}{" "}</div>
            <FormRow>
              <FormGroup label={_ui("Email *")}><TInput type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder={_ui("user@domaine.com")} /></FormGroup>
              <FormGroup label={_ui("Nom complet")}><TInput value={invite.full_name} onChange={(e) => setInvite({ ...invite, full_name: e.target.value })} placeholder={_ui("Prénom Nom")} /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label={_ui("Mot de passe * (min 8 car.)")}><TInput type="password" value={invite.password} onChange={(e) => setInvite({ ...invite, password: e.target.value })} placeholder="••••••••" /></FormGroup>
              <FormGroup label={_ui("Rôle")}>
                <TSelect value={invite.role_id} onChange={(e) => setInvite({ ...invite, role_id: e.target.value })}>
                  <option value="">{_ui("— Plus tard —")}</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </TSelect>
              </FormGroup>
            </FormRow>
            <FormGroup label={_ui("Clients / Sociétés autorisés *")}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-xs rounded-md border border-border p-sm">
                {manageableDomains.map(company => (
                  <label key={company.id} className="flex items-center gap-sm p-xs text-body-sm cursor-pointer">
                    <input type="checkbox" checked={inviteDomains.includes(company.id)} disabled={manageableDomains.length === 1}
                      onChange={e => setInviteDomains(current => e.target.checked ? [...current, company.id] : current.filter(id => id !== company.id))} />
                    <span>{company.name}<span className="block font-mono text-[10px] text-fg-tertiary">{company.code}</span></span>
                  </label>
                ))}
              </div>
              {manageableDomains.length === 1 && <div className="mt-1 text-caption text-fg-tertiary">{_ui("Société imposée automatiquement : vous n’en administrez qu’une.")}</div>}
            </FormGroup>
            <ModalFooter onCancel={() => setInviteOpen(false)} onSave={submitInvite} loading={inviting} disabled={!invite.email || !invite.password || invite.password.length < 8 || !invite.role_id || inviteDomains.length === 0} saveLabel={_ui("CRÉER L'UTILISATEUR")} />
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={_ui("MODIFIER — {v0}",{v0:String(editing.full_name ?? editing.email)})} onClose={() => setEditing(null)} size="md">
          <div className="space-y-md">
            <FormRow>
              <FormGroup label={_ui("Nom complet")}>
                <TInput value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
              </FormGroup>
              <FormGroup label={_ui("Téléphone")}>
                <TInput value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              </FormGroup>
            </FormRow>
            <FormGroup label={_ui("Email")}>
              <div>
                <TInput value={editing.email} disabled />
                <Button type="button" variant="secondary" size="sm" loading={sendingReset} onClick={sendPasswordReset} className="mt-sm">
                  <KeyRound size={13} /> {" "}{_ui("Envoyer un lien de réinitialisation")}{" "}</Button>
                <Button type="button" variant="secondary" size="sm" onClick={openTemporaryReset} className="mt-sm ml-xs" disabled={editing.id === user?.id}>
                  <RefreshCw size={13} /> {" "}{_ui("Définir un mot de passe temporaire")}{" "}</Button>
              </div>
            </FormGroup>
            <FormRow>
              <FormGroup label={isPlatformAdmin ? _ui("Rôle global") : _ui("Rôle global (lecture seule)")}>
                <TSelect value={editForm.role_id} onChange={(e) => setEditForm({ ...editForm, role_id: e.target.value })} disabled={!isPlatformAdmin}>
                  <option value="">{_ui("— Aucun —")}</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}{r.is_admin ? _ui("(admin)") : ''}</option>)}
                </TSelect>
              </FormGroup>
              <FormGroup label={_ui("Statut du compte")}>
                <TSelect value={editForm.is_active ? 'active' : 'inactive'} onChange={(e) => setEditForm({ ...editForm, is_active: e.target.value === 'active' })}>
                  <option value="active">{_ui("Actif")}</option>
                  <option value="inactive">{_ui("Désactivé")}</option>
                </TSelect>
              </FormGroup>
            </FormRow>
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
                    <ShieldCheck size={14} className="text-purple-500" /> {" "}{_ui("Super-administrateur plateforme")}{" "}</span>
                  <span className="block mt-1 text-caption text-fg-tertiary">
                    {" "}{_ui("Accès global à tous les clients / sociétés. Seul un super-administrateur peut modifier ce statut.")}{" "}</span>
                </span>
              </label>
            </div>
            {(isPlatformAdmin || activeDomain) && (
              <div className="rounded-md border border-border p-md space-y-sm">
                <div className="font-semibold text-body-sm text-fg-primary">{_ui("Affectation aux clients / sociétés")}</div>
                <div className="text-caption text-fg-tertiary">{isPlatformAdmin ? _ui("Sélectionne une ou plusieurs sociétés et le rôle appliqué dans chacune.") : _ui("Tu peux administrer uniquement {v0}.",{v0:String(manageableDomains.length > 1 ? 'les sociétés où tu es administrateur' : 'la société actuellement sélectionnée')})}</div>
                {manageableDomains.map(domain => {
                  const membership = editMemberships.find(item => item.domain_id === domain.id)
                  return (
                    <div key={domain.id} className="grid grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_auto] items-center gap-sm rounded-md border border-border bg-surface-sunk px-sm py-sm">
                      <label className="flex items-center gap-sm text-body-sm font-medium cursor-pointer">
                        <input type="checkbox" checked={Boolean(membership)} onChange={e => toggleDomain(domain.id, e.target.checked)} />
                        <span>{domain.name}<span className="block font-mono text-[10px] text-fg-tertiary">{domain.code}</span></span>
                      </label>
                      <TSelect value={membership?.role_id ?? ''} onChange={e => updateMembership(domain.id, { role_id: e.target.value })} disabled={!membership}>
                        <option value="">{_ui("— Rôle —")}</option>
                        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </TSelect>
                      {isPlatformAdmin ? <label className="flex items-center gap-xs text-caption text-fg-secondary">
                        <input type="radio" name="default-domain" checked={Boolean(membership?.is_default)} disabled={!membership} onChange={() => updateMembership(domain.id, { is_default: true })} /> {" "}{_ui("Défaut")}{" "}</label> : <Badge variant={membership?.is_active ? 'success' : 'default'} size="sm">{membership ? _ui("Actif") : _ui("Non affecté")}</Badge>}
                    </div>
                  )
                })}
                {isPlatformAdmin && !editForm.is_platform_admin && editForm.is_active && editMemberships.length === 0 && (
                  <div className="text-caption text-danger">{_ui("Un utilisateur actif doit avoir au moins une société.")}</div>
                )}
              </div>
            )}
            {orgFunctions.length > 0 && orgDomainId && (
              <div className="rounded-md border border-border p-md space-y-md">
                <div className="flex items-start justify-between gap-md">
                  <div>
                    <div className="flex items-center gap-xs font-semibold text-body-sm text-fg-primary"><Briefcase size={14} /> {" "}{_ui("Fonctions et habilitations métier")}</div>
                    <div className="mt-1 text-caption text-fg-tertiary">{_ui("Les fonctions peuvent être cumulées. Une habilitation individuelle peut compléter ou retirer un droit hérité.")}</div>
                  </div>
                  <Button type="button" size="sm" variant="secondary" loading={orgSaving} disabled={orgLoading} onClick={saveOrganization}>{_ui("Enregistrer cette société")}</Button>
                </div>
                <Field label={_ui("Société à paramétrer")}>
                  <TSelect value={orgDomainId} onChange={e => setOrgDomainId(e.target.value)}>
                    {(memberships[editing.id] ?? []).filter(item => item.is_active && manageableDomains.some(domain => domain.id === item.domain_id)).map(item => {
                      const domain = domains.find(value => value.id === item.domain_id)
                      return domain ? <option key={domain.id} value={domain.id}>{domain.name}</option> : null
                    })}
                  </TSelect>
                </Field>
                {orgLoading ? <Skeleton className="h-32" /> : <>
                  <div>
                    <div className="font-mono text-caption uppercase text-fg-tertiary mb-xs">{_ui("Fonctions exercées")}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-xs">
                      {orgFunctions.map(fn => <label key={fn.id} className="flex items-start gap-sm rounded-md border border-border bg-surface-sunk p-sm cursor-pointer">
                        <input type="checkbox" className="mt-1" checked={selectedFunctions.includes(fn.id)} onChange={e => setSelectedFunctions(current => e.target.checked ? [...current,fn.id] : current.filter(id => id !== fn.id))} />
                        <span><span className="block text-body-sm font-semibold">{fn.name}</span>{fn.description && <span className="block text-caption text-fg-tertiary">{_uiNode(fn.description)}</span>}</span>
                      </label>)}
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-caption uppercase text-fg-tertiary mb-xs">{_ui("Habilitations effectives et exceptions")}</div>
                    <div className="space-y-xs">
                      {orgCapabilities.map(capability => {
                        const override = capabilityOverrides[capability.id] ?? 'inherit'
                        const inherited = inheritedCapabilities.has(capability.id)
                        const effective = override === 'grant' || (override === 'inherit' && inherited)
                        return <div key={capability.id} className="grid grid-cols-[1fr_150px] items-center gap-sm rounded-md border border-border px-sm py-xs">
                          <div><span className="text-body-sm">{capability.name}</span><Badge size="xs" variant={effective ? 'success' : 'default'} className="ml-xs">{effective ? _ui("Autorisée") : _ui("Non autorisée")}</Badge>{capability.is_sensitive && <Badge size="xs" variant="warning" className="ml-xs">{_ui("Sensible")}</Badge>}</div>
                          <TSelect value={override} onChange={e => setCapabilityOverrides(current => ({...current,[capability.id]:e.target.value as any}))} className="h-7 text-caption">
                            <option value="inherit">{_ui("Héritée des fonctions")}</option><option value="grant">{_ui("Accorder")}</option><option value="deny">{_ui("Retirer")}</option>
                          </TSelect>
                        </div>
                      })}
                    </div>
                  </div>
                </>}
              </div>
            )}
            <ModalFooter
              onCancel={() => setEditing(null)} onSave={submitEdit} loading={savingEdit}
              disabled={isPlatformAdmin && ((!editForm.is_platform_admin && editForm.is_active && editMemberships.length === 0) || editMemberships.some(item => !item.role_id))}
              saveLabel={_ui("ENREGISTRER")}
            />
          </div>
        </Modal>
      )}
      {temporaryResetOpen && editing && (
        <Modal title={_ui("MOT DE PASSE TEMPORAIRE — {v0}",{v0:String(editing.full_name ?? editing.email)})} onClose={() => setTemporaryResetOpen(false)} size="sm">
          <div className="space-y-md">
            <div className="rounded-md border border-warning/30 bg-warning/10 p-md text-body-sm text-warning">
              {" "}{_ui("Ce mot de passe ne sera pas conservé dans ItriX Farm. Après son application, l’utilisateur devra le remplacer dès sa prochaine connexion.")}{" "}</div>
            <FormGroup label={_ui("Mot de passe temporaire (min. 8 caractères)")}>
              <div className="flex gap-xs">
                <TInput type="text" value={temporaryPassword} onChange={e => { setTemporaryPassword(e.target.value); setTemporaryPasswordApplied(false) }} />
                <Button type="button" variant="secondary" size="sm" onClick={generateTemporaryPassword}><RefreshCw size={13}/> {" "}{_ui("Générer")}</Button>
              </div>
            </FormGroup>
            {temporaryPasswordApplied && <div className="rounded-md border border-success/30 bg-success/10 p-md text-body-sm text-success">{_ui("Le mot de passe temporaire est actif et le changement obligatoire est programmé.")}</div>}
            <div className="flex flex-wrap justify-end gap-xs border-t border-border pt-md">
              <Button type="button" variant="ghost" onClick={() => setTemporaryResetOpen(false)}>{_ui("FERMER")}</Button>
              <Button type="button" variant="secondary" onClick={prepareTemporaryPasswordEmail} disabled={!temporaryPasswordApplied}><Mail size={13}/> {" "}{_ui("PRÉPARER L’E-MAIL")}</Button>
              <Button type="button" loading={applyingTemporaryPassword} onClick={applyTemporaryPassword} disabled={temporaryPassword.length < 8 || temporaryPasswordApplied}><KeyRound size={13}/> {" "}{_ui("APPLIQUER")}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
