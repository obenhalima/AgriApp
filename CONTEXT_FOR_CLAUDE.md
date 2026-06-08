# FramPilot — Contexte pour concevoir de nouvelles fonctionnalités

> **Comment utiliser ce fichier :** copie tout son contenu dans une conversation Claude,
> puis ajoute en bas ta demande de feature. Claude aura tout le contexte pour te
> proposer un design cohérent avec l'existant (modèle de données, UI, conventions).

---

## 0. En une phrase

FramPilot est l'**ERP de pilotage agricole** de **Domaine BENHALIMA** (production de tomates sous serres au Maroc) : il couvre tout le cycle **du sol à la facture** — planification, récolte, tri à la station, facturation, comptabilité analytique — dans une seule application web, avec un bot Telegram multilingue pour le terrain.

---

## 1. Ce que fait l'application (vue fonctionnelle)

### 🌿 PRODUCTION
- **Planification** : structure Domaine → Fermes → Serres → Plantations (variété × cycle) → Campagnes
- **Saisie de récolte** sur 3 canaux : application Web, **bot Telegram** (FR / arabe / darija en lettres arabes), import Excel
- **Cycle de vie d'un lot** suivi en temps réel : Récolté → À envoyer → Envoyé station → Trié → Tarifé → Facturé
- **Alertes terrain** (ex : journée sans récolte)

### 💼 COMMERCE
- **Envoi à la station** : composition d'un lot (N récoltes → 1 dispatch)
- **Tri** : saisie freinte% (perte physique détruite) + écart% (vendable au "client écart")
- **Bordereaux station** : regroupement des dispatches payés par la station
  - Fréquence configurable **par marché** : hebdomadaire (export) / mensuel (local) / aucun (vente directe)
  - **Validation FIFO automatique** : alloue les quantités payées aux dispatches les plus anciens
- **Auto-facturation** : 1 facture par marché × client, échéance calculée automatiquement
- **Commandes clients** : workflow brouillon → confirmée → préparation → expédiée → livrée → facturée

### 📊 FINANCE
- **Budget** : généré depuis les coûts planifiés + amortissements automatiques
- **Compte d'exploitation** (CPC) : Budget vs Réel, par catégorie comptable, **mensuel**, à 3 niveaux (Domaine / Ferme / Serre)
- **Amortissements** : calcul automatique des dotations mensuelles depuis le registre d'actifs
- **Factures clients & fournisseurs** : calendrier des échéances, paiements partiels, relances
- **Dashboard CEO** : KPI exécutifs temps réel + insights générés par IA (marge, cash, alertes)

### 🛒 ACHATS
- **Bons d'achat fournisseurs** : workflow brouillon → envoyé → reçu → facturé → payé (+ raccourci achat direct)
- **Stocks** : entrées/sorties, seuils mini
- **Lien BO ↔ facture fournisseur**

### ⚙️ ADMINISTRATION
- Paramètres globaux (identité du domaine, campagne "live")
- Utilisateurs, rôles & permissions (par module)
- Plan comptable, workflows configurables
- Reset démo + générateurs de données de test (récoltes gaussiennes, chaîne commerciale complète)

---

## 2. Stack technique

| Couche | Techno |
|---|---|
| Frontend | **Next.js 14** (App Router) + React 18 + **TypeScript strict** |
| UI | **Tailwind CSS** + design system maison (Card, Button, Badge, KPICard, DataTable, Modal…) |
| Animations / Toasts / Icons / Charts | Framer Motion · Sonner · Lucide React · Recharts |
| Backend | **Supabase** : Postgres + Auth + Storage + **Realtime** + Edge Functions (Deno) |
| Sécurité DB | **Row-Level Security** systématique + helper `is_admin(auth.uid())` |
| IA | **Google Gemini** (transcription audio + extraction d'intention pour le bot) |
| Déploiement | **Vercel** (front, auto-deploy sur push) + Supabase Cloud (back) |

**Conventions de nommage :** tables snake_case pluriel · colonnes snake_case · RPCs préfixées `admin_` · composants PascalCase · hooks `useXxx` · helpers lib camelCase.

---

## 3. Modèle de données (tables principales)

### Référentiels
- **farms** (id, code, name, region, is_active)
- **greenhouses** (id, farm_id, code, name, type, total_area, exploitable_area)
- **varieties** (id, code, commercial_name, type, destination, theoretical_yield_per_m2, avg_price_local, avg_price_export *en MAD*)
- **campaigns** (id, farm_id, code, name, preparation_start, planting_start, harvest_start, campaign_end, status, production_target_kg)
- **campaign_plantings** (id, campaign_id, greenhouse_id, variety_id, planted_area, target_yield_per_m2, price_per_kg_export, price_per_kg_local)
- **markets** (id, code, name, type, currency, avg_price_per_kg, **payment_terms_days**, **client_id**, **bordereau_frequency** weekly/monthly/none, **is_ecart_market**)
- **clients** (id, code, name, type, payment_terms_days, credit_limit, **is_ecart_buyer**)
- **suppliers** (id, code, name, category, payment_terms_days)

### Production
- **harvests** (id, campaign_planting_id, lot_number, harvest_date, total_qty, qty_category_1/2/3, qty_waste, avg_fruit_weight, brix_measure)
- **harvest_lots** *(cœur du cycle)* :
  - id, lot_number, **harvest_id** *(nullable)*, **campaign_planting_id** *(NOT NULL)*, harvest_date, quantity_kg
  - **category** : `'station_dispatch'` ou `'stock_retour'`
  - **tri_status** : `'pending'` → `'tried'` → `'priced'`
  - market_id, client_id, freinte_pct, ecart_pct, qty_nette_kg, qty_acceptee_kg, qty_priced_kg
  - **destination_rejet** : `'destruction'` / `'retour_stock'` / `'vente_industrie'` / `'dons'` / `'vente_ecart'`
  - rejet_qty_kg, parent_dispatch_id, price_per_kg, ca_amount, station_ref, settlement_id, invoice_id
- **harvest_lot_sources** (harvest_lot_id, harvest_id, qty_contributed_kg) — *traçabilité N récoltes → 1 lot*
- **alerts** (id, type, severity, message, is_resolved)

### Commerce — Bordereaux station
- **station_settlements** (id, code `SET-2026-S21`/`-M06`, period_start, period_end, **period_type** weekly/monthly/custom, received_date, **expected_payment_date**, status brouillon/valide, total_amount, total_qty_kg, invoice_id)
- **station_settlement_lines** (id, settlement_id, market_id, variety_id, farm_id *nullable*, qty_kg, price_per_kg, amount)
- **station_settlement_allocations** (settlement_line_id, harvest_lot_id, qty_allocated_kg, price_per_kg) — *détail FIFO*

### Finance
- **invoices** (id, invoice_number, invoice_type, client_id, invoice_date, due_date, subtotal, total_amount, paid_amount, balance, status)
- **supplier_invoices** (id, invoice_number, supplier_id, po_id, campaign_id, greenhouse_id, cost_category…)
- **payments_received** / **payments_made**
- **cost_entries** (id, campaign_id, greenhouse_id, account_category_id, amount, entry_date, **is_planned**, description)
- **account_categories** (id, code, label, **type** produit/charge_variable/charge_fixe/amortissement, parent_id, display_order)
- **budget_versions** (id, campaign_id, code, name, status) + **budget_lines** (version_id, farm_id, greenhouse_id, account_category_id, period_year, period_month, amount)
- **assets** (id, code, label, account_category_id, acquisition_date, acquisition_cost, useful_life_years, residual_value, farm_id, greenhouse_id, is_active)

### Achats & Stocks
- **purchase_orders** (id, **po_number** *— PAS `code` !*, supplier_id, campaign_id, greenhouse_id, cost_category, status, order_date, total_amount)
- **purchase_order_lines**, **purchase_receipts**
- **stock_items** (id, code, name, category, unit, current_qty, min_qty, unit_cost) + **stock_movements**

### Workflows & Admin
- **workflow_definitions** (entity_type sales_order/purchase_order, code, version, is_default)
- **workflow_states** (definition_id, code, label, color, is_initial, is_final, order_idx)
- **workflow_transitions** (definition_id, from_state_id, to_state_id, code, label) + **workflow_history**
- **app_settings** (key, value JSONB) — paramètres globaux
- **users**, **profiles**, **roles**, **permissions**, **role_permissions**, **modules**
- **sales_orders** (id, order_number, client_id, market_id, order_date, status, total_amount)
- **workers** (id, name, phone, telegram_chat_id, language fr/ar/darija/en, role) — *utilisateurs du bot*

---

## 4. Workflows métier

### Récoltes (le workflow central)
```
harvests (qté brute saisie)
  └─ Composer envoi ──► harvest_lot (category='station_dispatch', tri_status='pending')
       └─ Tri (freinte% + écart% + destination) ──► tri_status='tried'
            ├─ destination='destruction'    → freinte détruite (défaut)
            ├─ destination='vente_ecart'    → dispatch enfant vers marché écart
            ├─ destination='retour_stock'   → lot category='stock_retour' (ré-envoi possible)
            └─ destination='vente_industrie' / 'dons'
       └─ Tarification ──► tri_status='priced'
            ├─ Manuelle ('Tarifer')         → auto-facture (RPC admin_generate_dispatch_invoice)
            └─ Bordereau station (FIFO)      → N factures par marché (RPC admin_generate_settlement_invoice)
```

### Bordereau station
```
Créer brouillon (semaine/mois) → Saisir matrice (market × variety × farm × qty × prix)
  → Valider (RPC FIFO : alloue aux lots 'tried' les + anciens, passe en 'priced')
  → Générer factures (1 par marché unique, client = markets.client_id, échéance = received + payment_terms_days)
```

### Achats (purchase_order)
```
brouillon → envoyé → partiellement_recu → recu → facture → paye
brouillon ──(achat direct)──► recu
[tout état pré-livraison] → annule
```

### Commandes (sales_order)
```
brouillon → confirme → en_preparation → expedie → livre → facture
[brouillon/confirme/preparation/expedie] → annule
```

---

## 5. Patterns d'implémentation à respecter

### Chargement de données résilient
```ts
const load = useCallback(() =>
  Promise.allSettled([getX(), getY(), getZ()])
    .then((r) => {
      const get = <T,>(i: number, fb: T): T =>
        r[i].status === 'fulfilled' ? (r[i] as any).value : (console.error((r[i] as any).reason), fb)
      setX(get(0, [])); setY(get(1, []))
    })
, [])
```
> Toujours `allSettled` (pas `all`) pour qu'une requête cassée n'efface pas tout le state.

### Synchronisation temps réel
```ts
useRealtimeReload(['invoices', 'payments_received'], load, { channelName: 'ma-page' })
```

### Appel RPC avec détection "non déployée"
```ts
const { data, error } = await supabase.rpc('admin_xxx', params)
if (error) {
  if (error.code === 'PGRST202' || /does not exist/i.test(error.message))
    throw new Error('RPC non déployée — appliquer la migration NNN.')
  throw error
}
```

### Sauvegarde défensive (colonne d'une migration récente)
```ts
let resp = await supabase.from('t').update(payload).eq('id', id)
if (resp.error && /col_name.*does not exist|schema cache/i.test(resp.error.message)) {
  const fb = { ...payload }; delete fb.col_name
  resp = await supabase.from('t').update(fb).eq('id', id)  // retry sans la colonne
}
```

### Opérations destructives / bulk
Toujours via une **RPC `SECURITY DEFINER`** avec check `is_admin(auth.uid())` en tête.
Exemples existants : `admin_nuclear_wipe`, `admin_bulk_delete_harvests`, `admin_validate_station_settlement`, `admin_generate_settlement_invoice`, `admin_generate_dispatch_invoice`, `create_ecart_dispatch`.

---

## 6. Couleurs métier (à réutiliser pour cohérence)

```
green  #10b981  → récoltes, production, succès
blue   #3b82f6  → finance, factures, info
purple #8b5cf6  → bordereaux, commerce
orange #f59e0b  → alertes, à trier, warnings
red    #ef4444  → destruction, dette, danger
cyan   #06b6d4  → stock retour
```

UI : Topbar sticky (52px) · Sidebar à sections (Production/Commerce/Finance/Admin) · EmptyState systématique (icône + description + action) · Modal avec footer Cancel/Save · DataTable avec headers `React.ReactNode[]`.

---

## 7. Pièges connus (à éviter dans tout design)

1. **`purchase_orders.po_number`** — c'est `po_number`, jamais `code`.
2. **`harvest_lots.campaign_planting_id`** est **NOT NULL** — toujours le renseigner.
3. **Prix en MAD partout** — `varieties.avg_price_export` est en MAD (plus en EUR). La devise se gère au niveau `markets.currency`.
4. **Embed Supabase ambigu** — si 2 FK existent entre 2 tables (`select('*, clients(name)')` échoue avec "more than one relationship"), faire la jointure **côté client** via une Map.
5. **FormBlock React** — un sous-composant de formulaire doit être déclaré **hors** du composant parent, sinon React le remonte à chaque render → perte de focus.
6. **`position: sticky`** — ne jamais mettre `overflow-x: hidden` sur un ancêtre (ça casse le sticky) ; utiliser `overflow-x: clip`.
7. **Bot Telegram** — pas de fichiers `_*.ts` (le bundler Supabase les ignore) ; le module i18n est inliné.
8. **Migrations** — toujours idempotentes (`CREATE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).

---

## 8. Recette pour ajouter une feature (rappel structurel)

1. **Migration SQL** `supabase/migrations/NNN_feature.sql` (idempotente, RLS, Realtime si besoin, RPC si bulk/destructif)
2. **Helper** `lib/featureName.ts` (types TS + fonctions CRUD + wrappers RPC)
3. **Page** `app/feature/page.tsx` (load résilient, `useRealtimeReload`, filtres/tri si liste, save défensif)
4. **Navigation** : entrée dans `lib/navigation.tsx` (+ vérifier le `moduleCode` dans la table `modules`)
5. **Commit + push** → Vercel déploie

---

## 9. Template pour ta demande

> Complète et colle ceci sous le contexte :

```markdown
## Feature à concevoir : [NOM]

### Problème métier
[Qui souffre, pourquoi — 1 à 3 phrases]

### Comportement attendu (côté utilisateur)
[Le workflow en 3-5 lignes : qui fait quoi, dans quel ordre]

### Contraintes
- Mobile / offline requis ?
- Réutilise quel(s) module(s) existant(s) ?
- Nouveaux rôles / permissions ?
- Intégration externe (API, banque, EDI) ?

### Questions ouvertes
[Choix de design que tu veux que je tranche]
```

**Ce que Claude te renverra :**
1. Modèle de données (migration SQL prête à coller)
2. Surface API (RPC + helpers TypeScript)
3. Maquette UI (description des écrans, réutilisant le design system)
4. Plan d'implémentation ordonné
5. Risques & alternatives

---

*Fin du contexte FramPilot. Ajoute ton brief ci-dessous.* ⬇️
