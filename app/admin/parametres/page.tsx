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
  getOrganization,
  getCurrentCampaignId,
  updateOrganization,
  setCurrentCampaignId,
} from '@/lib/appSettings'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { Field, Input as TInput, Select as TSelect, Textarea } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'

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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [o, campId, camps] = await Promise.all([
        getOrganization(),
        getCurrentCampaignId(),
        supabase
          .from('campaigns')
          .select('id, code, name, status, preparation_start, campaign_end')
          .order('preparation_start', { ascending: false, nullsFirst: false }),
      ])
      setOrg(o)
      setCurrentCampId(campId ?? '')
      setCampaigns((camps.data ?? []) as CampaignLite[])
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
    </div>
  )
}
