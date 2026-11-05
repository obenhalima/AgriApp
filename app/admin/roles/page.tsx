'use client'

import { FilterableTable } from '@/components/ui/FilterableTable'
import {useLanguage} from '@/lib/i18n'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ShieldCheck, Plus, Trash2, Lock, CheckCircle2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Textarea, Field } from '@/components/ui/Input'
import { Modal, FormRow, FormGroup, ModalFooter } from '@/components/ui/Modal'
import { useAuth, Role, PermissionAction } from '@/lib/auth'
import {
  Module, Permission, listRoles, createRole, deleteRole,
  listModulesAndPermissions, listRolePermissions, saveRolePermissions,
} from '@/lib/adminRoles'
import { cn } from '@/lib/cn'
import {ProfileMenuEditor} from '@/components/ProfileMenuEditor'

const ACTIONS: { code: PermissionAction; label: string; color: string }[] = [
  { code: 'view', label: 'Voir', color: '#64748b' },
  { code: 'create', label: 'Créer', color: '#10b981' },
  { code: 'edit', label: 'Modifier', color: '#f59e0b' },
  { code: 'delete', label: 'Supprimer', color: '#ef4444' },
  { code: 'admin', label: 'Admin', color: '#a855f7' },
]

export default function RolesAdminPage() {
 const {t:_ui,text:_uiNode}=useLanguage()

  const { isAdmin,activeDomain } = useAuth()
  const [roles, setRoles] = useState<Role[]>([])
  const [modules, setModules] = useState<Module[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState<string>('')
  const [grantedCodes, setGrantedCodes] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [savingMatrix, setSavingMatrix] = useState(false)
  const [matrixDirty, setMatrixDirty] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [roleForm, setRoleForm] = useState({ code: '', name: '', description: '' })

  const load = async () => {
    try {
      setLoading(true)
      const [r, mp] = await Promise.all([listRoles(), listModulesAndPermissions()])
      setRoles(r); setModules(mp.modules); setPermissions(mp.permissions)
      if (!selectedRoleId && r.length > 0) setSelectedRoleId(r.find(x => !x.is_admin)?.id ?? r[0].id)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!selectedRoleId) return
    (async () => { setGrantedCodes(await listRolePermissions(selectedRoleId)); setMatrixDirty(false) })()
  }, [selectedRoleId])

  const selectedRole = useMemo(() => roles.find(r => r.id === selectedRoleId), [roles, selectedRoleId])

  const togglePerm = (moduleCode: string, action: PermissionAction) => {
    const code = `${moduleCode}.${action}`
    setGrantedCodes(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code); else next.add(code)
      return next
    })
    setMatrixDirty(true)
  }

  const toggleModuleRow = (moduleCode: string, enable: boolean) => {
    setGrantedCodes(prev => {
      const next = new Set(prev)
      for (const a of ACTIONS) {
        const code = `${moduleCode}.${a.code}`
        if (enable) next.add(code); else next.delete(code)
      }
      return next
    })
    setMatrixDirty(true)
  }

  const toggleActionColumn = (action: PermissionAction, enable: boolean) => {
    setGrantedCodes(prev => {
      const next = new Set(prev)
      for (const m of modules) {
        const code = `${m.code}.${action}`
        if (enable) next.add(code); else next.delete(code)
      }
      return next
    })
    setMatrixDirty(true)
  }

  const saveMatrix = async () => {
    if (!selectedRoleId) return
    setSavingMatrix(true)
    try {
      await saveRolePermissions(selectedRoleId, grantedCodes)
      setMatrixDirty(false)
      toast.success(_ui("Permissions enregistrées"))
    } catch (e: any) { toast.error(e.message) }
    finally { setSavingMatrix(false) }
  }

  const submitCreateRole = async () => {
    if (!roleForm.code || !roleForm.name) return
    try {
      const r = await createRole(roleForm)
      setRoles(prev => [...prev, r])
      setSelectedRoleId(r.id)
      setCreateOpen(false)
      setRoleForm({ code: '', name: '', description: '' })
      toast.success(_ui("Rôle \"{v0}\" créé",{v0:String(r.name)}))
    } catch (e: any) { toast.error(e.message) }
  }

  const onDeleteRole = async () => {
    if (!selectedRole) return
    if (!confirm(_ui("Supprimer le rôle \"{v0}\" ?",{v0:String(selectedRole.name)}))) return
    try {
      await deleteRole(selectedRole.id)
      const remaining = roles.filter(r => r.id !== selectedRole.id)
      setRoles(remaining); setSelectedRoleId(remaining[0]?.id ?? '')
      toast.success(_ui("Rôle supprimé"))
    } catch (e: any) { toast.error(e.message) }
  }

  const modulesBySection = useMemo(() => {
    const out: Record<string, Module[]> = {}
    for (const m of modules) { const s = m.section ?? 'AUTRES'; out[s] ??= []; out[s].push(m) }
    return out
  }, [modules])

  if (!isAdmin) return <EmptyState icon={Lock} title={_ui("Accès réservé aux administrateurs")} />

  return (
    <div>
      <PageHeader
        title={_ui("Rôles & Permissions")} subtitle={_ui("Administration")} icon={ShieldCheck} iconColor="#ef4444"
        description={_ui("{v0} rôle{v1} · Matrice module × action",{v0:String(roles.length),v1:String(roles.length > 1 ? 's' : '')})}
        actions={<Button onClick={() => setCreateOpen(true)} variant="primary"><Plus size={14} strokeWidth={2.5} /> {" "}{_ui("Nouveau rôle")}</Button>}
      />

      {loading ? (
        <div className="space-y-md"><Skeleton className="h-96" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-md">
          {/* Liste rôles */}
          <Card animate padding="md" className="self-start">
            <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary mb-sm">{_ui("Rôles")}</div>
            <div className="flex flex-col gap-1">
              {roles.map(r => (
                <button key={r.id} onClick={() => setSelectedRoleId(r.id)}
                  className={cn(
                    'text-left p-sm rounded-md transition-colors',
                    selectedRoleId === r.id ? 'bg-surface-sunk border border-brand/40' : 'border border-transparent hover:bg-surface-hover'
                  )}>
                  <div className="font-display text-body-sm font-semibold text-fg-primary flex items-center gap-2">
                    {r.name}
                    {r.is_admin && <Badge variant="danger" size="xs">{_ui("ADMIN")}</Badge>}
                    {r.is_system && <Badge variant="default" size="xs">{_ui("système")}</Badge>}
                  </div>
                  {r.description && <div className="text-caption text-fg-tertiary mt-1 leading-snug">{_uiNode(r.description)}</div>}
                </button>
              ))}
            </div>
          </Card>

          {/* Matrice */}
          <Card animate delay={0.1}>
            {selectedRole ? (
              <>
                <div className="flex items-center gap-md flex-wrap mb-md">
                  <div>
                    <div className="font-display text-heading font-bold text-fg-primary">{selectedRole.name}</div>
                    <div className="font-mono text-caption text-fg-tertiary">{_ui("code:")}{" "}{selectedRole.code}</div>
                  </div>
                  <div className="flex-1" />
                  {selectedRole.is_admin && <Badge variant="danger" size="sm">{_ui("Bypass toutes les permissions")}</Badge>}
                  {!selectedRole.is_system && <Button onClick={onDeleteRole} variant="ghost" size="sm" className="hover:text-danger"><Trash2 size={11} /> {" "}{_ui("Supprimer")}</Button>}
                  {matrixDirty && !selectedRole.is_admin && (
                    <Button onClick={saveMatrix} loading={savingMatrix} variant="primary" size="sm">
                      <CheckCircle2 size={12} /> {" "}{_ui("Enregistrer")}{" "}</Button>
                  )}
                </div>

                {activeDomain&&<ProfileMenuEditor key={`${activeDomain.domain_id}:${selectedRole.id}`} roleId={selectedRole.id} admin={selectedRole.is_admin} permissions={grantedCodes}/>}
                {selectedRole.is_admin ? (
                  <div className="text-center py-xl text-body-sm text-fg-tertiary">
                    {" "}{_ui("Le rôle")}{" "}<strong className="text-fg-primary">{selectedRole.name}</strong> {" "}{_ui("a accès complet à toute l'application.")}{" "}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <FilterableTable className="w-full text-body-sm" style={{ minWidth: 800 }}>
                      <thead>
                        <tr className="border-b border-border bg-surface-sunk">
                          <th className="text-left py-2 px-3 font-mono text-[10px] uppercase tracking-wider text-fg-tertiary min-w-[180px]">{_ui("Module")}</th>
                          {ACTIONS.map(a => (
                            <th key={a.code} className="text-center py-2 px-3 font-mono text-[10px] uppercase tracking-wider min-w-[80px]" style={{ color: a.color }}>
                              <button onClick={() => {
                                const allSet = modules.every(m => grantedCodes.has(`${m.code}.${a.code}`))
                                toggleActionColumn(a.code, !allSet)
                              }} className="hover:underline">{_uiNode(a.label)}</button>
                            </th>
                          ))}
                          <th className="text-center py-2 px-3 font-mono text-[10px] uppercase tracking-wider text-fg-tertiary min-w-[60px]">{_ui("Tout")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(modulesBySection).map(([section, mods]) => (
                          <>
                            <tr key={`s-${section}`} className="bg-surface-sunk">
                              <td colSpan={ACTIONS.length + 2} className="py-2 px-3 font-mono text-[10px] uppercase tracking-wider text-fg-tertiary font-bold">{section}</td>
                            </tr>
                            {mods.map(m => {
                              const allChecked = ACTIONS.every(a => grantedCodes.has(`${m.code}.${a.code}`))
                              const anyChecked = ACTIONS.some(a => grantedCodes.has(`${m.code}.${a.code}`))
                              return (
                                <tr key={m.id} className="border-b border-border last:border-b-0 hover:bg-surface-hover transition-colors">
                                  <td className="py-2 px-3">
                                    <span className="mr-2">{m.icon}</span>
                                    <strong className="text-fg-primary">{_uiNode(m.label)}</strong>
                                  </td>
                                  {ACTIONS.map(a => {
                                    const code = `${m.code}.${a.code}`
                                    return (
                                      <td key={a.code} className="text-center py-2 px-3">
                                        <input type="checkbox" checked={grantedCodes.has(code)}
                                          onChange={() => togglePerm(m.code, a.code)}
                                          style={{ cursor: 'pointer', accentColor: a.color }} />
                                      </td>
                                    )
                                  })}
                                  <td className="text-center py-2 px-3">
                                    <input type="checkbox" checked={allChecked}
                                      ref={el => { if (el) el.indeterminate = anyChecked && !allChecked }}
                                      onChange={(e) => toggleModuleRow(m.code, e.target.checked)} />
                                  </td>
                                </tr>
                              )
                            })}
                          </>
                        ))}
                      </tbody>
                    </FilterableTable>
                  </div>
                )}
              </>
            ) : (
              <EmptyState icon={ShieldCheck} title={_ui("Sélectionne un rôle")} description={_ui("Pour voir et modifier ses permissions.")} />
            )}
          </Card>
        </div>
      )}

      {createOpen && (
        <Modal title={_ui("NOUVEAU RÔLE")} onClose={() => setCreateOpen(false)} size="md">
          <div className="space-y-md">
            <FormRow>
              <FormGroup label={_ui("Code *")}><TInput value={roleForm.code} onChange={(e) => setRoleForm({ ...roleForm, code: e.target.value })} placeholder={_ui("responsable_production")} autoFocus /></FormGroup>
              <FormGroup label={_ui("Nom *")}><TInput value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} placeholder={_ui("Responsable Production")} /></FormGroup>
            </FormRow>
            <Field label={_ui("Description")}><Textarea rows={2} value={roleForm.description} onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} /></Field>
            <ModalFooter onCancel={() => setCreateOpen(false)} onSave={submitCreateRole} disabled={!roleForm.code || !roleForm.name} saveLabel={_ui("CRÉER LE RÔLE")} />
          </div>
        </Modal>
      )}
    </div>
  )
}
