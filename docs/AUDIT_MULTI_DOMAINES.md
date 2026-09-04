# Audit d'impact multi-domaines — FarmPilot

Date : 27 août 2026  
Statut : audit en lecture seule, aucune migration appliquée  
Décision cible : un domaine = un client FarmPilot ; un domaine possède plusieurs fermes ; un utilisateur peut appartenir à plusieurs domaines avec un rôle différent par domaine.

## 1. Synthèse exécutive

L'état sauvegardé de la base contient :

- 66 tables publiques ;
- 7 vues ;
- 39 fonctions SQL ;
- 71 politiques RLS ;
- 16 triggers ;
- 7 Edge Functions ;
- au moins 56 tables/vues appelées directement depuis le frontend ou les Edge Functions.

Le système actuel est mono-domaine par construction :

- `farms.code` et de nombreux numéros métier sont uniques globalement ;
- le rôle est porté par `profiles.role_id`, donc global pour l'utilisateur ;
- `app_settings` est une configuration globale ;
- de nombreuses politiques autorisent `SELECT USING (true)` à tous les utilisateurs authentifiés ;
- plusieurs Edge Functions utilisent `service_role`, qui contourne la RLS ;
- les dashboards, imports et générateurs lisent les tables sans filtre de domaine.

Conclusion : le multi-domaines doit être une frontière de sécurité en base. Un simple filtre dans l'interface serait insuffisant.

## 2. Modèle cible

### Tables nouvelles

#### `domains`

Champs minimaux :

- `id uuid primary key` ;
- `code text not null unique` ;
- `name text not null` ;
- identité légale et coordonnées ;
- `country`, `currency`, `timezone`, `locale` ;
- `logo_url` ;
- `is_active` ;
- `created_at`, `updated_at`.

#### `domain_memberships`

- `id uuid primary key` ;
- `domain_id` vers `domains` ;
- `user_id` vers `auth.users`/`profiles` ;
- `role_id` vers `roles` ;
- `is_active` ;
- `is_default` ;
- invitation et activation ;
- unicité `(domain_id, user_id)` ;
- au plus un domaine par défaut par utilisateur.

### Administration plateforme

Le statut de super-administrateur doit être global et séparé du rôle de domaine. Proposition : `profiles.is_platform_admin boolean not null default false`. Le rôle `Administrateur` d'un domaine ne donne aucun accès aux autres domaines.

### Fonctions de sécurité nouvelles

- `is_platform_admin(user_id)` ;
- `is_domain_member(domain_id, user_id)` ;
- `is_domain_admin(domain_id, user_id)` ;
- `has_domain_permission(domain_id, user_id, module_code, action)` ;
- `current_user_domain_ids()`.

Toutes doivent fixer leur `search_path`, être stables lorsque possible et ne retourner que le minimum nécessaire.

## 3. Classification des données

### A. Globales à la plateforme

Ces données peuvent rester sans `domain_id` :

- `profiles` : identité globale, sans rôle métier global ;
- `modules`, `permissions`, `app_modules` : catalogue des capacités FarmPilot ;
- `crops` et `crop_variety_catalog` : catalogue système partagé ;
- `exchange_rates` : taux de change global, sauf besoin ultérieur de taux personnalisés.

`users` et `user_module_access` sont des structures historiques à déprécier ou migrer vers `profiles` et `domain_memberships`.

### B. Modèles globaux avec surcharge par domaine

Ces tables nécessitent un choix global/tenant explicite, par exemple `domain_id nullable` et `is_system` :

- `roles` et `role_permissions` ;
- `reference_lists` et `reference_values` ;
- `workflow_definitions`, `workflow_states`, `workflow_transitions` ;
- `account_categories` ;
- `varieties` et `seed_suppliers` si un catalogue commun doit coexister avec les données privées.

Règle recommandée : une ligne système a `domain_id null`; une personnalisation appartient à un domaine. Les contraintes d'unicité doivent tenir compte de cette portée.

### C. Propriétés directes d'un domaine

Ajouter un `domain_id not null` après backfill :

- `farms`, `farm_zones`, `greenhouses` ;
- `campaigns`, `campaign_plantings`, `production_forecasts` ;
- `harvests`, `harvest_lots`, `harvest_lot_sources`, `harvest_tray_lines` ;
- `harvest_station_prices`, `harvest_market_prices`, `harvest_daily_status` lorsqu'elles existent dans l'environnement ;
- `markets`, `market_prices`, `clients` ;
- `sales_orders`, `sales_order_lines`, `delivery_notes` ;
- `invoices`, `payments_received` ;
- `suppliers`, `purchase_orders`, `purchase_order_lines`, `supplier_invoices`, `payments_made` ;
- `stock_items`, `stock_movements` ;
- `cost_entries`, `budget_versions`, `budget_lines`, `assets` ;
- `cultural_operations` ;
- `teams`, `workers`, `labor_entries` ;
- `payroll_periods`, `payslips`, `leave_requests`, `leave_balances`, `cnss_declarations` ;
- `alerts`, `documents` ;
- `station_settlements`, `station_settlement_lines`, `station_settlement_allocations` ;
- `chatbot_users`, `chatbot_messages` ;
- `workflow_history` ;
- `app_settings`.

Même lorsque le domaine est déductible par une relation parente, le conserver directement sur les tables transactionnelles facilite la RLS et réduit le risque de fuite. Des triggers/contraintes devront empêcher les références croisées entre domaines.

## 4. Contraintes à modifier

Les identifiants métier actuellement uniques globalement doivent devenir uniques dans le domaine :

- `farms.code` → `(domain_id, code)` ;
- `campaigns.code` → `(domain_id, code)` ;
- `varieties.code` → portée système/domaine ;
- `markets.code`, `clients.code`, `suppliers.code`, `stock_items.code` → `(domain_id, code)` ;
- `sales_orders.order_number`, `delivery_notes.dn_number`, `invoices.invoice_number`, `purchase_orders.po_number` → `(domain_id, numéro)` ;
- `workers.matricule`, périodes de paie et déclarations CNSS → portée domaine ;
- `harvest_lots.lot_number`, `assets.code`, `station_settlements.code` → portée domaine ;
- contraintes « un seul acheteur écart » et « un seul marché écart » → une ligne par domaine ;
- périodes de bordereaux → inclure `domain_id` ;
- définitions de workflow par défaut → une valeur système ou une par domaine.

Les contraintes enfants existantes, par exemple `greenhouses(farm_id, code)`, restent pertinentes mais doivent être complétées par la cohérence du `domain_id`.

## 5. RLS — risque actuel et cible

### Risque actuel

Le dump contient de nombreuses politiques de type :

- `FOR SELECT USING (true)` ;
- `FOR ALL TO authenticated USING (true)` ;
- écriture protégée uniquement par `is_admin(auth.uid())`.

Dans une architecture multi-domaines, un utilisateur authentifié pourrait donc lire les données des autres clients et un administrateur de domaine serait assimilé à un administrateur global.

### Politique cible

Pour une table tenantée :

- lecture : membre actif du domaine ;
- insertion : membre autorisé et `domain_id` accessible ;
- modification/suppression : permission du module dans ce même domaine ;
- super-administrateur : accès global explicitement séparé.

Les permissions ne doivent plus être chargées depuis `profiles.role_id`, mais depuis `domain_memberships.role_id` pour le domaine concerné.

Les vues devront soit exposer `domain_id` et respecter la RLS des tables sources, soit être recréées avec `security_invoker = true` selon la version PostgreSQL disponible.

## 6. Fonctions SQL et triggers impactés

### RPC destructives ou financières prioritaires

À adapter en premier :

- `admin_nuclear_wipe` et `admin_operational_reset` : ne jamais effacer les autres domaines ;
- `admin_delete_campaign`, `admin_bulk_delete_harvests` ;
- validation/dévalidation des bordereaux ;
- génération de factures de dispatch et bordereau ;
- pesée station et création d'écart ;
- synchronisation achats → coûts ;
- synchronisation paie → coûts ;
- amortissements et budgets.

Chaque RPC doit déduire le domaine depuis l'entité cible, vérifier l'appartenance/permission, puis limiter toutes ses requêtes à ce domaine.

### Triggers prioritaires

- génération des codes d'actif et de bordereau : séquences par domaine ;
- acheteur/marché écart unique : unicité par domaine ;
- contrôle ferme/serre des lignes budgétaires ;
- synchronisations budget, paie et achats : propagation du `domain_id` ;
- trigger de création de profil : ne doit pas accorder automatiquement un rôle global.

## 7. Edge Functions

Les fonctions suivantes utilisent la clé `service_role` et contournent la RLS :

- `workflow-transition` ;
- `purchase-order-direct` ;
- `purchase-order-receive` ;
- `admin-create-user` ;
- `daily-recap` ;
- `telegram-webhook` ;
- `ai-analyze-cpc`.

Actions requises :

- identifier l'utilisateur lorsque la fonction est interactive ;
- fournir ou déduire le domaine ;
- vérifier `domain_memberships` avant toute lecture/écriture ;
- filtrer toutes les requêtes service-role par `domain_id` ;
- associer chaque utilisateur Telegram à un domaine ;
- produire un récap quotidien séparé par domaine ;
- ne jamais accepter un `domain_id` client sans validation d'appartenance ;
- inclure le domaine dans les audits et journaux.

## 8. Frontend

### Authentification

`lib/auth.ts` doit charger :

- le profil global ;
- les appartenances actives ;
- le domaine actif ;
- le rôle et les permissions dans ce domaine.

Le `profile.role_id` actuel sera retiré de la logique métier après migration.

### Domaine actif

Créer un contexte central fournissant `activeDomain`, `memberships` et `switchDomain`. Le changement de domaine doit :

- invalider les données en mémoire ;
- recréer les abonnements Realtime ;
- naviguer vers une route sûre ;
- conserver le choix dans un cookie/session ;
- refuser tout domaine absent des appartenances.

### Requêtes

Les 56 tables/vues appelées directement constituent une surface de migration importante. La RLS reste obligatoire, mais les requêtes frontend doivent également inclure le domaine actif pour :

- éviter les agrégats inter-domaines ;
- améliorer les performances ;
- rendre explicite le contexte ;
- filtrer correctement Realtime.

Les dashboards CEO, l'assistant IA, les imports Excel, les générateurs de démonstration et les exports sont particulièrement sensibles car ils agrègent plusieurs tables.

### Paramètres

`app_settings.key` ne peut plus être global. La clé logique devient `(domain_id, key)`. Sont concernés : identité du domaine, valeurs par défaut, paramètres métier et campagne active.

## 9. Ordre de migration recommandé

### Migration A — Fondation sans rupture

- créer `domains` et `domain_memberships` ;
- ajouter le statut plateforme ;
- créer `DOM-BENHALIMA` ;
- rattacher les profils existants ;
- ajouter les helpers de sécurité sans remplacer les anciennes politiques.

### Migration B — Infrastructure pilote

- ajouter/backfiller `domain_id` sur `farms`, `farm_zones`, `greenhouses` et `app_settings` ;
- adapter les contraintes ;
- appliquer les nouvelles RLS ;
- adapter Auth, Topbar, Fermes et Serres ;
- créer un second domaine QA et exécuter les tests d'isolation.

### Migration C — Production

- catalogues/surcharges, campagnes, plantations, récoltes, lots, opérations et alertes.

### Migration D — Commerce et station

- marchés, clients, commandes, bordereaux, factures et paiements.

### Migration E — Achats, stocks et finance

- fournisseurs, achats, stocks, coûts, budgets, actifs et vues analytiques.

### Migration F — RH et intégrations

- travailleurs, paie, congés, CNSS, Telegram, IA et récapitulatifs.

### Migration G — Durcissement final

- rendre tous les `domain_id` requis ;
- retirer les anciennes politiques et helpers globaux ;
- retirer `profiles.role_id` de la logique ;
- déprécier les structures utilisateur historiques ;
- auditer les lignes orphelines et les références croisées.

## 10. Contrôles avant toute application

- sauvegarde récente et procédure de restauration testée ;
- inventaire direct de la base distante, car le dump local peut différer ;
- vérification des migrations réellement déployées ;
- comptage des lignes orphelines ;
- détection des doublons qui apparaîtront lors des changements de contraintes ;
- transaction et assertions dans chaque migration ;
- validation sur une base de staging ;
- tests RLS avec au moins deux domaines et trois profils : plateforme, admin A, utilisateur B.

## 11. Critères d'acceptation du socle

- un utilisateur mono-domaine entre directement dans son domaine ;
- un utilisateur multi-domaines peut changer de contexte ;
- son rôle peut différer selon le domaine ;
- un membre A ne peut ni lire, ni écrire, ni inférer les données B ;
- les codes métier peuvent être identiques dans deux domaines ;
- Realtime, imports, exports, IA, Telegram et resets restent limités au domaine ;
- les données actuelles restent intégralement disponibles dans `DOM-BENHALIMA` ;
- aucune RPC service-role ne permet de franchir la frontière du domaine.

