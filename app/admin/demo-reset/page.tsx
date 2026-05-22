'use client'
/**
 * /admin/demo-reset
 *
 * Panneau admin pour les démos et le reset des données.
 *   1. Démarrer une nouvelle campagne (formulaire minimal)
 *   2. Supprimer une campagne existante (+ toutes ses données liées)
 *   3. Reset des données opérationnelles (wipe transactions, garde master data)
 *   4. ☢️ NUCLEAR — wipe TOUT (sauf auth, rôles, et chatbot users)
 *
 * Protections :
 *   - Réservé aux admins (RLS + isAdmin check côté UI)
 *   - Confirmation multi-étapes pour les actions destructives
 *   - Pour le nuclear : taper "SUPPRIMER TOUT" pour confirmer
 *   - Toast de succès/erreur sur chaque action
 */
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  RotateCcw, Trash2, AlertTriangle, Plus, Calendar, Sprout, AlertOctagon,
  ShieldAlert, Database, Skull, CheckCircle2, Loader2, Info,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { Input as TInput, Select as TSelect, Field } from '@/components/ui/Input'
import { Modal, ModalFooter } from '@/components/ui/Modal'

type Campaign = {
  id: string; code: string; name: string; status: string | null
  farm_id: string | null; preparation_start: string | null; campaign_end: string | null
  budget_total: number | null; production_target_kg: number | null
  farms?: { name: string | null } | null
}
type Farm = { id: string; code: string | null; name: string }

// Tables opérationnelles (transactions) → wipe au reset
const OPERATIONAL_TABLES = [
  'chatbot_messages',
  'harvest_lot_sources',
  'harvest_lots',
  'harvests',
  'production_forecasts',
  'station_prices',
  'recoltes_marche_daily',
  'payments_received',
  'invoices',
  'delivery_notes',
  'sales_order_lines',
  'sales_orders',
  'payments_made',
  'supplier_invoices',
  'purchase_order_lines',
  'purchase_orders',
  'cost_entries',
  'stock_movements',
  'cultural_operations',
  'labor_entries',
  'alerts',
  'budget_lines',
  'amortissements',
  'campaign_plantings',
  'campaigns',
  'market_prices',
]

// Tables seed/master → JAMAIS supprimées (sauf nuclear)
const MASTER_TABLES = [
  'users', 'farms', 'farm_zones', 'greenhouses', 'varieties', 'seed_suppliers',
  'markets', 'clients', 'suppliers', 'workers', 'teams', 'stock_items',
  'account_categories', 'assets', 'chatbot_users', 'roles', 'user_permissions',
]

export default function DemoResetPage() {
  const { isAdmin } = useAuth()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [farms, setFarms] = useState<Farm[]>([])
  const [loading, setLoading] = useState(true)

  // Modals
  const [newCampaignOpen, setNewCampaignOpen] = useState(false)
  const [deleteCampaignId, setDeleteCampaignId] = useState<string | null>(null)
  const [resetOpsOpen, setResetOpsOpen] = useState(false)
  const [nuclearOpen, setNuclearOpen] = useState(false)

  // Confirmation strings
  const [confirmDelete, setConfirmDelete] = useState('')
  const [confirmReset, setConfirmReset] = useState('')
  const [confirmNuclear, setConfirmNuclear] = useState('')

  // Nouvelle campagne form
  const [newCamp, setNewCamp] = useState({
    code: '', name: '', farm_id: '', preparation_start: '', campaign_end: '',
    production_target_kg: '', budget_total: '',
  })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [c, f] = await Promise.all([
        supabase.from('campaigns')
          .select('id, code, name, status, farm_id, preparation_start, campaign_end, budget_total, production_target_kg, farms(name)')
          .order('preparation_start', { ascending: false, nullsFirst: false }),
        supabase.from('farms').select('id, code, name').order('name'),
      ])
      if (c.error) throw c.error
      setCampaigns((c.data ?? []) as any)
      setFarms((f.data ?? []) as any)
    } catch (e: any) { toast.error(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const campaignToDelete = useMemo(
    () => campaigns.find(c => c.id === deleteCampaignId) ?? null,
    [campaigns, deleteCampaignId]
  )

  // ─── Action 1 : Créer une nouvelle campagne ────────────────────────────
  const createCampaign = async () => {
    if (!newCamp.code.trim() || !newCamp.name.trim() || !newCamp.farm_id) {
      toast.error('Code, nom et ferme requis'); return
    }
    setSaving(true)
    try {
      const payload: any = {
        code: newCamp.code.trim(),
        name: newCamp.name.trim(),
        farm_id: newCamp.farm_id,
        status: 'planification',
        preparation_start: newCamp.preparation_start || null,
        campaign_end: newCamp.campaign_end || null,
        production_target_kg: newCamp.production_target_kg ? Number(newCamp.production_target_kg) : null,
        budget_total: newCamp.budget_total ? Number(newCamp.budget_total) : null,
      }
      const { error } = await supabase.from('campaigns').insert(payload)
      if (error) throw error
      toast.success(`Campagne "${newCamp.name}" créée`)
      setNewCampaignOpen(false)
      setNewCamp({ code: '', name: '', farm_id: '', preparation_start: '', campaign_end: '', production_target_kg: '', budget_total: '' })
      load()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  // ─── Action 2 : Supprimer une campagne (cascade) ───────────────────────
  const deleteCampaign = async () => {
    if (!campaignToDelete) return
    if (confirmDelete !== campaignToDelete.code) {
      toast.error(`Tape "${campaignToDelete.code}" pour confirmer`); return
    }
    setSaving(true)
    try {
      // Tables qui référencent la campagne sans CASCADE → wipe manuel
      const tablesByCampaign = [
        'amortissements', 'recoltes_marche_daily', 'cost_entries',
        'supplier_invoices', 'purchase_orders', 'sales_orders',
        'cultural_operations', 'labor_entries',
      ]

      // Tables qui référencent les harvests/plantings (cascade via plantings)
      // → on doit récupérer les IDs et wipe avant
      const { data: plantings } = await supabase.from('campaign_plantings')
        .select('id').eq('campaign_id', campaignToDelete.id)
      const plantingIds = (plantings ?? []).map((p: any) => p.id)

      if (plantingIds.length > 0) {
        // Récupère les harvests pour wiper les harvest_lot_sources / harvest_lots
        const { data: hs } = await supabase.from('harvests')
          .select('id').in('campaign_planting_id', plantingIds)
        const harvestIds = (hs ?? []).map((h: any) => h.id)
        if (harvestIds.length > 0) {
          await supabase.from('harvest_lot_sources').delete().in('harvest_id', harvestIds)
          await supabase.from('harvest_lots').delete().in('harvest_id', harvestIds)
        }
        await supabase.from('harvests').delete().in('campaign_planting_id', plantingIds)
        await supabase.from('production_forecasts').delete().in('campaign_planting_id', plantingIds)
      }

      // Wipe tables qui pointent vers la campagne
      for (const table of tablesByCampaign) {
        const { error } = await supabase.from(table).delete().eq('campaign_id', campaignToDelete.id)
        if (error) console.warn(`[wipe ${table}]`, error.message)
      }

      // Enfin, la campagne (cascade auto : campaign_plantings + budget_lines)
      const { error } = await supabase.from('campaigns').delete().eq('id', campaignToDelete.id)
      if (error) throw error

      toast.success(`Campagne "${campaignToDelete.name}" supprimée + toutes ses données liées`)
      setDeleteCampaignId(null)
      setConfirmDelete('')
      load()
    } catch (e: any) { toast.error('Erreur: ' + e.message) }
    setSaving(false)
  }

  // ─── Action 3 : Reset données opérationnelles (garde master data) ──────
  const resetOperational = async () => {
    if (confirmReset !== 'RESET') {
      toast.error('Tape "RESET" pour confirmer'); return
    }
    setSaving(true)
    try {
      let totalDeleted = 0
      for (const table of OPERATIONAL_TABLES) {
        try {
          const { error, count } = await supabase.from(table)
            .delete({ count: 'exact' })
            .gte('created_at', '1900-01-01')  // condition truthy pour tout matcher
          if (error) {
            // Si pas de colonne created_at, essaie sans condition
            const { error: err2, count: cnt2 } = await supabase.from(table)
              .delete({ count: 'exact' })
              .not('id', 'is', null)
            if (err2) console.warn(`[wipe ${table}]`, err2.message)
            else totalDeleted += cnt2 ?? 0
          } else {
            totalDeleted += count ?? 0
          }
        } catch (e: any) {
          console.warn(`[wipe ${table}]`, e.message)
        }
      }
      toast.success(`Reset effectué — ${totalDeleted} ligne(s) supprimée(s)`)
      setResetOpsOpen(false)
      setConfirmReset('')
      load()
    } catch (e: any) { toast.error('Erreur: ' + e.message) }
    setSaving(false)
  }

  // ─── Action 4 : Nuclear (wipe TOUT sauf auth) ──────────────────────────
  const nuclearWipe = async () => {
    if (confirmNuclear !== 'SUPPRIMER TOUT') {
      toast.error('Tape exactement "SUPPRIMER TOUT" pour confirmer'); return
    }
    setSaving(true)
    try {
      // 1. Wipe operational
      for (const table of OPERATIONAL_TABLES) {
        try { await supabase.from(table).delete().not('id', 'is', null) }
        catch (e: any) { console.warn(`[nuke ${table}]`, e.message) }
      }
      // 2. Wipe master data sauf auth/roles
      const NUCLEAR_MASTER = [
        'workers', 'teams', 'stock_items', 'assets',
        'greenhouses', 'farm_zones', 'farms',
        'varieties', 'seed_suppliers',
        'markets', 'clients', 'suppliers',
        'chatbot_users',
      ]
      for (const table of NUCLEAR_MASTER) {
        try { await supabase.from(table).delete().not('id', 'is', null) }
        catch (e: any) { console.warn(`[nuke ${table}]`, e.message) }
      }
      toast.success('☢️ Nuclear wipe terminé — base réinitialisée (auth conservée)')
      setNuclearOpen(false)
      setConfirmNuclear('')
      load()
    } catch (e: any) { toast.error('Erreur: ' + e.message) }
    setSaving(false)
  }

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Démo / Reset" icon={ShieldAlert} iconColor="#ef4444" subtitle="Administration" />
        <Card>
          <div className="text-center py-12">
            <ShieldAlert size={48} className="mx-auto text-danger mb-md" />
            <div className="font-display text-heading font-bold text-fg-primary mb-sm">Accès refusé</div>
            <div className="text-body-sm text-fg-tertiary">Cette page est réservée aux administrateurs.</div>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Démo / Reset"
        subtitle="Administration"
        icon={Database}
        iconColor="#ef4444"
        description="Outils admin pour démarrer/supprimer des campagnes et reset les données. ⚠ Actions irréversibles."
        stats={[
          { label: 'Campagnes', value: String(campaigns.length), icon: Sprout, color: '#10b981' },
          { label: 'Fermes', value: String(farms.length), icon: Calendar, color: '#3b82f6' },
        ]}
      />

      {/* Bannière warning */}
      <Card variant="ghost" className="mb-lg border-warning/40 bg-warning/5">
        <div className="flex items-start gap-sm">
          <AlertTriangle size={20} className="text-warning flex-shrink-0 mt-0.5" />
          <div className="text-body-sm text-fg-secondary leading-relaxed">
            <strong className="text-fg-primary">Zone sensible.</strong> Les suppressions sont <strong>irréversibles</strong>. Les données auth/rôles ne sont jamais affectées.
            Pour un environnement de production, utilise plutôt les snapshots Supabase.
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        {/* ─── 1. Nouvelle campagne ─── */}
        <Card animate className="border-l-[3px] border-l-success">
          <div className="flex items-start gap-md">
            <div className="rounded-md flex items-center justify-center flex-shrink-0"
              style={{ width: 40, height: 40, background: 'color-mix(in srgb, #10b981 15%, transparent)', color: '#10b981' }}>
              <Plus size={20} strokeWidth={2.4} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-body font-bold text-fg-primary mb-1">Démarrer une nouvelle campagne</div>
              <div className="text-caption text-fg-tertiary leading-relaxed mb-md">
                Crée une campagne vierge en planification. Tu pourras ensuite y rattacher des plantations, budgets et données.
              </div>
              <Button onClick={() => setNewCampaignOpen(true)} variant="primary" size="sm">
                <Plus size={13} /> Nouvelle campagne
              </Button>
            </div>
          </div>
        </Card>

        {/* ─── 2. Supprimer une campagne ─── */}
        <Card animate className="border-l-[3px] border-l-warning">
          <div className="flex items-start gap-md">
            <div className="rounded-md flex items-center justify-center flex-shrink-0"
              style={{ width: 40, height: 40, background: 'color-mix(in srgb, #f59e0b 15%, transparent)', color: '#f59e0b' }}>
              <Trash2 size={20} strokeWidth={2.4} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-body font-bold text-fg-primary mb-1">Supprimer une campagne</div>
              <div className="text-caption text-fg-tertiary leading-relaxed mb-md">
                Efface une campagne et <strong className="text-warning">toutes ses données liées</strong> : plantations, récoltes, coûts, factures, dispatches…
              </div>
              {campaigns.length === 0 ? (
                <div className="text-caption text-fg-tertiary italic">Aucune campagne</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {campaigns.slice(0, 5).map(c => (
                    <button
                      key={c.id}
                      onClick={() => setDeleteCampaignId(c.id)}
                      className="flex items-center justify-between px-sm py-1.5 rounded-md border border-border bg-surface-sunk hover:border-warning hover:bg-warning/5 transition-all text-left group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-caption font-semibold text-fg-primary truncate">{c.name}</div>
                        <div className="text-[10px] text-fg-tertiary font-mono">{c.code} · {c.farms?.name ?? '?'}</div>
                      </div>
                      <Trash2 size={12} className="text-fg-tertiary group-hover:text-warning ml-2 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* ─── 3. Reset opérationnel ─── */}
        <Card animate className="border-l-[3px] border-l-danger">
          <div className="flex items-start gap-md">
            <div className="rounded-md flex items-center justify-center flex-shrink-0"
              style={{ width: 40, height: 40, background: 'color-mix(in srgb, #ef4444 15%, transparent)', color: '#ef4444' }}>
              <RotateCcw size={20} strokeWidth={2.4} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-body font-bold text-fg-primary mb-1">Reset données opérationnelles</div>
              <div className="text-caption text-fg-tertiary leading-relaxed mb-md">
                Vide <strong>toutes les transactions</strong> (récoltes, coûts, factures, dispatches, alertes, messages bot…) mais <strong className="text-success">garde le master data</strong> (fermes, serres, variétés, clients, employés, stock).
              </div>
              <Button onClick={() => setResetOpsOpen(true)} variant="destructive" size="sm">
                <RotateCcw size={13} /> Reset opérationnel
              </Button>
            </div>
          </div>
        </Card>

        {/* ─── 4. Nuclear ─── */}
        <Card animate className="border-l-[3px] border-l-danger relative overflow-hidden">
          <div aria-hidden className="absolute -top-12 -right-12 h-32 w-32 rounded-full blur-3xl opacity-20"
            style={{ background: 'radial-gradient(circle, #ef4444, transparent 70%)' }} />
          <div className="flex items-start gap-md relative">
            <div className="rounded-md flex items-center justify-center flex-shrink-0"
              style={{ width: 40, height: 40, background: 'color-mix(in srgb, #ef4444 25%, transparent)', color: '#ef4444' }}>
              <Skull size={20} strokeWidth={2.4} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-body font-bold text-fg-primary mb-1 flex items-center gap-2">
                ☢️ Nuclear — Tout supprimer
                <Badge variant="danger" size="xs">DANGER</Badge>
              </div>
              <div className="text-caption text-fg-tertiary leading-relaxed mb-md">
                Vide la <strong className="text-danger">totalité de la base</strong> (sauf authentification + rôles). Toutes les fermes, serres, employés, données — tout disparaît.
                Ne sert que pour un reset complet en démo.
              </div>
              <Button onClick={() => setNuclearOpen(true)} variant="destructive" size="sm">
                <Skull size={13} /> Activer le nuclear
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* ─── Liste détaillée des campagnes ─── */}
      <Card animate className="mt-lg" padding="none">
        <div className="px-md py-sm border-b border-border bg-surface-sunk">
          <div className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary font-bold">
            Campagnes en base ({campaigns.length})
          </div>
        </div>
        {loading ? (
          <div className="p-md text-center text-fg-tertiary text-caption">Chargement…</div>
        ) : campaigns.length === 0 ? (
          <div className="p-lg text-center text-fg-tertiary text-caption">Aucune campagne</div>
        ) : (
          <div className="divide-y divide-border">
            {campaigns.map(c => (
              <div key={c.id} className="flex items-center gap-md px-md py-sm hover:bg-surface-hover transition-colors">
                <div className="rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ width: 28, height: 28, background: 'color-mix(in srgb, #10b981 14%, transparent)', color: '#10b981' }}>
                  <Sprout size={14} strokeWidth={2.4} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-body-sm font-semibold text-fg-primary truncate">{c.name}</div>
                  <div className="text-[10px] text-fg-tertiary font-mono">
                    {c.code} · {c.farms?.name ?? '—'} · {c.preparation_start ?? '?'} → {c.campaign_end ?? '?'}
                  </div>
                </div>
                <Badge variant={c.status === 'en_cours' ? 'success' : 'default'} size="sm">
                  {c.status ?? '?'}
                </Badge>
                <Button onClick={() => setDeleteCampaignId(c.id)} variant="ghost" size="xs">
                  <Trash2 size={11} /> Supprimer
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MODALES                                                              */}
      {/* ════════════════════════════════════════════════════════════════════ */}

      {/* ─── Modal : Nouvelle campagne ─── */}
      {newCampaignOpen && (
        <Modal title="✨ Nouvelle campagne" onClose={() => setNewCampaignOpen(false)} size="md">
          <div className="space-y-md">
            <Field label="Code (unique)" required>
              <TInput value={newCamp.code} onChange={(e) => setNewCamp(s => ({ ...s, code: e.target.value }))} placeholder="C-2026-2027" />
            </Field>
            <Field label="Nom" required>
              <TInput value={newCamp.name} onChange={(e) => setNewCamp(s => ({ ...s, name: e.target.value }))} placeholder="Campagne 2026-2027" />
            </Field>
            <Field label="Ferme" required>
              <TSelect value={newCamp.farm_id} onChange={(e) => setNewCamp(s => ({ ...s, farm_id: e.target.value }))}>
                <option value="">— Sélectionner —</option>
                {farms.map(f => <option key={f.id} value={f.id}>{f.name} {f.code ? `(${f.code})` : ''}</option>)}
              </TSelect>
            </Field>
            <div className="grid grid-cols-2 gap-md">
              <Field label="Début préparation">
                <TInput type="date" value={newCamp.preparation_start} onChange={(e) => setNewCamp(s => ({ ...s, preparation_start: e.target.value }))} />
              </Field>
              <Field label="Fin campagne">
                <TInput type="date" value={newCamp.campaign_end} onChange={(e) => setNewCamp(s => ({ ...s, campaign_end: e.target.value }))} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-md">
              <Field label="Objectif production (kg)">
                <TInput type="number" value={newCamp.production_target_kg} onChange={(e) => setNewCamp(s => ({ ...s, production_target_kg: e.target.value }))} placeholder="500000" />
              </Field>
              <Field label="Budget total (MAD)">
                <TInput type="number" value={newCamp.budget_total} onChange={(e) => setNewCamp(s => ({ ...s, budget_total: e.target.value }))} placeholder="2000000" />
              </Field>
            </div>
            <ModalFooter
              onCancel={() => setNewCampaignOpen(false)}
              onSave={createCampaign}
              loading={saving}
              saveLabel="CRÉER LA CAMPAGNE"
              disabled={!newCamp.code || !newCamp.name || !newCamp.farm_id}
            />
          </div>
        </Modal>
      )}

      {/* ─── Modal : Suppression campagne ─── */}
      {campaignToDelete && (
        <Modal
          title={`⚠ Supprimer « ${campaignToDelete.name} »`}
          onClose={() => { setDeleteCampaignId(null); setConfirmDelete('') }}
          size="md"
        >
          <div className="space-y-md">
            <div className="rounded-md bg-warning/10 border border-warning/30 p-md">
              <div className="flex items-start gap-sm">
                <AlertTriangle size={18} className="text-warning flex-shrink-0 mt-0.5" />
                <div className="text-body-sm text-fg-secondary leading-relaxed">
                  Cette action supprime <strong>définitivement</strong> :
                  <ul className="mt-sm space-y-1 list-disc list-inside">
                    <li>La campagne <code className="text-warning">{campaignToDelete.code}</code></li>
                    <li>Toutes les plantations, récoltes, dispatches</li>
                    <li>Tous les coûts, factures, paiements liés</li>
                    <li>Opérations culturales et heures de main d'œuvre</li>
                    <li>Amortissements de la campagne</li>
                    <li>Budgets et lignes budgétaires</li>
                  </ul>
                </div>
              </div>
            </div>

            <Field label={`Tape "${campaignToDelete.code}" pour confirmer`}>
              <TInput
                value={confirmDelete}
                onChange={(e) => setConfirmDelete(e.target.value)}
                placeholder={campaignToDelete.code}
                autoFocus
              />
            </Field>

            <div className="flex justify-end gap-sm">
              <Button onClick={() => { setDeleteCampaignId(null); setConfirmDelete('') }} variant="secondary">
                Annuler
              </Button>
              <Button
                onClick={deleteCampaign}
                variant="destructive"
                disabled={confirmDelete !== campaignToDelete.code || saving}
                loading={saving}
              >
                <Trash2 size={13} /> SUPPRIMER DÉFINITIVEMENT
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Modal : Reset opérationnel ─── */}
      {resetOpsOpen && (
        <Modal
          title="⚠ Reset des données opérationnelles"
          onClose={() => { setResetOpsOpen(false); setConfirmReset('') }}
          size="md"
        >
          <div className="space-y-md">
            <div className="rounded-md bg-danger/10 border border-danger/30 p-md">
              <div className="flex items-start gap-sm">
                <AlertOctagon size={18} className="text-danger flex-shrink-0 mt-0.5" />
                <div className="text-body-sm text-fg-secondary leading-relaxed">
                  Va supprimer <strong className="text-danger">toutes les transactions</strong> :
                  <div className="grid grid-cols-2 gap-1 mt-sm text-[10px] font-mono">
                    {OPERATIONAL_TABLES.map(t => <div key={t} className="text-fg-tertiary">• {t}</div>)}
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-md bg-success/10 border border-success/30 p-md">
              <div className="flex items-start gap-sm">
                <CheckCircle2 size={18} className="text-success flex-shrink-0 mt-0.5" />
                <div className="text-body-sm text-fg-secondary leading-relaxed">
                  <strong>Conservé :</strong> fermes, serres, variétés, clients, fournisseurs, employés, stock (références), comptes utilisateurs, rôles, chatbot users.
                </div>
              </div>
            </div>

            <Field label='Tape "RESET" pour confirmer'>
              <TInput
                value={confirmReset}
                onChange={(e) => setConfirmReset(e.target.value)}
                placeholder="RESET"
                autoFocus
              />
            </Field>

            <div className="flex justify-end gap-sm">
              <Button onClick={() => { setResetOpsOpen(false); setConfirmReset('') }} variant="secondary">
                Annuler
              </Button>
              <Button
                onClick={resetOperational}
                variant="destructive"
                disabled={confirmReset !== 'RESET' || saving}
                loading={saving}
              >
                <RotateCcw size={13} /> RESET
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Modal : Nuclear ─── */}
      {nuclearOpen && (
        <Modal
          title="☢️ NUCLEAR — Suppression complète"
          onClose={() => { setNuclearOpen(false); setConfirmNuclear('') }}
          size="md"
        >
          <div className="space-y-md">
            <div className="rounded-md bg-danger/15 border-2 border-danger p-md">
              <div className="flex items-start gap-sm">
                <Skull size={22} className="text-danger flex-shrink-0 mt-0.5" />
                <div className="text-body-sm text-fg-primary leading-relaxed">
                  <strong className="text-danger text-base">ATTENTION — Action ULTRA destructive.</strong>
                  <div className="mt-sm">Va supprimer absolument toutes les données métier :</div>
                  <ul className="mt-sm space-y-1 list-disc list-inside text-fg-secondary">
                    <li>Toutes les transactions (campaigns, harvests, costs, invoices…)</li>
                    <li>Toutes les fermes, serres, variétés</li>
                    <li>Tous les clients, fournisseurs, marchés</li>
                    <li>Tous les employés, équipes, stock</li>
                    <li>Tous les chatbot users (Telegram enrollments)</li>
                  </ul>
                  <div className="mt-md text-success">
                    <strong>Conservé uniquement :</strong> comptes Supabase Auth, rôles, permissions, catégories comptables.
                  </div>
                </div>
              </div>
            </div>

            <Field label='Tape exactement "SUPPRIMER TOUT" pour confirmer'>
              <TInput
                value={confirmNuclear}
                onChange={(e) => setConfirmNuclear(e.target.value)}
                placeholder="SUPPRIMER TOUT"
                autoFocus
              />
            </Field>

            <div className="flex justify-end gap-sm">
              <Button onClick={() => { setNuclearOpen(false); setConfirmNuclear('') }} variant="secondary">
                Annuler
              </Button>
              <Button
                onClick={nuclearWipe}
                variant="destructive"
                disabled={confirmNuclear !== 'SUPPRIMER TOUT' || saving}
                loading={saving}
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Skull size={13} />}
                ☢️ LANCER LE NUCLEAR
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
