# Conception détaillée — migrations multi-domaines A et B

Date : 27 août 2026  
État : migration A (072) appliquée avec succès le 27 août 2026 ; migration B non appliquée  
Périmètre : fondation multi-domaines puis pilote Fermes, Serres et Paramètres.

## 1. Objectifs

La migration A installe le modèle d'identité multi-domaines sans modifier le comportement métier existant.

La migration B transforme Fermes, Serres et Paramètres en premier périmètre réellement isolé. Elle sert de modèle aux migrations des autres modules.

Les deux migrations doivent être :

- idempotentes ;
- transactionnelles autant que possible ;
- compatibles avec les données actuelles ;
- vérifiables avant activation ;
- sans fenêtre où une ligne métier n'appartient à aucun domaine.

### Résultat du déploiement A

- historique Supabase 001–072 synchronisé ;
- ancien doublon de version normalisé : `003_station_prices.sql` → `005_station_prices.sql` ;
- `DOM-BENHALIMA` créé et actif ;
- 6 profils actifs et 6 appartenances actives ;
- 6 appartenances par défaut, aucun doublon ;
- aucun super-administrateur plateforme attribué automatiquement ;
- compte QA reconnu administrateur de `DOM-BENHALIMA` ;
- migration B toujours en attente.

## 2. Décisions techniques

### Identité globale et autorisation locale

- `profiles` conserve l'identité globale de l'utilisateur.
- Le rôle métier quitte progressivement `profiles.role_id`.
- `domain_memberships.role_id` devient la source du rôle dans un domaine.
- `profiles.role_id` est conservé temporairement pour compatibilité, puis supprimé de la logique après migration complète.
- `profiles.is_platform_admin` identifie exclusivement l'administration de la plateforme.

### Rôles

Pour le pilote, les rôles existants restent des modèles globaux réutilisables par plusieurs domaines. Une personnalisation par domaine viendra dans une migration ultérieure via `roles.domain_id nullable`.

Cette approche évite de dupliquer immédiatement tous les rôles et permissions, tout en permettant déjà un rôle différent par appartenance.

### Domaine actif

Le domaine actif est un contexte d'interface, pas une preuve de sécurité.

- la liste autorisée vient de `domain_memberships` ;
- le domaine par défaut est stocké par `is_default` ;
- le dernier choix peut être mémorisé côté navigateur/cookie ;
- la RLS vérifie toujours l'appartenance indépendamment du choix frontend.

### Domaine des tables enfants

`farms`, `farm_zones`, `greenhouses` et `app_settings` reçoivent directement `domain_id`. Une contrainte/trigger garantit qu'une serre et sa ferme ont le même domaine.

## 3. Migration A — fondation

Nom proposé : `072_multi_domain_foundation.sql`.

### 3.1 Table `domains`

Colonnes proposées :

| Colonne | Type | Règle |
|---|---|---|
| `id` | UUID | PK, UUID généré |
| `code` | VARCHAR(50) | obligatoire, unique globalement, normalisé en majuscules |
| `name` | VARCHAR(180) | obligatoire |
| `legal_name` | VARCHAR(255) | facultatif |
| `address` | TEXT | facultatif |
| `city` | VARCHAR(100) | facultatif |
| `region` | VARCHAR(100) | facultatif |
| `country` | VARCHAR(100) | défaut `Maroc` |
| `currency` | VARCHAR(3) | défaut `MAD` |
| `timezone` | VARCHAR(80) | défaut `Africa/Casablanca` |
| `locale` | VARCHAR(10) | défaut `fr-MA` |
| `logo_url` | TEXT | facultatif |
| `is_active` | BOOLEAN | obligatoire, défaut vrai |
| `created_at` | TIMESTAMPTZ | défaut `now()` |
| `updated_at` | TIMESTAMPTZ | défaut `now()` |

Contrôles : code non vide, devise sur trois caractères et fuseau non vide.

### 3.2 Table `domain_memberships`

| Colonne | Type | Règle |
|---|---|---|
| `id` | UUID | PK |
| `domain_id` | UUID | FK `domains`, suppression restrictive |
| `user_id` | UUID | FK `profiles`, suppression cascade |
| `role_id` | UUID | FK `roles`, suppression restrictive |
| `is_active` | BOOLEAN | défaut vrai |
| `is_default` | BOOLEAN | défaut faux |
| `invited_at` | TIMESTAMPTZ | facultatif |
| `activated_at` | TIMESTAMPTZ | facultatif |
| `created_at` | TIMESTAMPTZ | défaut `now()` |
| `updated_at` | TIMESTAMPTZ | défaut `now()` |

Contraintes/index :

- unique `(domain_id, user_id)` ;
- index sur `user_id`, `domain_id`, `role_id` ;
- index unique partiel sur `user_id WHERE is_default` pour limiter à un défaut ;
- une appartenance par défaut doit également être active, vérifié par contrainte.

### 3.3 Profil plateforme

Ajouter `profiles.is_platform_admin boolean not null default false`.

Aucun utilisateur existant ne devient automatiquement super-administrateur. L'attribution initiale devra être une décision explicite et contrôlée.

### 3.4 Domaine initial

Insérer de manière idempotente :

- `code = DOM-BENHALIMA` ;
- `name = Domaine BENHALIMA` ;
- `country = Maroc` ;
- `currency = MAD` ;
- `timezone = Africa/Casablanca` ;
- `locale = fr-MA`.

L'identifiant est récupéré par le code, jamais supposé constant.

### 3.5 Backfill des appartenances

Pour chaque profil actif :

- créer une appartenance active à `DOM-BENHALIMA` ;
- reprendre `profiles.role_id` ;
- marquer cette appartenance comme domaine par défaut ;
- si le rôle est absent, ne pas inventer un administrateur : utiliser un rôle minimal explicitement identifié ou bloquer la migration avec un rapport.

La stratégie recommandée est de bloquer si un profil actif n'a aucun rôle, afin d'éviter une attribution silencieuse trop permissive.

### 3.6 Helpers SQL

#### `is_platform_admin(p_user_id uuid)`

Retourne vrai uniquement pour un profil actif avec `is_platform_admin = true`.

#### `is_domain_member(p_domain_id uuid, p_user_id uuid)`

Vérifie simultanément : domaine actif, profil actif et appartenance active.

#### `is_domain_admin(p_domain_id uuid, p_user_id uuid)`

Joint l'appartenance au rôle actif et vérifie `roles.is_admin`.

#### `has_domain_permission(...)`

Le super-administrateur passe explicitement. Sinon, la fonction joint l'appartenance, le rôle et `role_permissions` pour le domaine demandé.

#### `current_user_domain_ids()`

Retourne seulement les domaines actifs de `auth.uid()`.

Toutes ces fonctions :

- utilisent `SECURITY DEFINER` uniquement si nécessaire ;
- fixent `search_path = public` ;
- qualifient les tables ;
- ne dépendent jamais d'un domaine stocké uniquement dans le navigateur.

### 3.7 RLS de fondation

`domains` :

- membre : lecture de ses domaines actifs ;
- super-administrateur : toutes opérations ;
- création d'un domaine : super-administrateur seulement.

`domain_memberships` :

- utilisateur : lecture de ses appartenances ;
- administrateur d'un domaine : lecture/gestion des appartenances de ce domaine ;
- un admin de domaine ne peut pas accorder le statut plateforme ;
- super-administrateur : toutes opérations.

### 3.8 Compatibilité après migration A

L'application continue à lire `profiles.role_id`. Aucun écran ne change encore. Les nouvelles tables peuvent être vérifiées sans affecter le fonctionnement actuel.

## 4. Migration B — pilote Infrastructure

Nom proposé : `073_multi_domain_infrastructure.sql`.

### 4.1 Colonnes ajoutées

- `farms.domain_id uuid` ;
- `farm_zones.domain_id uuid` ;
- `greenhouses.domain_id uuid` ;
- `app_settings.domain_id uuid`.

Déroulement pour chaque table :

1. ajouter la colonne nullable ;
2. backfiller avec `DOM-BENHALIMA` ;
3. vérifier qu'il ne reste aucun NULL ;
4. ajouter FK et index ;
5. rendre la colonne obligatoire.

### 4.2 Cohérence relationnelle

- `farm_zones.domain_id` doit correspondre à `farms.domain_id` ;
- `greenhouses.domain_id` doit correspondre à `farms.domain_id` ;
- si `greenhouses.zone_id` est renseigné, la zone doit appartenir à la même ferme et au même domaine.

Solution recommandée : clés uniques composites sur `(id, domain_id)` et FK composites pour garantir la cohérence directement dans PostgreSQL, plutôt qu'une validation uniquement applicative.

### 4.3 Contraintes d'unicité

- retirer l'unicité globale de `farms.code` ;
- créer unique `(domain_id, code)` ;
- conserver unique `(farm_id, code)` pour les serres ;
- `app_settings` passe d'une PK simple `key` à une PK/unique `(domain_id, key)`.

Pour `farm_zones`, ajouter unique `(farm_id, code)` si les données existantes le permettent.

### 4.4 Migration de `app_settings`

Toutes les clés existantes sont rattachées à `DOM-BENHALIMA` :

- `organization` ;
- `defaults` ;
- `current_campaign_id` ;
- `business_params` ;
- toute autre clé présente.

L'identité principale du domaine peut rester temporairement dans `app_settings.organization`, même si certains champs existent aussi dans `domains`. À terme :

- `domains` contient identité et paramètres structurels ;
- `app_settings` contient préférences métier et interface.

### 4.5 RLS pilote

Pour `farms`, `farm_zones`, `greenhouses`, `app_settings` :

- SELECT si membre actif du domaine ;
- INSERT si permission `module.create` et `domain_id` accessible ;
- UPDATE si permission `module.edit` ;
- DELETE si permission `module.delete` ;
- administrateur du domaine autorisé ;
- super-administrateur autorisé.

Le code exact des modules devra correspondre aux codes réellement présents (`fermes`, `serres`, paramètres). Une assertion préalable vérifiera leur existence.

### 4.6 Ancien helper `is_admin`

Il reste temporairement disponible pour les modules non migrés. Dans le pilote :

- Fermes/Serres utilisent les nouveaux helpers ;
- les autres tables conservent leurs politiques existantes ;
- `is_admin` n'est supprimé qu'après migration de tous les modules.

Cette coexistence doit être clairement bornée : une nouvelle table tenantée ne doit jamais utiliser l'ancien helper global.

## 5. Contrat frontend pilote

### `AuthState` cible

Ajouter conceptuellement :

- `memberships` ;
- `domains` ;
- `activeDomain` ;
- `activeMembership` ;
- rôle et permissions du domaine actif ;
- `switchDomain(domainId)`.

`isAdmin` signifie alors « administrateur du domaine actif ». Un nouveau `isPlatformAdmin` garde le sens global.

### Sélection initiale

Ordre :

1. dernier domaine mémorisé s'il est encore autorisé ;
2. appartenance `is_default` ;
3. première appartenance active ;
4. aucun domaine : écran explicite, aucune requête métier.

### Requêtes pilote

Les helpers deviennent explicites :

- `getFarms(domainId)` ;
- `getSerres(domainId)` ;
- toutes les insertions incluent `domain_id` ;
- mises à jour/suppressions filtrées par `id` et `domain_id` ;
- paramètres lus par `(domain_id, key)`.

Même si la RLS suffit à la sécurité, ce double filtre évite les erreurs fonctionnelles et améliore les plans de requête.

### Topbar

Ajouter un sélecteur de domaine :

- masqué si une seule appartenance ;
- visible si plusieurs ;
- nom et logo du domaine actif ;
- changement déclenchant invalidation des données, Realtime et navigation vers `/`.

### Realtime

Les abonnements des tables tenantées doivent inclure un filtre `domain_id=eq.<activeDomainId>` et être recréés au changement de domaine.

## 6. Séquence de déploiement

1. sauvegarde vérifiée ;
2. appliquer A sur staging ;
3. contrôler domaines et appartenances ;
4. déployer frontend compatible A mais encore mono-domaine ;
5. appliquer B sur staging ;
6. déployer frontend pilote ;
7. créer `DOM-QA-ISOLATION` et ses utilisateurs QA ;
8. exécuter les tests croisés ;
9. seulement ensuite répéter en production.

Ne jamais déployer le frontend filtrant par `domain_id` avant que le backfill soit terminé, ni activer les RLS B avant que le frontend envoie le domaine.

## 7. Contrôles SQL obligatoires

Avant A :

- profils actifs sans rôle ;
- rôles inactifs encore attribués ;
- profils dupliqués ou absents pour des utilisateurs Auth.

Après A :

- chaque profil actif possède une appartenance active ;
- une seule appartenance par défaut par utilisateur ;
- aucun membre ne référence un rôle/domaine inactif ;
- `is_domain_member` retourne les résultats attendus pour les comptes QA.

Avant B :

- doublons de `farms.code` ;
- zones incohérentes ;
- serres dont la ferme est absente ;
- paramètres sans clé ou doublons potentiels.

Après B :

- aucun `domain_id` NULL ;
- aucune relation croisée entre domaines ;
- mêmes nombres de fermes, zones, serres et paramètres qu'avant ;
- mêmes sommes de surfaces ;
- données actuelles uniquement dans `DOM-BENHALIMA`.

## 8. Tests d'isolation

Profils :

- `platform_admin` ;
- `admin_benhalima` ;
- `operateur_benhalima` ;
- `admin_qa` ;
- `multi_domain_user` avec rôles différents.

Scénarios incontournables :

- A ne voit pas les fermes et serres de B ;
- A ne peut pas obtenir B par ID direct ;
- A ne peut pas insérer avec `domain_id = B` ;
- A ne peut pas rattacher une serre de A à une ferme de B ;
- deux domaines peuvent utiliser le même code de ferme ;
- paramètres `organization` distincts ;
- changement de domaine vide les données précédentes ;
- Realtime B ne remonte pas chez A ;
- un rôle admin dans A ne confère aucun droit admin dans B ;
- plateforme voit et administre les deux domaines.

## 9. Retour arrière

### A

La migration A est additive. Retour simple tant qu'aucun module ne dépend des nouvelles tables : désactiver les nouvelles politiques, puis retirer tables/helpers après export de contrôle.

### B

Une fois les contraintes d'unicité modifiées, le rollback ne doit pas supprimer `domain_id`. La stratégie sûre est :

- restaurer temporairement les anciennes politiques ;
- redéployer le frontend précédent ;
- conserver les colonnes ajoutées ;
- ne rétablir les unicités globales qu'après vérification qu'aucun doublon inter-domaines n'existe.

Une restauration complète de sauvegarde reste la solution pour un retour total.

## 10. Points à approuver avant implémentation

1. Rôles globaux réutilisables pendant le pilote, personnalisation par domaine dans une étape ultérieure.
2. Aucun super-administrateur attribué automatiquement par la migration.
3. Domaine initial `DOM-BENHALIMA` et domaine de test `DOM-QA-ISOLATION`.
4. Ajout direct de `domain_id` aux tables enfants pour défense en profondeur.
5. Déploiement progressif A puis B, d'abord sur staging.
6. Conservation temporaire de `profiles.role_id` et de l'ancien `is_admin` pour les modules non encore migrés.
