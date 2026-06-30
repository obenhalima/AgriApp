# FarmPilot — Audit des référentiels & plan "No-Code"

> **Objectif** : rendre paramétrables, sans toucher au code, toutes les listes
> déroulantes, statuts, devises, taux et constantes métier de l'application.
>
> Ce document est le résultat d'un audit exhaustif du codebase (migrations SQL +
> code TypeScript). Il classe chaque référentiel et propose une architecture
> d'implémentation priorisée.

---

## 1. Vue d'ensemble — 3 natures de référentiels

| Nature | Description | Modifiable sans code ? |
|---|---|---|
| 🟢 **Déjà dynamique** | Stocké en table DB, éditable via UI | ✅ Oui |
| 🟡 **Semi-figé** | Colonne VARCHAR libre OU défaut paramétrable mais valeurs en dur | ⚠️ Partiel |
| 🔴 **Figé** | Enum PostgreSQL ou array hardcodé en TS | ❌ Non (migration requise) |

### Score actuel
- 🟢 Déjà dynamique : **workflows** (commandes, achats), **plan comptable**, **marchés/clients/variétés** (les lignes, pas leurs types)
- 🔴 Figé : **~22 enums Postgres** + **~23 listes déroulantes TS** + **~10 constantes métier**

---

## 2. Référentiels FIGÉS à rendre dynamiques (le gros du chantier)

### 2.1 Listes déroulantes hardcodées (code TypeScript)

| # | Référentiel | Fichier | Valeurs actuelles | Entité |
|---|---|---|---|---|
| 1 | Types de clients | `clients/page.tsx:28` | grossiste, exportateur, grande_surface, detail, industrie, institutionnel, autre | clients.type |
| 2 | Types de marchés | `marches/page.tsx:16` | local, export, grande_distribution, grossiste, industrie | markets.type |
| 3 | Catégories fournisseurs | `fournisseurs/page.tsx:17` | semences, engrais, phytosanitaires, irrigation, emballage, transport, energie, services, equipement, autre | suppliers.category |
| 4 | Types de tomates | `varietes/page.tsx:27` | ronde, grappe, cerise, allongee, cocktail, beef, olivette, autre | varieties.type |
| 5 | Destinations variété | `varietes/page.tsx:28` | mixte, export, local, grande_distribution, industrie | varieties.destination |
| 6 | Types de serres | `serres/page.tsx:30` | tunnel, chapelle, venlo, multispan, solaire, autre | greenhouses.type |
| 7 | Statuts serres | `serres/page.tsx:31` | active, en_preparation, hors_service, renovation | greenhouses.status |
| 8 | Catégories stock | `stocks/page.tsx:19` | semences, plants, engrais, phytosanitaires, emballages, consommables, pieces_rechange, autre | stock_items.category |
| 9 | Unités de mesure | `stocks/page.tsx:20` | kg, L, unite, sac, boite, rouleau, m2, autre | stock_items.unit |
| 10 | Catégories achats | `achats/page.tsx:29` | semences, engrais, … , divers | purchase_orders.cost_category |
| 11 | Types interventions | `agronomie/page.tsx:17` | traitement, irrigation, fertilisation, taille, … | cultural_operations.operation_type |
| 12 | Unités agronomie | `agronomie/page.tsx:128` | L, kg, mL, g, unité | (dosage produits) |
| 13 | Catégories employés | `rh/employes/page.tsx:52` | fermier, staff_admin, saisonnier, tacheron | workers.category |
| 14 | État civil | `rh/employes/page.tsx:58` | celibataire, marie, divorce, veuf | workers.family_status |
| 15 | Modes paiement RH | `rh/employes/page.tsx:64` | virement, cash, cheque | workers.payment_method |
| 16 | Types contrats | `rh/employes/page.tsx:65` | CDI, CDD, saisonnier | workers.contract_type |
| 17 | Modes paiement factures | `factures/page.tsx:597,627` | virement, cheque, especes, lettre_change | payments |
| 18 | Devises | `marches`, `achats` | MAD, EUR, USD, GBP | (multi) |
| 19 | Fréquence bordereau | `marches/page.tsx:274` | weekly, monthly, none | markets.bordereau_frequency |
| 20 | Statuts factures (labels) | `factures/page.tsx:69` | en_attente, partiellement_paye, paye, en_retard | invoices.status |

**⚠️ Incohérences détectées** (le no-code les résoudra) :
- Modes de paiement : RH a 3 valeurs, Factures en a 4 → à unifier
- Devises : Marchés ont MAD/EUR/USD/GBP, Achats seulement MAD/EUR/USD
- Catégories : `equipement`/`autre` (fournisseurs) vs `equipement`/`divers` (achats)

### 2.2 Enums PostgreSQL figés (migration requise pour changer)

22 enums dans `001_initial_schema.sql` et migrations suivantes. Les plus impactants :
`user_role`, `greenhouse_type`, `greenhouse_status`, `tomato_type`, `market_destination`, `campaign_status`, `client_type`, `supplier_category`, `stock_category`, `movement_type`, `operation_type`, `alert_type`, `alert_severity`.

> **Note clé** : Ces enums **dupliquent** les listes déroulantes TS ci-dessus. Le no-code doit choisir : soit relâcher les enums en VARCHAR + table de référence, soit garder les enums et juste piloter l'affichage.

### 2.3 Constantes métier hardcodées

| # | Constante | Fichier | Valeur | Devrait être paramétrable au niveau |
|---|---|---|---|---|
| C1 | Taux de change EUR/USD/GBP→MAD | `testCommerceGenerator.ts:187` | 11.0 / 10.0 / 12.5 | **Organisation** (table exchange_rates) |
| C2 | Coefficients saisonniers prix | `testCommerceGenerator.ts:56` | +20% / -15% / +5% | **Variété ou marché** |
| C3 | Freinte/écart moyens | `testCommerceGenerator.ts:457` | 2%/3.5% export, 1.5%/2.5% local | **Marché ou variété** |
| C4 | Délai paiement défaut | partout | 30 jours | **Organisation** (fallback) |
| C5 | Taux TVA | `testCommerceGenerator.ts` | 0.20 | **Organisation** |
| C6 | Devise par défaut | `format.ts:52` | MAD | **Organisation** |
| C7 | Pays par défaut | clients/fermes/marchés | Maroc | **Organisation** |
| C8 | Mois début campagne | `budgets.ts:37` | juillet (mois 6) | **Organisation** |
| C9 | Taux paie Maroc (CNSS/AMO/IR) | `payroll.ts:7-39` | barèmes 2024 | **Organisation** (révision annuelle légale) |
| C10 | Locale dates | `format.ts:206` | fr-FR | **Organisation** |

---

## 3. Architecture No-Code recommandée

### Principe : 1 table générique de référentiels + 1 page admin + 1 hook

```
┌─────────────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  reference_lists         │     │  /admin/referentiels │     │ useReferenceList │
│  (catégories de listes)  │◄────┤  (CRUD admin no-code)│     │  (hook React)    │
└─────────────────────────┘     └──────────────────────┘     └─────────────────┘
            │                                                          │
            ▼                                                          ▼
┌─────────────────────────┐                              ┌──────────────────────┐
│  reference_values        │                              │ <select> alimenté    │
│  (valeurs de chaque liste)│─────────────────────────────►│ dynamiquement        │
└─────────────────────────┘                              └──────────────────────┘
```

### 3.1 Migration SQL (table générique)

```sql
-- Migration 050 : référentiels dynamiques (no-code)

-- Catégories de listes (ex: 'client_type', 'market_type', 'unit'...)
CREATE TABLE IF NOT EXISTS reference_lists (
  key         VARCHAR(50) PRIMARY KEY,         -- 'client_type'
  label       VARCHAR(120) NOT NULL,           -- 'Types de clients'
  description TEXT,
  is_system   BOOLEAN DEFAULT FALSE,           -- true = ne pas supprimer (lié à un enum DB)
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Valeurs de chaque liste
CREATE TABLE IF NOT EXISTS reference_values (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_key    VARCHAR(50) NOT NULL REFERENCES reference_lists(key) ON DELETE CASCADE,
  code        VARCHAR(50) NOT NULL,            -- 'grossiste' (valeur stockée en DB)
  label       VARCHAR(120) NOT NULL,           -- 'Grossiste' (affiché)
  color       VARCHAR(20),                     -- '#10b981' (badge optionnel)
  icon        VARCHAR(20),                     -- emoji optionnel
  metadata    JSONB DEFAULT '{}',              -- extra (ex: defaultFreq pour RH)
  order_idx   INT DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  is_default  BOOLEAN DEFAULT FALSE,           -- valeur pré-sélectionnée dans les forms
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(list_key, code)
);

CREATE INDEX idx_refvalues_list ON reference_values(list_key, order_idx) WHERE is_active;

-- RLS : lecture authenticated, écriture admin
ALTER TABLE reference_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ref_read" ON reference_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "ref_write" ON reference_lists FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "refv_read" ON reference_values FOR SELECT TO authenticated USING (true);
CREATE POLICY "refv_write" ON reference_values FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- Realtime (UI live)
ALTER PUBLICATION supabase_realtime ADD TABLE reference_values;

-- SEED : initialise avec les valeurs actuellement hardcodées
INSERT INTO reference_lists (key, label, is_system) VALUES
  ('client_type', 'Types de clients', false),
  ('market_type', 'Types de marchés', false),
  ('supplier_category', 'Catégories fournisseurs', false),
  ('variety_type', 'Types de variétés', false),
  ('variety_destination', 'Destinations variété', false),
  ('greenhouse_type', 'Types de serres', false),
  ('stock_category', 'Catégories de stock', false),
  ('unit', 'Unités de mesure', false),
  ('cost_category', 'Catégories de coûts', false),
  ('payment_method', 'Modes de paiement', false),
  ('currency', 'Devises', false),
  ('worker_category', 'Catégories employés', false),
  ('family_status', 'État civil', false),
  ('contract_type', 'Types de contrats', false)
ON CONFLICT (key) DO NOTHING;

-- Exemple de seed pour client_type
INSERT INTO reference_values (list_key, code, label, order_idx) VALUES
  ('client_type', 'grossiste', 'Grossiste', 1),
  ('client_type', 'exportateur', 'Exportateur', 2),
  ('client_type', 'grande_surface', 'Grande surface', 3),
  ('client_type', 'detail', 'Détail', 4),
  ('client_type', 'industrie', 'Industrie', 5),
  ('client_type', 'institutionnel', 'Institutionnel', 6),
  ('client_type', 'station', 'Station', 7),
  ('client_type', 'autre', 'Autre', 99)
ON CONFLICT (list_key, code) DO NOTHING;
-- … (répéter pour chaque liste, ou via un script de seed généré)
```

### 3.2 Hook React `useReferenceList`

```ts
// lib/useReferenceList.ts
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export interface RefValue {
  code: string; label: string; color?: string; icon?: string
  metadata?: any; is_default?: boolean
}

// Cache module-level pour éviter de re-fetch à chaque montage
const cache = new Map<string, RefValue[]>()

export function useReferenceList(listKey: string): {
  values: RefValue[]; loading: boolean; defaultCode: string | null
} {
  const [values, setValues] = useState<RefValue[]>(cache.get(listKey) ?? [])
  const [loading, setLoading] = useState(!cache.has(listKey))

  useEffect(() => {
    let cancelled = false
    if (cache.has(listKey)) { setValues(cache.get(listKey)!); setLoading(false); return }
    supabase
      .from('reference_values')
      .select('code, label, color, icon, metadata, is_default')
      .eq('list_key', listKey)
      .eq('is_active', true)
      .order('order_idx')
      .then(({ data }) => {
        if (cancelled) return
        const vals = (data ?? []) as RefValue[]
        cache.set(listKey, vals)
        setValues(vals); setLoading(false)
      })
    return () => { cancelled = true }
  }, [listKey])

  const defaultCode = values.find(v => v.is_default)?.code ?? null
  return { values, loading, defaultCode }
}
```

### 3.3 Usage dans un formulaire

```tsx
// AVANT (hardcodé)
const TYPES = ['grossiste', 'exportateur', 'detail', ...]
<TSelect>{TYPES.map(t => <option key={t}>{t}</option>)}</TSelect>

// APRÈS (no-code)
const { values } = useReferenceList('client_type')
<TSelect>
  {values.map(v => <option key={v.code} value={v.code}>{v.label}</option>)}
</TSelect>
```

### 3.4 Page admin `/admin/referentiels`

UI proposée :
- **Colonne gauche** : liste des référentiels (`reference_lists`) avec compteur de valeurs
- **Colonne droite** : table éditable des valeurs (`reference_values`) de la liste sélectionnée
  - Ajout/édition/désactivation inline (drag pour réordonner via `order_idx`)
  - Champs : code · label · couleur · icône · défaut (radio) · actif
- **Garde-fou** : impossible de supprimer une valeur référencée par des données existantes (juste désactiver)

---

## 4. Cas particuliers (hors table générique)

Certains référentiels méritent leur propre traitement :

| Référentiel | Solution recommandée |
|---|---|
| **Taux de change** (C1) | Table dédiée `exchange_rates (from, to, rate, valid_from)` + page admin · historisé |
| **Devise/Pays/Mois début par défaut** (C4-C8) | `app_settings` (déjà existant) — ajouter clés `default_currency`, `default_country`, `campaign_start_month`, `vat_rate`, `default_payment_terms_days` |
| **Coefficients saisonniers** (C2) | `app_settings` JSONB `seasonal_coefficients` (12 mois) ou par variété |
| **Freinte/écart par défaut** (C3) | Colonnes sur `markets` ou `varieties` (defaut_freinte_pct, defaut_ecart_pct) |
| **Barèmes paie Maroc** (C9) | Table `payroll_rates (key, value, valid_from)` — révision annuelle légale |
| **Statuts workflow** (commandes/achats) | ✅ DÉJÀ dynamique via `/admin/workflows` |
| **Plan comptable** | ✅ DÉJÀ dynamique via `/admin/account-categories` |
| **i18n / locale** (C10) | Chantier séparé (next-intl) — pas prioritaire si mono-langue |

---

## 5. Plan d'implémentation priorisé

### 🟥 P1 — Fondation no-code (l'essentiel)
1. **Migration 050** : tables `reference_lists` + `reference_values` + seed des 14 listes actuelles
2. **Hook** `lib/useReferenceList.ts` + helper `lib/referenceData.ts` (CRUD admin)
3. **Page** `/admin/referentiels` (CRUD complet)
4. **Migrer 6 listes prioritaires** vers le hook : client_type, market_type, supplier_category, variety_type, stock_category, unit
   → impact immédiat sur clients, marchés, fournisseurs, variétés, stocks

### 🟧 P2 — Paramètres organisation
5. Étendre `app_settings` : `default_currency`, `default_country`, `campaign_start_month`, `vat_rate`, `default_payment_terms_days`
6. Table `exchange_rates` + page admin (taux de change historisés)
7. Migrer les valeurs par défaut des formulaires (Maroc, MAD, 30j) vers `app_settings`

### 🟨 P3 — Référentiels métier avancés
8. Migrer les listes restantes (RH, agronomie, modes paiement) vers le hook
9. Coefficients saisonniers + freinte/écart paramétrables (par marché/variété)
10. Table `payroll_rates` pour les barèmes légaux

### 🟩 P4 — Polish
11. Drag & drop réordonnancement dans `/admin/referentiels`
12. Garde-fou "valeur utilisée" (compte les références avant désactivation)
13. Export/import des référentiels (JSON) pour dupliquer une config

---

## 6. Décision à trancher : enums Postgres

Les colonnes comme `clients.type` sont des **enums Postgres** (figés). Deux stratégies :

### Option A — Relâcher les enums en VARCHAR (recommandé pour no-code total)
- Migration : `ALTER TABLE clients ALTER COLUMN type TYPE VARCHAR`
- Avantage : ajout de valeurs sans migration future
- Risque : perte de la validation stricte au niveau DB (compensée par la table de référence + check applicatif)

### Option B — Garder les enums, piloter seulement l'affichage
- La table `reference_values` ne sert qu'aux **labels/couleurs/ordre**
- Ajouter une vraie nouvelle valeur nécessite quand même une migration `ALTER TYPE ... ADD VALUE`
- Avantage : intégrité DB forte
- Inconvénient : pas 100% no-code (ajout de valeur = migration)

**Recommandation** : **Option A** pour les listes "métier souples" (catégories, unités, modes paiement) ; **Option B** pour les statuts critiques liés à de la logique (campaign_status, tri_status) qui ne doivent PAS changer librement.

---

## 7. Estimation d'effort

| Phase | Contenu | Effort estimé |
|---|---|---|
| P1 | Table + hook + page admin + 6 listes migrées | ~1 journée |
| P2 | app_settings étendus + exchange_rates | ~half-day |
| P3 | Listes restantes + constantes métier | ~1 journée |
| P4 | Polish (drag, garde-fous, export) | ~half-day |

**Total : ~3 jours** pour une app entièrement pilotable sans code sur les référentiels.

---

*Audit réalisé sur l'ensemble du codebase (migrations 001→049 + app/ + lib/).*
*Document de référence pour le chantier "No-Code".*
