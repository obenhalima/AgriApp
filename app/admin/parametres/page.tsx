'use client'
/**
 * /admin/parametres — Paramètres globaux de l'application.
 *
 * Édition de :
 *   - Identité du domaine (nom, contact) → affichée en en-tête des factures
 *   - Campagne live → affichée dans le Topbar et utilisée comme défaut
 */
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Settings, Building2, CalendarRange, Save, RefreshCw } from 'lucide-react'

import {
  type OrganizationSettings,
  type AppDefaults,
  getOrganization,
  getCurrentCampaignId,
  getDefaults,
  updateOrganization,
  setCurrentCampaignId,
  updateDefaults,
} from '@/lib/appSettings'
import {
  type ExchangeRate,
  listCurrentRates,
  setRate,
} from '@/lib/exchangeRates'
import {
  type BusinessParams,
  getBusinessParams,
  updateBusinessParams,
} from '@/lib/businessParams'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { Field, Input as TInput, Select as TSelect, Textarea } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { DollarSign, Globe2, Percent } from 'lucide-react'

interface CampaignLite {
  id: string
  code: string
  name: string
  status: string
  preparation_start: string | null
  campaign_end: string | null
}

export default function ParametresPage() {
  const { isAdmin, loading: authLoading } = useAuth()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [org, setOrg] = useState<OrganizationSettings>({ name: '' })
  const [currentCampaignId, setCurrentCampId] = useState<string>('')  // '' = auto
  const [campaigns, setCampaigns] = useState<CampaignLite[]>([])
  // Valeurs par défaut + taux de change
  const [defaults, setDefaults] = useState<AppDefaults | null>(null)
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [rateEdits, setRateEdits] = useState<Record<string, string>>({})  // from_currency → nouveau taux
  const [biz, setBiz] = useState<BusinessParams | null>(null)

  const MONTHS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [o, campId, camps, def, rts, bp] = await Promise.all([
        getOrganization(),
        getCurrentCampaignId(),
        supabase
          .from('campaigns')
          .select('id, code, name, status, preparation_start, campaign_end')
          .order('preparation_start', { ascending: false, nullsFirst: false }),
        getDefaults(),
        listCurrentRates().catch(() => []),
        getBusinessParams().catch(() => null),
      ])
      setOrg(o)
      setCurrentCampId(campId ?? '')
      setCampaigns((camps.data ?? []) as CampaignLite[])
      setDefaults(def)
      setRates(rts)
      setBiz(bp)
    } catch (e: any) {
      toast.error(`Chargement : ${e.message ?? e}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSaveOrg = async () => {
    if (!org.name.trim()) {
      toast.error('Le nom du domaine est obligatoire')
      return
    }
    setSaving(true)
    try {
      await updateOrganization(org)
      toast.success('Identité du domaine enregistrée — visible dans les factures et le Topbar')
    } catch (e: any) {
      toast.error(`Enregistrement : ${e.message ?? e}`)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveCampaign = async () => {
    setSaving(true)
    try {
      await setCurrentCampaignId(currentCampaignId || null)
      toast.success(
        currentCampaignId
          ? 'Campagne live définie'
          : 'Mode auto activé : la campagne avec status=en_cours sera utilisée'
      )
    } catch (e: any) {
      toast.error(`Enregistrement : ${e.message ?? e}`)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveDefaults = async () => {
    if (!defaults) return
    setSaving(true)
    try {
      await updateDefaults(defaults)
      toast.success('Valeurs par défaut enregistrées')
    } catch (e: any) {
      toast.error(`Enregistrement : ${e.message ?? e}`)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveRate = async (fromCurrency: string) => {
    const raw = rateEdits[fromCurrency]
    const val = Number(raw)
    if (!raw || !Number.isFinite(val) || val <= 0) {
      toast.error('Taux invalide (doit être > 0)')
      return
    }
    setSaving(true)
    try {
      await setRate({ from_currency: fromCurrency, rate: val })
      toast.success(`Taux ${fromCurrency} → MAD mis à jour : ${val}`)
      setRateEdits(prev => { const n = { ...prev }; delete n[fromCurrency]; return n })
      const rts = await listCurrentRates()
      setRates(rts)
    } catch (e: any) {
      toast.error(`Enregistrement : ${e.message ?? e}`)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveBiz = async () => {
    if (!biz) return
    setSaving(true)
    try {
      await updateBusinessParams(biz)
      toast.success('Paramètres métier enregistrés')
    } catch (e: any) {
      toast.error(`Enregistrement : ${e.message ?? e}`)
    } finally {
      setSaving(false)
    }
  }

  if (authLoading) {
    return <div className="p-md"><Skeleton className="h-12 w-64" /></div>
  }

  if (!isAdmin) {
    return (
      <div className="p-md">
        <Card>
          <div className="p-md text-center">
            <h2 className="text-heading-sm font-bold text-fg-primary mb-sm">Accès réservé</h2>
            <p className="text-body-sm text-fg-secondary">Cette page est réservée aux administrateurs.</p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-md space-y-md max-w-4xl">
      <PageHeader
        icon={Settings}
        title="Paramètres globaux"
        description="Identité du domaine, campagne live et options d'affichage de l'application"
      />

      {/* ─── Identité du domaine ─── */}
      <Card animate delay={0.1}>
        <div className="flex items-center gap-sm mb-md pb-sm border-b border-border">
          <Building2 size={18} className="text-primary" strokeWidth={2.5} />
          <div>
            <h2 className="font-display text-heading-sm font-bold text-fg-primary">Identité du domaine</h2>
            <p className="text-body-sm text-fg-secondary">
              Affichée dans l'en-tête des factures, bordereaux imprimables et le Topbar.
            </p>
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="space-y-md">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
              <Field label="Nom du domaine *" required>
                <TInput
                  value={org.name}
                  onChange={(e) => setOrg({ ...org, name: e.target.value })}
                  placeholder="Domaine BENHALIMA"
                />
              </Field>
              <Field label="Tagline / Sous-titre">
                <TInput
                  value={org.tagline ?? ''}
                  onChange={(e) => setOrg({ ...org, tagline: e.target.value })}
                  placeholder="Production maraîchère"
                />
              </Field>
              <Field label="Adresse">
                <TInput
                  value={org.address ?? ''}
                  onChange={(e) => setOrg({ ...org, address: e.target.value })}
                  placeholder="Adresse complète"
                />
              </Field>
              <Field label="Ville">
                <TInput
                  value={org.city ?? ''}
                  onChange={(e) => setOrg({ ...org, city: e.target.value })}
                />
              </Field>
              <Field label="Pays">
                <TInput
                  value={org.country ?? ''}
                  onChange={(e) => setOrg({ ...org, country: e.target.value })}
                  placeholder="Maroc"
                />
              </Field>
              <Field label="Téléphone">
                <TInput
                  value={org.phone ?? ''}
                  onChange={(e) => setOrg({ ...org, phone: e.target.value })}
                  placeholder="+212..."
                />
              </Field>
              <Field label="Email">
                <TInput
                  type="email"
                  value={org.email ?? ''}
                  onChange={(e) => setOrg({ ...org, email: e.target.value })}
                />
              </Field>
              <Field label="Site web">
                <TInput
                  value={org.website ?? ''}
                  onChange={(e) => setOrg({ ...org, website: e.target.value })}
                  placeholder="https://..."
                />
              </Field>
              <Field label="ICE / Identifiant fiscal">
                <TInput
                  value={org.tax_id ?? ''}
                  onChange={(e) => setOrg({ ...org, tax_id: e.target.value })}
                  placeholder="Identifiant Commun Entreprise"
                />
              </Field>
              <Field label="URL du logo (optionnel)">
                <TInput
                  value={org.logo_url ?? ''}
                  onChange={(e) => setOrg({ ...org, logo_url: e.target.value })}
                  placeholder="https://... (PNG/SVG)"
                />
              </Field>
            </div>

            <div className="flex justify-end gap-sm pt-sm border-t border-border">
              <Button variant="ghost" onClick={load}>
                <RefreshCw size={14} /> Recharger
              </Button>
              <Button variant="primary" onClick={handleSaveOrg} disabled={saving}>
                <Save size={14} strokeWidth={2.5} />
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ─── Campagne live ─── */}
      <Card animate delay={0.2}>
        <div className="flex items-center gap-sm mb-md pb-sm border-b border-border">
          <CalendarRange size={18} className="text-warning" strokeWidth={2.5} />
          <div>
            <h2 className="font-display text-heading-sm font-bold text-fg-primary">Campagne « Live »</h2>
            <p className="text-body-sm text-fg-secondary">
              Campagne mise en avant dans le Topbar et utilisée comme filtre par défaut sur les listings.
            </p>
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="space-y-md">
            <Field label="Campagne en avant">
              <TSelect
                value={currentCampaignId}
                onChange={(e) => setCurrentCampId(e.target.value)}
              >
                <option value="">— Auto (campagne avec status=en_cours) —</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    [{c.code}] {c.name} — {c.status}
                  </option>
                ))}
              </TSelect>
            </Field>

            <div className="rounded-md border border-info bg-info/10 px-md py-sm flex items-start gap-sm">
              <CalendarRange size={14} className="text-info flex-shrink-0 mt-0.5" />
              <div className="text-body-sm text-fg-secondary">
                {currentCampaignId ? (
                  <>
                    <strong>Mode manuel</strong> : la campagne sélectionnée s'affichera dans le Topbar
                    même si elle n'est pas marquée <code>status=en_cours</code>.
                  </>
                ) : (
                  <>
                    <strong>Mode auto</strong> : la première campagne avec <code>status=en_cours</code>{' '}
                    sera utilisée. Si aucune, le badge Live sera masqué.
                  </>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-sm border-t border-border">
              <Button variant="primary" onClick={handleSaveCampaign} disabled={saving}>
                <Save size={14} strokeWidth={2.5} />
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ─── Valeurs par défaut ─── */}
      <Card animate delay={0.3}>
        <div className="flex items-center gap-sm mb-md pb-sm border-b border-border">
          <Globe2 size={18} className="text-success" strokeWidth={2.5} />
          <div>
            <h2 className="font-display text-heading-sm font-bold text-fg-primary">Valeurs par défaut</h2>
            <p className="text-body-sm text-fg-secondary">
              Pré-remplies dans les formulaires (devise, pays, TVA, délai de paiement, début de campagne).
            </p>
          </div>
        </div>

        {loading || !defaults ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="space-y-md">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
              <Field label="Devise par défaut">
                <TInput value={defaults.default_currency} onChange={(e) => setDefaults({ ...defaults, default_currency: e.target.value.toUpperCase() })} placeholder="MAD" />
              </Field>
              <Field label="Pays par défaut">
                <TInput value={defaults.default_country} onChange={(e) => setDefaults({ ...defaults, default_country: e.target.value })} placeholder="Maroc" />
              </Field>
              <Field label="Mois de début de campagne">
                <TSelect value={String(defaults.campaign_start_month)} onChange={(e) => setDefaults({ ...defaults, campaign_start_month: Number(e.target.value) })}>
                  {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </TSelect>
              </Field>
              <Field label="Taux de TVA (%)">
                <TInput type="number" value={String(Math.round(defaults.vat_rate * 100))} onChange={(e) => setDefaults({ ...defaults, vat_rate: (Number(e.target.value) || 0) / 100 })} placeholder="20" />
              </Field>
              <Field label="Délai de paiement par défaut (jours)">
                <TInput type="number" value={String(defaults.default_payment_terms_days)} onChange={(e) => setDefaults({ ...defaults, default_payment_terms_days: Number(e.target.value) || 0 })} placeholder="30" />
              </Field>
            </div>
            <div className="flex justify-end pt-sm border-t border-border">
              <Button variant="primary" onClick={handleSaveDefaults} disabled={saving}>
                <Save size={14} strokeWidth={2.5} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ─── Taux de change ─── */}
      <Card animate delay={0.4}>
        <div className="flex items-center gap-sm mb-md pb-sm border-b border-border">
          <DollarSign size={18} className="text-warning" strokeWidth={2.5} />
          <div>
            <h2 className="font-display text-heading-sm font-bold text-fg-primary">Taux de change → MAD</h2>
            <p className="text-body-sm text-fg-secondary">
              Utilisés pour convertir les prix des marchés en devise étrangère. Modifie le taux courant ; l'historique est conservé.
            </p>
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : rates.filter(r => r.from_currency !== 'MAD').length === 0 ? (
          <div className="text-body-sm text-fg-secondary py-md text-center">
            Aucun taux configuré. Applique la migration 051 sur Supabase.
          </div>
        ) : (
          <div className="space-y-sm">
            {rates.filter(r => r.from_currency !== 'MAD').map((r) => (
              <div key={r.id} className="flex items-center gap-md py-2 border-b border-border last:border-b-0">
                <div className="font-mono text-body-sm font-semibold w-20">1 {r.from_currency}</div>
                <div className="text-fg-tertiary">=</div>
                <TInput
                  type="number"
                  value={rateEdits[r.from_currency] ?? String(r.rate)}
                  onChange={(e) => setRateEdits(prev => ({ ...prev, [r.from_currency]: e.target.value }))}
                  className="w-32"
                />
                <div className="font-mono text-body-sm font-semibold">MAD</div>
                <div className="text-caption text-fg-tertiary flex-1">depuis le {r.valid_from}</div>
                {rateEdits[r.from_currency] !== undefined && rateEdits[r.from_currency] !== String(r.rate) && (
                  <Button variant="primary" size="sm" onClick={() => handleSaveRate(r.from_currency)} disabled={saving}>
                    <Save size={13} /> Mettre à jour
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ─── Paramètres métier (freinte/écart par défaut) ─── */}
      <Card animate delay={0.5}>
        <div className="flex items-center gap-sm mb-md pb-sm border-b border-border">
          <Percent size={18} className="text-purple" strokeWidth={2.5} />
          <div>
            <h2 className="font-display text-heading-sm font-bold text-fg-primary">Paramètres de tri</h2>
            <p className="text-body-sm text-fg-secondary">
              Freinte et écart par défaut, pré-remplis lors du tri d'un dispatch (modifiables au cas par cas).
            </p>
          </div>
        </div>

        {loading || !biz ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="space-y-md">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-md">
              <Field label="Freinte Export (%)">
                <TInput type="number" value={String(biz.default_freinte_export)} onChange={(e) => setBiz({ ...biz, default_freinte_export: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="Écart Export (%)">
                <TInput type="number" value={String(biz.default_ecart_export)} onChange={(e) => setBiz({ ...biz, default_ecart_export: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="Freinte Local (%)">
                <TInput type="number" value={String(biz.default_freinte_local)} onChange={(e) => setBiz({ ...biz, default_freinte_local: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="Écart Local (%)">
                <TInput type="number" value={String(biz.default_ecart_local)} onChange={(e) => setBiz({ ...biz, default_ecart_local: Number(e.target.value) || 0 })} />
              </Field>
            </div>

            <div className="flex justify-end pt-sm border-t border-border">
              <Button variant="primary" onClick={handleSaveBiz} disabled={saving}>
                <Save size={14} strokeWidth={2.5} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
