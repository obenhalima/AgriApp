'use client'
import { useEffect, useMemo, useState } from 'react'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter } from '@/components/ui/Modal'
import { useAuth, Role, PermissionAction } from '@/lib/auth'
import {
  Module, Permission,
  listRoles, createRole, updateRole, deleteRole,
  listModulesAndPermissions, listRolePermissions, saveRolePermissions,
} from '@/lib/adminRoles'

const ACTIONS: { code: PermissionAction; label: string; color: string }[] = [
  { code: 'view',   label: 'Voir',      color: 'var(--tx-2)' },
  { code: 'create', label: 'Créer',     color: 'var(--neon)' },
  { code: 'edit',   label: 'Modifier',  color: 'var(--amber)' },
  { code: 'delete', label: 'Supprimer', color: 'var(--red)' },
  { code: 'admin',  label: 'Admin',     color: 'var(--purple)' },
]

export default function RolesAdminPage() {
  const { isAdmin } = useAuth()
  const [roles, setRoles] = useState<Role[]>([])
  const [modules, setModules] = useState<Module[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState<string>('')
  const [grantedCodes, setGrantedCodes] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [savingMatrix, setSavingMatrix] = useState(false)
  const [matrixDirty, setMatrixDirty] = useState(false)

  // Création / édition
  const [createOpen, setCreateOpen] = useState(false)
  const [roleForm, setRoleForm] = useState({ code: '', name: '', description: '' })

  const load = async () => {
    try {
      setLoading(true)
      const [r, mp] = await Promise.all([listRoles(), listModulesAndPermissions()])
      setRoles(r)
      setModules(mp.modules)
      setPermissions(mp.permissions)
      if (!selectedRoleId && r.length > 0) setSelectedRoleId(r.find(x => !x.is_admin)?.id ?? r[0].id)
    } catch (e: any) { alert(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  // Charger les permissions du rôle sélectionné
  useEffect(() => {
    if (!selectedRoleId) return
    (async () => {
      const codes = await listRolePermissions(selectedRoleId)
      setGrantedCodes(codes)
      setMatrixDirty(false)
    })()
  }, [selectedRoleId])

  const selectedRole = useMemo(() => roles.find(r => r.id === selectedRoleId), [roles, selectedRoleId])
  const permByCode = useMemo(() => {
    const m = new Map<string, Permission>()
    permissions.forEach(p => m.set(p.code, p))
    return m
  }, [permissions])

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
      alert('Permissions enregistrées.')
    } catch (e: any) { alert('Erreur : ' + e.message) }
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
    } catch (e: any) { alert('Erreur : ' + e.message) }
  }

  const onDeleteRole = async () => {
    if (!selectedRole) return
    if (!confirm(`Supprimer le rôle "${selectedRole.name}" ? Les utilisateurs assignés à ce rôle perdront leur accès.`)) return
    try {
      await deleteRole(selectedRole.id)
      const remaining = roles.filter(r => r.id !== selectedRole.id)
      setRoles(remaining)
      setSelectedRoleId(remaining[0]?.id ?? '')
    } catch (e: any) { alert(e.message) }
  }

  // Groupage des modules par section pour affichage compact
  const modulesBySection = useMemo(() => {
    const out: Record<string, Module[]> = {}
    for (const m of modules) {
      const s = m.section ?? 'AUTRES'
      out[s] ??= []
      out[s].push(m)
    }
    return out
  }, [modules])

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
          <div className="page-title">RÔLES & PERMISSIONS</div>
          <div className="page-sub">{roles.length} rôle(s) · Matrice module × action</div>
        </div>
        <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ NOUVEAU RÔLE</button>
      </div>

      {loading ? (
        <div style={{ padding: 40, color: 'var(--tx-3)', textAlign: 'center' }}>CHARGEMENT...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 14 }}>
          {/* Liste rôles */}
          <div className="card" style={{ padding: 10, alignSelf: 'start' }}>
            <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', marginBottom: 8, letterSpacing: 1 }}>RÔLES</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {roles.map(r => (
                <button key={r.id} onClick={() => setSelectedRoleId(r.id)}
                  style={{
                    textAlign: 'left', padding: '8px 10px',
                    background: selectedRoleId === r.id ? 'var(--bg-deep)' : 'transparent',
                    border: `1px solid ${selectedRoleId === r.id ? 'color-mix(in srgb, var(--neon) 40%, transparent)' : 'transparent'}`,
                    borderRadius: 6, cursor: 'pointer', color: 'var(--tx-1)',
                  }}>
                  <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {r.name}
                    {r.is_admin && <span style={{ fontSize: 9, color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>ADMIN</span>}
                    {r.is_system && <span style={{ fontSize: 9, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>système</span>}
                  </div>
                  {r.description && <div style={{ fontSize: 10, color: 'var(--tx-3)', marginTop: 3, lineHeight: 1.4 }}>{r.description}</div>}
                </button>
              ))}
            </div>
          </div>

          {/* Matrice permissions */}
          <div className="card" style={{ padding: 14 }}>
            {selectedRole ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-1)' }}>{selectedRole.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>code: {selectedRole.code}</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  {selectedRole.is_admin && (
                    <span className="tag" style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', fontSize: 10 }}>
                      Ce rôle bypass toutes les permissions
                    </span>
                  )}
                  {!selectedRole.is_system && (
                    <button onClick={onDeleteRole}
                      style={{ padding: '5px 10px', background: 'transparent', border: '1px solid var(--bd-1)', color: 'var(--red)', borderRadius: 5, fontSize: 11, cursor: 'pointer' }}>
                      🗑 Supprimer
                    </button>
                  )}
                  {matrixDirty && !selectedRole.is_admin && (
                    <button onClick={saveMatrix} disabled={savingMatrix}
                      className="btn-primary" style={{ fontSize: 11 }}>
                      {savingMatrix ? 'Enregistrement...' : '✓ Enregistrer les changements'}
                    </button>
                  )}
                </div>

                {selectedRole.is_admin ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--tx-3)', fontSize: 12 }}>
                    Le rôle <strong>{selectedRole.name}</strong> a accès complet à toute l'application. Aucune permission à paramétrer.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="tbl" style={{ minWidth: 800 }}>
                      <thead>
                        <tr>
                          <th style={{ minWidth: 180 }}>Module</th>
                          {ACTIONS.map(a => (
                            <th key={a.code} style={{ textAlign: 'center', color: a.color, minWidth: 80 }}>
                              <div style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  const allSet = modules.every(m => grantedCodes.has(`${m.code}.${a.code}`))
                                  toggleActionColumn(a.code, !allSet)
                                }}
                                title="Cliquer pour cocher/décocher toute la colonne">
                                {a.label}
                              </div>
                            </th>
                          ))}
                          <th style={{ minWidth: 60, textAlign: 'center' }}>Tout</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(modulesBySection).map(([section, mods]) => (
                          <>
                            <tr key={`s-${section}`} style={{ background: 'var(--bg-deep)' }}>
                              <td colSpan={ACTIONS.length + 2} style={{ fontSize: 10, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: 1, fontWeight: 700 }}>
                                {section}
                              </td>
                            </tr>
                            {mods.map(m => {
                              const allChecked = ACTIONS.every(a => grantedCodes.has(`${m.code}.${a.code}`))
                              const anyChecked = ACTIONS.some(a => grantedCodes.has(`${m.code}.${a.code}`))
                              return (
                                <tr key={m.id}>
                                  <td>
                                    <span style={{ marginRight: 6 }}>{m.icon}</span>
                                    <strong>{m.label}</strong>
                                  </td>
                                  {ACTIONS.map(a => {
                                    const code = `${m.code}.${a.code}`
                                    const checked = grantedCodes.has(code)
                                    return (
                                      <td key={a.code} style={{ textAlign: 'center' }}>
                                        <input type="checkbox" checked={checked}
                                          onChange={() => togglePerm(m.code, a.code)}
                                          style={{ cursor: 'pointer', accentColor: a.color }} />
                                      </td>
                                    )
                                  })}
                                  <td style={{ textAlign: 'center' }}>
                                    <input type="checkbox"
                                      checked={allChecked}
                                      ref={el => { if (el) el.indeterminate = anyChecked && !allChecked }}
                                      onChange={e => toggleModuleRow(m.code, e.target.checked)} />
                                  </td>
                                </tr>
                              )
                            })}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: 30, color: 'var(--tx-3)', textAlign: 'center' }}>
                Sélectionne un rôle pour voir/modifier ses permissions.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal création rôle */}
      {createOpen && (
        <Modal title="NOUVEAU RÔLE" onClose={() => setCreateOpen(false)} size="md">
          <FormRow>
            <FormGroup label="Code *">
              <Input value={roleForm.code} onChange={e => setRoleForm({ ...roleForm, code: e.target.value })} placeholder="responsable_production" />
            </FormGroup>
            <FormGroup label="Nom *">
              <Input value={roleForm.name} onChange={e => setRoleForm({ ...roleForm, name: e.target.value })} placeholder="Responsable Production" />
            </FormGroup>
          </FormRow>
          <FormGroup label="Description">
            <Textarea rows={2} value={roleForm.description} onChange={e => setRoleForm({ ...roleForm, description: e.target.value })} />
          </FormGroup>
          <ModalFooter onCancel={() => setCreateOpen(false)} onSave={submitCreateRole} disabled={!roleForm.code || !roleForm.name} saveLabel="CRÉER LE RÔLE" />
        </Modal>
      )}
    </div>
  )
}
