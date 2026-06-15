'use client'
/**
 * /cultures — Gestion des cultures (multi-culture).
 *
 * Liste les cultures, activation/désactivation, et assiste la création de
 * variétés via le catalogue de suggestions (import 1-clic).
 */
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Sprout, Power, Download, CheckCircle2, X, Leaf } from 'lucide-react'

import {
  type Crop, type CatalogVariety,
  listCrops, toggleCropActive, listCatalog, importCatalogVarieties,
} from '@/lib/crops'
import { useAuth } from '@/lib/auth'

import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'

export default function CulturesPage() {
  const { isAdmin } = useAuth()
  const [crops, setCrops] = useState<Crop[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)

  // Modal catalogue
  const [catalogCrop, setCatalogCrop] = useState<Crop | null>(null)
  const [catalog, setCatalog] = useState<CatalogVariety[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [importing, setImporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setCrops(await listCrops()) }
    catch (e: any) { toast.error(`Chargement : ${e.message ?? e}`) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const openCatalog = async (crop: Crop) => {
    setCatalogCrop(crop); setCatalog([]); setCatalogLoading(true)
    try { setCatalog(await listCatalog(crop.code)) }
    catch (e: any) { toast.error(`Catalogue : ${e.message ?? e}`) }
    finally { setCatalogLoading(false) }
  }

  const handleToggle = async (crop: Crop) => {
    if (!isAdmin) { toast.error('Réservé aux administrateurs'); return }
    try {
      await toggleCropActive(crop.id, !crop.is_active)
      setCrops(prev => prev.map(c => c.id === crop.id ? { ...c, is_active: !c.is_active } : c))
    } catch (e: any) { toast.error(`MAJ : ${e.message ?? e}`) }
  }

  const handleImport = async () => {
    if (!catalogCrop) return
    setImporting(true)
    try {
      const res = await importCatalogVarieties(catalogCrop, catalog)
      if (res.created > 0) toast.success(`${res.created} variété(s) importée(s) dans « ${catalogCrop.name} »` + (res.skipped ? ` (${res.skipped} déjà présentes)` : ''))
      else toast.info(res.skipped ? `Toutes les variétés sont déjà présentes (${res.skipped})` : 'Rien à importer')
      if (res.errors.length) toast.error(`${res.errors.length} erreur(s) : ${res.errors[0]}`)
      setCatalogCrop(null)
    } catch (e: any) { toast.error(`Import : ${e.message ?? e}`) }
    finally { setImporting(false) }
  }

  const visible = crops.filter(c => showInactive || c.is_active)

  return (
    <div className="p-md">
      <PageHeader
        icon={Sprout}
        title="Cultures"
        description="Gérez les cultures de l'exploitation et leurs variétés (catalogue assisté)"
        actions={
          <label className="flex items-center gap-2 text-body-sm cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Afficher les cultures inactives
          </label>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md mt-md">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md mt-md">
          {visible.map(crop => (
            <Card key={crop.id} className={crop.is_active ? '' : 'opacity-60'}>
              <div className="flex items-start justify-between gap-sm">
                <div className="flex items-center gap-sm min-w-0">
                  <span className="text-2xl" style={{ filter: crop.is_active ? 'none' : 'grayscale(1)' }}>{crop.icon ?? '🌱'}</span>
                  <div className="min-w-0">
                    <div className="font-display font-bold text-fg-primary truncate">{crop.name}</div>
                    <div className="text-caption text-fg-tertiary">{crop.family ?? '—'}</div>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle(crop)}
                  title={crop.is_active ? 'Désactiver' : 'Activer'}
                  className={crop.is_active ? 'text-success' : 'text-fg-tertiary hover:text-success'}
                >
                  <Power size={18} />
                </button>
              </div>

              <div className="flex flex-wrap gap-1 mt-sm">
                {crop.cycle_days_first_harvest && <Badge variant="default" size="xs">{crop.cycle_days_first_harvest} j → récolte</Badge>}
                <Badge variant="default" size="xs">{crop.default_unit}</Badge>
                {crop.brix_relevant && <Badge variant="info" size="xs">Brix</Badge>}
                {(crop.default_markets ?? []).map(m => <Badge key={m} variant="brand" size="xs">{m}</Badge>)}
              </div>

              {(crop.variety_segments ?? []).length > 0 && (
                <div className="text-caption text-fg-tertiary mt-sm">
                  Types : {crop.variety_segments.slice(0, 5).map(s => s.replace(/_/g, ' ')).join(', ')}{crop.variety_segments.length > 5 ? '…' : ''}
                </div>
              )}

              <div className="mt-sm pt-sm border-t border-border">
                <Button variant="ghost" size="sm" onClick={() => openCatalog(crop)}>
                  <Leaf size={13} /> Variétés suggérées
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal catalogue */}
      {catalogCrop && (
        <Modal title={`${catalogCrop.icon ?? '🌱'} ${catalogCrop.name} — variétés suggérées`} onClose={() => setCatalogCrop(null)}>
          {catalogLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : catalog.length === 0 ? (
            <div className="text-body-sm text-fg-secondary py-md text-center">
              Aucune variété de référence pour cette culture.<br />
              Tu peux les saisir directement dans <strong>Variétés</strong> (segments : {catalogCrop.variety_segments?.join(', ') || '—'}).
            </div>
          ) : (
            <>
              <div className="text-caption text-fg-tertiary mb-sm">
                Variétés réelles {catalog.some(c => c.verified) && '(✅ = vérifiée/sourcée)'}. L'import crée ces variétés, prêtes à planter.
              </div>
              <div className="divide-y divide-border max-h-[50vh] overflow-y-auto">
                {catalog.map(v => (
                  <div key={v.id} className="flex items-start gap-sm py-2">
                    {v.verified ? <CheckCircle2 size={15} className="text-success shrink-0 mt-0.5" /> : <span className="w-[15px]" />}
                    <div className="min-w-0">
                      <div className="text-body-sm font-semibold text-fg-primary">
                        {v.name}
                        {v.breeder && <span className="text-caption text-fg-tertiary font-normal"> · {v.breeder}</span>}
                        {v.segment && <Badge variant="default" size="xs" className="ml-1">{v.segment.replace(/_/g, ' ')}</Badge>}
                      </div>
                      {v.traits && <div className="text-caption text-fg-tertiary">{v.traits}</div>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 mt-md pt-sm border-t border-border">
                <Button variant="ghost" onClick={() => setCatalogCrop(null)}>Fermer</Button>
                <Button variant="primary" onClick={handleImport} disabled={importing}>
                  <Download size={14} strokeWidth={2.5} /> {importing ? 'Import…' : `Importer ${catalog.length} variété(s)`}
                </Button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  )
}
