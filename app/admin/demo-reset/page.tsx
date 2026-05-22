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
  ShieldAlert, Database, Skull, CheckCircle2, Loader2, Info, Dices,
  TrendingUp, Eye, Sparkles,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { Input as TInput, Select as TSelect, Field } from '@/components/ui/Input'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import {
  generateAll, buildPreview, listAvailableMonths,
  type PlantingInput, type GeneratorOptions, type GenerationPreview,
  type VarianceLevel, type QualityPreset, type HarvestFrequency,
} from '@/lib/testDataGenerator'
import { DemoSetupWizard } from '@/components/admin/DemoSetupWizard'

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

  // État des RPC (migration 036)
  const [rpcStatus, setRpcStatus] = useState<'unknown' | 'ok' | 'missing'>('unknown')
  const [showMigrationSql, setShowMigrationSql] = useState(false)

  // Nouvelle campagne form
  const [newCamp, setNewCamp] = useState({
    code: '', name: '', farm_id: '', preparation_start: '', campaign_end: '',
    production_target_kg: '', budget_total: '',
  })
  const [saving, setSaving] = useState(false)

  // Wizard de setup démo complète
  const [wizardOpen, setWizardOpen] = useState(false)

  // Générateur de données de test
  const [genOpen, setGenOpen] = useState(false)
  const [genCampaignId, setGenCampaignId] = useState<string>('')
  const [genPlantings, setGenPlantings] = useState<PlantingInput[]>([])
  const [genLoading, setGenLoading] = useState(false)
  const [genOptions, setGenOptions] = useState<GeneratorOptions>({
    variance: 'medium',
    quality: 'good',
    frequency: 'biweekly',
    onlyPast: true,
  })
  const [selectedPlantings, setSelectedPlantings] = useState<Set<string>>(new Set())
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set())
  const [genPreview, setGenPreview] = useState<GenerationPreview | null>(null)
  const [genInserting, setGenInserting] = useState(false)
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0 })

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

  // ─── Vérifie la présence des RPC (migration 036) au mount ──────────────
  const checkRpcAvailability = async (silent = false) => {
    try {
      const { error } = await supabase.rpc('is_admin_caller')
      if (error) {
        const isMissing = isRpcMissingError(error)
        setRpcStatus(isMissing ? 'missing' : 'ok')  // erreur de permission = ok (RPC existe)
        if (!silent && isMissing) {
          toast.error('Les RPC d\'admin ne sont pas déployées. Applique la migration 036.', { duration: 5000 })
        } else if (!silent) {
          toast.success('✅ Les RPC d\'admin sont opérationnelles')
        }
      } else {
        setRpcStatus('ok')
        if (!silent) toast.success('✅ Les RPC d\'admin sont opérationnelles')
      }
    } catch (e: any) {
      setRpcStatus('missing')
      if (!silent) toast.error('Erreur de test : ' + e.message)
    }
  }

  useEffect(() => {
    load()
    checkRpcAvailability(true)  // check silencieux au mount
  }, [])

  // Helper : détecte si l'erreur Supabase = RPC manquante
  const isRpcMissingError = (e: any): boolean => {
    const msg = (e?.message ?? '').toLowerCase()
    return (
      e?.code === 'PGRST202' ||                               // PostgREST : function not found
      e?.code === '42883' ||                                  // Postgres : undefined_function
      msg.includes('could not find the function') ||
      msg.includes('does not exist') ||
      msg.includes('function admin_') ||
      msg.includes('function public.admin_') ||
      msg.includes('function public.is_admin')
    )
  }

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

  // ─── Action 2 : Supprimer une campagne (via RPC) ───────────────────────
  const deleteCampaign = async () => {
    if (!campaignToDelete) return
    if (confirmDelete !== campaignToDelete.code) {
      toast.error(`Tape "${campaignToDelete.code}" pour confirmer`); return
    }
    setSaving(true)
    try {
      const { data, error } = await supabase.rpc('admin_delete_campaign', {
        p_campaign_id: campaignToDelete.id,
      })
      if (error) throw error
      const detailsObj = (data ?? {}) as Record<string, number>
      const total = Object.values(detailsObj).reduce((s, n) => s + (Number(n) || 0), 0)
      toast.success(`✅ Campagne "${campaignToDelete.name}" supprimée — ${total} ligne(s) effacées au total`)
      console.log('[admin_delete_campaign]', detailsObj)
      setDeleteCampaignId(null)
      setConfirmDelete('')
      load()
    } catch (e: any) {
      console.error('[admin_delete_campaign]', e)
      if (isRpcMissingError(e)) {
        setRpcStatus('missing')
        setShowMigrationSql(true)
        toast.error('⚠️ La migration 036_admin_wipe_rpc.sql n\'est pas appliquée. Voir bannière en haut.', { duration: 6000 })
      } else {
        toast.error('Erreur: ' + e.message)
      }
    }
    setSaving(false)
  }

  // ─── Action 3 : Reset données opérationnelles (via RPC) ────────────────
  const resetOperational = async () => {
    if (confirmReset !== 'RESET') {
      toast.error('Tape "RESET" pour confirmer'); return
    }
    setSaving(true)
    try {
      const { data, error } = await supabase.rpc('admin_operational_reset')
      if (error) throw error
      toast.success(`✅ ${(data as any)?.message ?? 'Reset opérationnel effectué'}`)
      setResetOpsOpen(false)
      setConfirmReset('')
      load()
    } catch (e: any) {
      console.error('[admin_operational_reset]', e)
      if (isRpcMissingError(e)) {
        setRpcStatus('missing')
        setShowMigrationSql(true)
        toast.error('⚠️ La migration 036_admin_wipe_rpc.sql n\'est pas appliquée. Voir bannière en haut.', { duration: 6000 })
      } else {
        toast.error('Erreur: ' + e.message)
      }
    }
    setSaving(false)
  }

  // ─── Action 4 : Nuclear (via RPC) ──────────────────────────────────────
  const nuclearWipe = async () => {
    if (confirmNuclear !== 'SUPPRIMER TOUT') {
      toast.error('Tape exactement "SUPPRIMER TOUT" pour confirmer'); return
    }
    setSaving(true)
    try {
      const { data, error } = await supabase.rpc('admin_nuclear_wipe')
      if (error) throw error
      toast.success(`☢️ ${(data as any)?.message ?? 'Nuclear wipe terminé'}`, { duration: 5000 })
      setNuclearOpen(false)
      setConfirmNuclear('')
      load()
    } catch (e: any) {
      console.error('[admin_nuclear_wipe]', e)
      if (isRpcMissingError(e)) {
        setRpcStatus('missing')
        setShowMigrationSql(true)
        toast.error('⚠️ La migration 036_admin_wipe_rpc.sql n\'est pas appliquée. Voir bannière en haut.', { duration: 6000 })
      } else {
        toast.error('Erreur: ' + e.message)
      }
    }
    setSaving(false)
  }

  // ─── Constante : SQL à copier-coller dans Supabase ─────────────────────
  const MIGRATION_036_SQL = `-- Copier ce bloc dans le SQL Editor de Supabase puis cliquer RUN
-- Migration 036 : RPC admin_delete_campaign / admin_operational_reset / admin_nuclear_wipe

CREATE OR REPLACE FUNCTION is_admin_caller() RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v BOOLEAN := FALSE;
BEGIN
  SELECT COALESCE(r.is_admin, FALSE) INTO v FROM profiles p
  LEFT JOIN roles r ON r.id = p.role_id WHERE p.id = auth.uid();
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION admin_nuclear_wipe() RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin_caller() THEN RAISE EXCEPTION 'Admin requis'; END IF;
  TRUNCATE TABLE chatbot_messages, harvest_lot_sources, harvest_lots, harvests,
    production_forecasts, station_prices, recoltes_marche_daily,
    payments_received, invoices, delivery_notes, sales_order_lines, sales_orders,
    payments_made, supplier_invoices, purchase_order_lines, purchase_orders,
    cost_entries, stock_movements, cultural_operations, labor_entries, alerts,
    budget_lines, amortissements, campaign_plantings, campaigns, market_prices
    RESTART IDENTITY CASCADE;
  TRUNCATE TABLE chatbot_users, workers, teams, stock_items, assets,
    clients, suppliers, markets, varieties, seed_suppliers,
    greenhouses, farm_zones, farms RESTART IDENTITY CASCADE;
  RETURN jsonb_build_object('status', 'success', 'message', 'Nuclear wipe ok');
END; $$;

CREATE OR REPLACE FUNCTION admin_operational_reset() RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin_caller() THEN RAISE EXCEPTION 'Admin requis'; END IF;
  TRUNCATE TABLE chatbot_messages, harvest_lot_sources, harvest_lots, harvests,
    production_forecasts, station_prices, recoltes_marche_daily,
    payments_received, invoices, delivery_notes, sales_order_lines, sales_orders,
    payments_made, supplier_invoices, purchase_order_lines, purchase_orders,
    cost_entries, stock_movements, cultural_operations, labor_entries, alerts,
    budget_lines, amortissements, campaign_plantings, campaigns, market_prices
    RESTART IDENTITY CASCADE;
  RETURN jsonb_build_object('status', 'success', 'message', 'Reset operational ok');
END; $$;

CREATE OR REPLACE FUNCTION admin_delete_campaign(p_campaign_id UUID) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INTEGER; v JSONB := '{}'::jsonb;
BEGIN
  IF NOT is_admin_caller() THEN RAISE EXCEPTION 'Admin requis'; END IF;
  DELETE FROM amortissements WHERE campaign_id = p_campaign_id; GET DIAGNOSTICS v_count = ROW_COUNT;
  v := jsonb_set(v, '{amortissements}', to_jsonb(v_count));
  DELETE FROM recoltes_marche_daily WHERE campaign_id = p_campaign_id;
  DELETE FROM cost_entries WHERE campaign_id = p_campaign_id;
  DELETE FROM supplier_invoices WHERE campaign_id = p_campaign_id;
  DELETE FROM purchase_orders WHERE campaign_id = p_campaign_id;
  DELETE FROM sales_orders WHERE campaign_id = p_campaign_id;
  DELETE FROM cultural_operations WHERE campaign_id = p_campaign_id;
  DELETE FROM labor_entries WHERE campaign_id = p_campaign_id;
  DELETE FROM harvest_lot_sources WHERE harvest_id IN (SELECT h.id FROM harvests h JOIN campaign_plantings cp ON cp.id = h.campaign_planting_id WHERE cp.campaign_id = p_campaign_id);
  DELETE FROM harvest_lots WHERE harvest_id IN (SELECT h.id FROM harvests h JOIN campaign_plantings cp ON cp.id = h.campaign_planting_id WHERE cp.campaign_id = p_campaign_id);
  DELETE FROM harvests WHERE campaign_planting_id IN (SELECT id FROM campaign_plantings WHERE campaign_id = p_campaign_id);
  DELETE FROM production_forecasts WHERE campaign_planting_id IN (SELECT id FROM campaign_plantings WHERE campaign_id = p_campaign_id);
  DELETE FROM campaigns WHERE id = p_campaign_id; GET DIAGNOSTICS v_count = ROW_COUNT;
  v := jsonb_set(v, '{campaigns}', to_jsonb(v_count));
  RETURN v;
END; $$;

REVOKE ALL ON FUNCTION is_admin_caller() FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_nuclear_wipe() FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_operational_reset() FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_delete_campaign(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_admin_caller() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_nuclear_wipe() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_operational_reset() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_campaign(UUID) TO authenticated;`

  // ─── Générateur : charge les plantings de la campagne sélectionnée ─────
  const loadPlantings = async (campaignId: string) => {
    setGenLoading(true)
    try {
      const { data, error } = await supabase
        .from('campaign_plantings')
        .select(`
          id, planted_area, target_yield_per_m2, target_total_production,
          planting_date, first_harvest_date, last_harvest_date,
          greenhouses(code),
          varieties(code, commercial_name)
        `)
        .eq('campaign_id', campaignId)
      if (error) throw error

      // Récupère aussi les dates de la campagne (fallback si pas sur le planting)
      const campaign = campaigns.find(c => c.id === campaignId)
      const camp = await supabase.from('campaigns')
        .select('preparation_start, harvest_start, harvest_end, campaign_end')
        .eq('id', campaignId).maybeSingle()

      const harvestStart = camp.data?.harvest_start ?? null
      const harvestEnd = camp.data?.harvest_end ?? null

      const items: PlantingInput[] = (data ?? []).map((p: any) => ({
        id: p.id,
        greenhouse_code: p.greenhouses?.code ?? null,
        variety_code: p.varieties?.code ?? null,
        variety_name: p.varieties?.commercial_name ?? null,
        planted_area: Number(p.planted_area) || 0,
        target_yield_per_m2: p.target_yield_per_m2 != null ? Number(p.target_yield_per_m2) : null,
        target_total_production: p.target_total_production != null ? Number(p.target_total_production) : null,
        // Fallback : dates de la plantation, sinon dates de la campagne
        harvest_start_date: p.first_harvest_date ?? harvestStart,
        harvest_end_date:   p.last_harvest_date  ?? harvestEnd,
        planting_date: p.planting_date,
      }))

      setGenPlantings(items)
      // Pré-sélectionne toutes les plantations qui ont des dates valides
      setSelectedPlantings(new Set(
        items.filter(p => p.harvest_start_date && p.harvest_end_date && (p.target_total_production ?? (p.target_yield_per_m2 ?? 0) * p.planted_area) > 0).map(p => p.id)
      ))
      // Pré-sélectionne tous les mois
      const months = listAvailableMonths(items)
      setSelectedMonths(new Set(months))
    } catch (e: any) { toast.error(e.message) }
    setGenLoading(false)
  }

  const openGenerator = (campaignId?: string) => {
    setGenOpen(true)
    setGenPreview(null)
    if (campaignId) {
      setGenCampaignId(campaignId)
      loadPlantings(campaignId)
    } else {
      setGenCampaignId('')
      setGenPlantings([])
      setSelectedPlantings(new Set())
      setSelectedMonths(new Set())
    }
  }

  const onSelectCampaignForGen = (campaignId: string) => {
    setGenCampaignId(campaignId)
    setGenPreview(null)
    if (campaignId) loadPlantings(campaignId)
    else { setGenPlantings([]); setSelectedPlantings(new Set()); setSelectedMonths(new Set()) }
  }

  const togglePlanting = (id: string) => {
    const next = new Set(selectedPlantings)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedPlantings(next)
    setGenPreview(null)
  }
  const toggleMonth = (m: string) => {
    const next = new Set(selectedMonths)
    if (next.has(m)) next.delete(m); else next.add(m)
    setSelectedMonths(next)
    setGenPreview(null)
  }

  const computePreview = () => {
    const selected = genPlantings.filter(p => selectedPlantings.has(p.id))
    if (selected.length === 0) { toast.error('Sélectionne au moins une plantation'); return }
    const months = Array.from(selectedMonths)
    const preview = buildPreview(selected, { ...genOptions, monthsFilter: months.length > 0 ? months : undefined })
    setGenPreview(preview)
    if (preview.totalHarvests === 0) {
      toast.warning('Aucune récolte ne serait générée avec ces options')
    }
  }

  const generateHarvests = async () => {
    const selected = genPlantings.filter(p => selectedPlantings.has(p.id))
    if (selected.length === 0) { toast.error('Sélectionne au moins une plantation'); return }
    const months = Array.from(selectedMonths)
    const harvests = generateAll(selected, { ...genOptions, monthsFilter: months.length > 0 ? months : undefined })
    if (harvests.length === 0) { toast.error('Rien à générer'); return }

    if (!confirm(`Générer ${harvests.length} récolte(s) (${Math.round(harvests.reduce((s, h) => s + h.qty_category_1 + h.qty_category_2 + h.qty_category_3 + h.qty_waste, 0))} kg au total) ?`)) return

    setGenInserting(true)
    setGenProgress({ done: 0, total: harvests.length })
    try {
      // Insertion en batches de 50
      const BATCH = 50
      for (let i = 0; i < harvests.length; i += BATCH) {
        const slice = harvests.slice(i, i + BATCH)
        const { error } = await supabase.from('harvests').insert(slice as any)
        if (error) throw error
        setGenProgress({ done: Math.min(i + BATCH, harvests.length), total: harvests.length })
      }
      toast.success(`✅ ${harvests.length} récolte(s) générées et insérées !`)
      setGenOpen(false)
      setGenPreview(null)
    } catch (e: any) {
      toast.error('Erreur: ' + e.message)
    }
    setGenInserting(false)
  }

  const availableMonths = useMemo(() => listAvailableMonths(genPlantings), [genPlantings])

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

      {/* Bannière statut RPC dynamique */}
      <Card
        variant="ghost"
        className={`mb-lg ${
          rpcStatus === 'ok' ? 'border-success/40 bg-success/5' :
          rpcStatus === 'missing' ? 'border-danger/40 bg-danger/5' :
          'border-info/40 bg-info/5'
        }`}
      >
        <div className="flex items-start gap-sm">
          {rpcStatus === 'ok' ? <CheckCircle2 size={20} className="text-success flex-shrink-0 mt-0.5" /> :
           rpcStatus === 'missing' ? <AlertOctagon size={20} className="text-danger flex-shrink-0 mt-0.5" /> :
           <Info size={20} className="text-info flex-shrink-0 mt-0.5" />}
          <div className="flex-1 text-body-sm text-fg-secondary leading-relaxed">
            {rpcStatus === 'ok' && (
              <>
                <strong className="text-success">✅ RPC admin opérationnelles.</strong> La migration <code className="font-mono">036</code> est bien appliquée — toutes les actions de cette page fonctionneront.
              </>
            )}
            {rpcStatus === 'missing' && (
              <>
                <strong className="text-danger">🚨 Migration 036 PAS appliquée — c'est pour ça que les fermes ne sont pas supprimées !</strong>
                <div className="mt-1">Les actions destructives nécessitent les RPC Postgres. Sans elles, les RLS bloquent silencieusement les DELETE sur farms/greenhouses.</div>
              </>
            )}
            {rpcStatus === 'unknown' && (
              <>
                <strong className="text-fg-primary">Pré-requis :</strong> les actions destructives utilisent les RPC Postgres définies dans la migration <code className="font-mono text-info">036_admin_wipe_rpc.sql</code>.
              </>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button onClick={() => checkRpcAvailability(false)} variant="secondary" size="xs">
              Tester
            </Button>
            {rpcStatus === 'missing' && (
              <Button onClick={() => setShowMigrationSql(true)} variant="primary" size="xs">
                Voir le SQL
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* ─── Wizard Setup démo complète (full-width, mise en avant) ─── */}
      <Card animate className="mb-md border-l-[3px] border-l-brand relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full blur-3xl opacity-30"
          style={{ background: 'radial-gradient(circle, var(--neon), transparent 70%)' }} />
        <div className="relative flex items-start gap-md">
          <div className="rounded-md flex items-center justify-center flex-shrink-0"
            style={{
              width: 48, height: 48,
              background: 'linear-gradient(135deg, var(--neon), color-mix(in srgb, var(--neon) 60%, #6366f1))',
            }}>
            <Sparkles size={24} strokeWidth={2.4} color="white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="font-display text-heading font-bold text-fg-primary">🧙 Setup démo complète</div>
              <Badge variant="brand" size="xs">WIZARD</Badge>
            </div>
            <div className="text-body-sm text-fg-tertiary leading-relaxed mb-md">
              Wizard 4 étapes qui crée une démo en partant de zéro : <strong>fermes → serres → variétés → campagne → plantations</strong>. Parfait juste après un Reset ou un Nuclear.
            </div>
            <Button onClick={() => setWizardOpen(true)} variant="primary">
              <Sparkles size={14} /> Lancer le wizard
            </Button>
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

        {/* ─── 2.5 Générateur de données de test ─── */}
        <Card animate className="border-l-[3px] border-l-info">
          <div className="flex items-start gap-md">
            <div className="rounded-md flex items-center justify-center flex-shrink-0"
              style={{ width: 40, height: 40, background: 'color-mix(in srgb, #3b82f6 15%, transparent)', color: '#3b82f6' }}>
              <Dices size={20} strokeWidth={2.4} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-body font-bold text-fg-primary mb-1 flex items-center gap-2">
                Générer jeu de récoltes
                <Badge variant="info" size="xs">SMART</Badge>
              </div>
              <div className="text-caption text-fg-tertiary leading-relaxed mb-md">
                Génère automatiquement des récoltes réalistes <strong>mois par mois</strong> en respectant : production cible, yield kg/m², courbe en cloche (phénologie tomate), variance configurable, mix qualité.
              </div>
              <Button onClick={() => openGenerator()} variant="primary" size="sm">
                <Dices size={13} /> Ouvrir le générateur
              </Button>
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

      {/* ─── Modal : Générateur ─── */}
      {genOpen && (
        <Modal title="🎲 Générer jeu de récoltes test" onClose={() => { setGenOpen(false); setGenPreview(null) }} size="lg">
          <div className="space-y-md">
            {/* 1. Campagne */}
            <Field label="Campagne" required>
              <TSelect value={genCampaignId} onChange={(e) => onSelectCampaignForGen(e.target.value)}>
                <option value="">— Sélectionner —</option>
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.code}) · {c.farms?.name ?? '?'}</option>
                ))}
              </TSelect>
            </Field>

            {genLoading && (
              <div className="text-center py-4 text-fg-tertiary text-caption">
                <Loader2 size={16} className="inline-block animate-spin mr-2" />Chargement plantations…
              </div>
            )}

            {!genLoading && genCampaignId && genPlantings.length > 0 && (
              <>
                {/* 2. Options génération */}
                <div className="grid grid-cols-3 gap-md">
                  <Field label="Cadence">
                    <TSelect value={genOptions.frequency} onChange={(e) => { setGenOptions(o => ({ ...o, frequency: e.target.value as HarvestFrequency })); setGenPreview(null) }}>
                      <option value="weekly">1/semaine</option>
                      <option value="biweekly">2/semaine</option>
                      <option value="triweekly">3/semaine</option>
                    </TSelect>
                  </Field>
                  <Field label="Variance">
                    <TSelect value={genOptions.variance} onChange={(e) => { setGenOptions(o => ({ ...o, variance: e.target.value as VarianceLevel })); setGenPreview(null) }}>
                      <option value="low">Faible (±8%)</option>
                      <option value="medium">Moyenne (±18%)</option>
                      <option value="high">Élevée (±30%)</option>
                    </TSelect>
                  </Field>
                  <Field label="Qualité">
                    <TSelect value={genOptions.quality} onChange={(e) => { setGenOptions(o => ({ ...o, quality: e.target.value as QualityPreset })); setGenPreview(null) }}>
                      <option value="excellent">Excellente (72% Cat 1)</option>
                      <option value="good">Bonne (60% Cat 1)</option>
                      <option value="average">Moyenne (48% Cat 1)</option>
                      <option value="poor">Faible (35% Cat 1)</option>
                    </TSelect>
                  </Field>
                </div>

                <div className="flex items-center gap-sm">
                  <label className="flex items-center gap-2 cursor-pointer text-body-sm text-fg-secondary">
                    <input
                      type="checkbox"
                      checked={genOptions.onlyPast ?? false}
                      onChange={(e) => { setGenOptions(o => ({ ...o, onlyPast: e.target.checked })); setGenPreview(null) }}
                      className="w-4 h-4 accent-brand"
                    />
                    <span>Uniquement les dates passées (jusqu'à aujourd'hui)</span>
                  </label>
                </div>

                {/* 3. Plantations à inclure */}
                <div>
                  <div className="flex items-center justify-between mb-sm">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary font-bold">
                      Plantations à inclure ({selectedPlantings.size}/{genPlantings.length})
                    </div>
                    <div className="flex gap-1">
                      <Button onClick={() => { setSelectedPlantings(new Set(genPlantings.map(p => p.id))); setGenPreview(null) }} variant="ghost" size="xs">Tout</Button>
                      <Button onClick={() => { setSelectedPlantings(new Set()); setGenPreview(null) }} variant="ghost" size="xs">Aucun</Button>
                    </div>
                  </div>
                  <div className="max-h-32 overflow-y-auto rounded border border-border bg-surface-sunk p-2 space-y-1">
                    {genPlantings.map(p => {
                      const total = p.target_total_production ?? (p.target_yield_per_m2 ?? 0) * p.planted_area
                      const hasData = p.harvest_start_date && p.harvest_end_date && total > 0
                      return (
                        <label key={p.id} className={`flex items-center gap-2 px-2 py-1 rounded text-caption cursor-pointer hover:bg-surface-hover ${!hasData ? 'opacity-50' : ''}`}>
                          <input
                            type="checkbox"
                            checked={selectedPlantings.has(p.id)}
                            onChange={() => togglePlanting(p.id)}
                            disabled={!hasData}
                            className="w-3.5 h-3.5 accent-brand"
                          />
                          <span className="font-mono text-fg-primary">{p.greenhouse_code ?? '?'}</span>
                          <span className="text-fg-tertiary">·</span>
                          <span className="text-fg-secondary">{p.variety_name ?? p.variety_code ?? '?'}</span>
                          <span className="ml-auto font-mono text-fg-tertiary text-[10px]">
                            {Math.round(total).toLocaleString('fr-FR')} kg cible · {p.harvest_start_date ?? '?'} → {p.harvest_end_date ?? '?'}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                {/* 4. Mois à inclure */}
                {availableMonths.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-sm">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary font-bold">
                        Mois à inclure ({selectedMonths.size}/{availableMonths.length})
                      </div>
                      <div className="flex gap-1">
                        <Button onClick={() => { setSelectedMonths(new Set(availableMonths)); setGenPreview(null) }} variant="ghost" size="xs">Tout</Button>
                        <Button onClick={() => { setSelectedMonths(new Set()); setGenPreview(null) }} variant="ghost" size="xs">Aucun</Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {availableMonths.map(m => {
                        const date = new Date(m + '-01T00:00:00')
                        const label = date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
                        return (
                          <button
                            key={m}
                            onClick={() => toggleMonth(m)}
                            className={`px-2.5 py-1 rounded-full text-caption font-semibold border transition-all ${selectedMonths.has(m)
                              ? 'bg-brand/15 border-brand text-brand'
                              : 'bg-surface-sunk border-border text-fg-tertiary hover:border-border-strong'
                            }`}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* 5. Bouton Aperçu */}
                <Button onClick={computePreview} variant="secondary" size="sm">
                  <Eye size={13} /> Calculer l'aperçu
                </Button>

                {/* 6. Aperçu */}
                {genPreview && (
                  <div className="rounded-md border border-border bg-surface-sunk p-md">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary font-bold mb-sm">
                      📊 Aperçu de génération
                    </div>
                    <div className="grid grid-cols-3 gap-md mb-md">
                      <div>
                        <div className="text-caption text-fg-tertiary">Plantations</div>
                        <div className="font-display text-heading font-bold text-fg-primary">{genPreview.totalPlantings}</div>
                      </div>
                      <div>
                        <div className="text-caption text-fg-tertiary">Récoltes</div>
                        <div className="font-display text-heading font-bold text-brand">{genPreview.totalHarvests}</div>
                      </div>
                      <div>
                        <div className="text-caption text-fg-tertiary">Total kg</div>
                        <div className="font-display text-heading font-bold text-success">{Math.round(genPreview.totalKg).toLocaleString('fr-FR')}</div>
                      </div>
                    </div>

                    {genPreview.byMonth.length > 0 && (
                      <div className="mb-md">
                        <div className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary mb-1">Par mois</div>
                        <div className="flex flex-wrap gap-1.5">
                          {genPreview.byMonth.map(b => {
                            const date = new Date(b.month + '-01T00:00:00')
                            const label = date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
                            return (
                              <div key={b.month} className="px-2 py-1 rounded bg-surface-raised border border-border text-[10px]">
                                <span className="font-semibold text-fg-primary">{label}</span>
                                <span className="text-fg-tertiary mx-1">·</span>
                                <span className="text-brand font-mono">{b.harvests}×</span>
                                <span className="text-fg-tertiary mx-1">·</span>
                                <span className="text-success font-mono">{Math.round(b.kg).toLocaleString('fr-FR')}kg</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {genPreview.byPlanting.length > 0 && (
                      <div>
                        <div className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary mb-1">Top plantations</div>
                        <div className="space-y-1">
                          {genPreview.byPlanting.slice(0, 5).map(p => (
                            <div key={p.plantingId} className="flex items-center justify-between text-caption">
                              <span className="text-fg-secondary truncate">{p.label}</span>
                              <span className="text-fg-tertiary font-mono ml-2 flex-shrink-0">
                                {p.harvests}× · {Math.round(p.kg).toLocaleString('fr-FR')} kg
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 7. Progress */}
                {genInserting && (
                  <div className="rounded-md bg-info/10 border border-info/30 p-md">
                    <div className="flex items-center gap-sm">
                      <Loader2 size={16} className="animate-spin text-info" />
                      <div className="flex-1">
                        <div className="text-body-sm font-semibold text-fg-primary">Insertion en cours…</div>
                        <div className="text-caption text-fg-tertiary">
                          {genProgress.done} / {genProgress.total} récoltes
                        </div>
                        <div className="h-1.5 mt-1 rounded-full bg-surface-sunk overflow-hidden">
                          <div className="h-full bg-info transition-all duration-300"
                            style={{ width: `${(genProgress.done / Math.max(genProgress.total, 1)) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {!genLoading && genCampaignId && genPlantings.length === 0 && (
              <div className="rounded-md bg-warning/10 border border-warning/30 p-md text-body-sm text-fg-secondary">
                <AlertTriangle size={16} className="inline-block text-warning mr-2" />
                Cette campagne n'a aucune plantation. Crée d'abord des plantations dans <code>/admin/budgets</code> ou <code>/plan-culture</code>.
              </div>
            )}

            {/* Footer */}
            <div className="flex justify-end gap-sm pt-sm border-t border-border">
              <Button onClick={() => { setGenOpen(false); setGenPreview(null) }} variant="secondary" disabled={genInserting}>
                Fermer
              </Button>
              <Button
                onClick={generateHarvests}
                variant="primary"
                disabled={!genPreview || genPreview.totalHarvests === 0 || genInserting}
                loading={genInserting}
              >
                <Dices size={13} /> GÉNÉRER {genPreview ? `(${genPreview.totalHarvests})` : ''}
              </Button>
            </div>
          </div>
        </Modal>
      )}

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

      {/* ─── Wizard Setup Démo Complète ─── */}
      {wizardOpen && (
        <DemoSetupWizard
          onClose={() => setWizardOpen(false)}
          onComplete={(campaignId) => {
            // Après le wizard, recharge la liste + propose direct le générateur
            load()
            toast.success('💡 Astuce : enchaîne avec "Générer jeu de récoltes" pour remplir les données', { duration: 5000 })
            // Auto-pré-sélectionne la nouvelle campagne pour le générateur
            setTimeout(() => openGenerator(campaignId), 800)
          }}
        />
      )}

      {/* ─── Modal : SQL Migration 036 à copier-coller ─── */}
      {showMigrationSql && (
        <Modal title="📋 Migration 036 — À appliquer sur Supabase" onClose={() => setShowMigrationSql(false)} size="lg">
          <div className="space-y-md">
            <div className="rounded-md bg-warning/10 border border-warning/30 p-md">
              <div className="flex items-start gap-sm">
                <AlertTriangle size={18} className="text-warning flex-shrink-0 mt-0.5" />
                <div className="text-body-sm text-fg-secondary leading-relaxed">
                  <strong>Procédure (1 minute) :</strong>
                  <ol className="mt-sm list-decimal list-inside space-y-1">
                    <li>Va sur <a href="https://supabase.com/dashboard" target="_blank" rel="noopener" className="text-info underline">supabase.com/dashboard</a></li>
                    <li>Sélectionne ton projet <strong>FramPilot / AgriApp</strong></li>
                    <li>Menu de gauche → <strong>SQL Editor</strong> → bouton <strong>+ New query</strong></li>
                    <li>Copie le bloc SQL ci-dessous (bouton <strong>Copier</strong> à droite)</li>
                    <li>Colle dans l'éditeur SQL → clique <strong>Run</strong> (ou <code>Ctrl+Enter</code>)</li>
                    <li>Tu dois voir <code className="text-success">"Success. No rows returned"</code></li>
                    <li>Reviens ici → clique <strong>Tester</strong> pour confirmer ✅</li>
                  </ol>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute top-2 right-2 z-10">
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(MIGRATION_036_SQL)
                    toast.success('📋 Copié dans le presse-papiers')
                  }}
                  variant="primary"
                  size="xs"
                >
                  📋 Copier
                </Button>
              </div>
              <pre className="bg-surface-sunk border border-border rounded-md p-md text-[10px] font-mono text-fg-primary max-h-96 overflow-auto leading-relaxed">
                {MIGRATION_036_SQL}
              </pre>
            </div>

            <div className="flex justify-end gap-sm">
              <Button onClick={() => setShowMigrationSql(false)} variant="secondary">Fermer</Button>
              <Button onClick={() => { setShowMigrationSql(false); checkRpcAvailability(false) }} variant="primary">
                ✅ J'ai appliqué la migration — Tester
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
