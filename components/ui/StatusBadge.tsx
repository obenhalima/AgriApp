'use client'
/**
 * StatusBadge — Badge typé pour les statuts métier.
 * Mappe automatiquement le statut vers couleur + label.
 */
import * as React from 'react'
import { Badge } from './Badge'

// ─── Mappings centraux ───────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info' }> = {
  // Campagnes
  planification: { label: 'Planification', variant: 'info' },
  en_cours:      { label: 'En cours',      variant: 'success' },
  terminee:      { label: 'Terminée',      variant: 'default' },
  annulee:       { label: 'Annulée',       variant: 'danger' },

  // Plantations
  planifie:   { label: 'Planifié',  variant: 'info' },
  en_culture: { label: 'En culture', variant: 'success' },
  recolte:    { label: 'Récoltée',  variant: 'brand' },
  termine:    { label: 'Terminé',   variant: 'default' },

  // Factures
  brouillon:           { label: 'Brouillon',  variant: 'default' },
  sent:                { label: 'Envoyée',    variant: 'info' },
  en_attente:          { label: 'En attente', variant: 'warning' },
  partiellement_paye:  { label: 'Partielle',  variant: 'warning' },
  paye:                { label: 'Payée',      variant: 'success' },
  en_retard:           { label: 'En retard',  variant: 'danger' },

  // Récoltes / Lots
  attente_tri:    { label: 'Attente tri',    variant: 'warning' },
  attente_prix:   { label: 'Attente prix',   variant: 'warning' },
  confirme:       { label: 'Confirmé',       variant: 'success' },
  partiel:        { label: 'Partiel',        variant: 'warning' },

  // Workers
  fermier:    { label: 'Fermier',    variant: 'success' },
  saisonier:  { label: 'Saisonnier', variant: 'info' },
  saisonnier: { label: 'Saisonnier', variant: 'info' },
  tacheron:   { label: 'Tâcheron',   variant: 'warning' },
  staff_admin:{ label: 'Admin',      variant: 'brand' },

  // Génériques
  active:   { label: 'Actif',     variant: 'success' },
  inactive: { label: 'Inactif',   variant: 'default' },
  pending:  { label: 'En attente', variant: 'warning' },
  approved: { label: 'Approuvé',  variant: 'success' },
  rejected: { label: 'Rejeté',    variant: 'danger' },
}

export function StatusBadge({
  status, size = 'sm', className,
}: {
  status: string | null | undefined
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}) {
  if (!status) return <Badge variant="default" size={size} className={className}>—</Badge>
  const norm = status.toLowerCase().trim()
  const found = STATUS_MAP[norm]
  if (!found) {
    return <Badge variant="default" size={size} className={className}>{status.replace(/_/g, ' ')}</Badge>
  }
  return <Badge variant={found.variant} size={size} className={className}>{found.label}</Badge>
}
