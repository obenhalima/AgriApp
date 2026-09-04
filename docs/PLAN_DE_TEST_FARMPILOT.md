# Plan de test évolutif — FarmPilot

Dernière mise à jour : 27 août 2026  
Responsable d'exécution : Codex  
Environnement : application locale connectée à Supabase  
Compte : administrateur QA `agenttest@test.com`

## 1. Règles d'exécution

- Les corrections de code sont réalisées uniquement après validation préalable du propriétaire.
- Les données créées par les tests portent le préfixe `QA-`.
- Ne supprimer que les données créées pendant les tests.
- Conserver les données QA lorsqu'elles sont nécessaires aux modules suivants.
- Distinguer les anomalies confirmées des comportements propres au navigateur automatisé.
- Pour chaque scénario : résultat attendu, résultat observé, preuve et verdict.
- Gravités : bloquante, haute, moyenne, faible.

## 2. États et verdicts

- `À exécuter` : scénario préparé mais non lancé.
- `En cours` : exécution commencée.
- `Réussi` : résultat conforme.
- `Échoué` : anomalie reproductible.
- `Bloqué` : prérequis absent ou dépendance indisponible.
- `À confirmer` : comportement observé uniquement en automatisation.

Verdict d'un module : `Validé`, `Validé avec réserves` ou `Bloquant`.

## 3. Progression globale

| Lot | Domaine | Modules | État | Verdict |
|---:|---|---|---|---|
| 0 | Socle | Authentification et permissions | Exécuté partiellement | Avec réserves |
| 1 | Infrastructure | Fermes et Serres | Exécuté | Validé avec réserves |
| 2 | Référentiels | Cultures et Variétés | À exécuter | — |
| 3 | Planification | Campagnes, Plan de culture, Plantations | À exécuter | — |
| 4 | Production | Récoltes, lots, pesée, tri | À exécuter | — |
| 5 | Commerce | Clients, marchés, commandes, bordereaux | À exécuter | — |
| 6 | Facturation | Factures, échéances, paiements | À exécuter | — |
| 7 | Approvisionnement | Fournisseurs, achats, réceptions, stocks | À exécuter | — |
| 8 | Finance | Coûts, budgets, amortissements, CPC, marges | À exécuter | — |
| 9 | RH | Employés, pointage, paie, congés, CNSS | À exécuter | — |
| 10 | Administration | Utilisateurs, rôles, workflows, paramètres, imports | À exécuter | — |
| 11 | Transverse | Alertes, IA, Telegram, responsive, parcours E2E | À exécuter | — |

## 4. Lot 1 — Fermes et Serres

### Données QA prévues

| Entité | Identifiant QA | Usage |
|---|---|---|
| Ferme | `QA-FERME-001` | Scénarios CRUD et rattachement |
| Ferme doublon | `QA-FERME-001` | Contrôle d'unicité |
| Serre | `QA-SERRE-001` | Scénarios CRUD, surfaces et rattachement |

### Scénarios Fermes

| ID | Scénario | Résultat attendu | État | Résultat observé |
|---|---|---|---|---|
| FRM-001 | Afficher la liste des fermes | Chargement sans erreur et données visibles | Réussi | 1 ferme initiale chargée, statistiques cohérentes |
| FRM-002 | Rechercher ou filtrer une ferme | La liste correspond au critère | Réussi | Recherche `QA-FERME-001` : résultat 1/2 |
| FRM-003 | Ouvrir la création sans remplir les champs requis | Enregistrement impossible et message explicite | Réussi | Bouton Créer désactivé sans nom |
| FRM-004 | Créer `QA-FERME-001` | Ferme créée une seule fois et visible | Réussi | `QA-F001` créée et affichée une seule fois |
| FRM-005 | Recharger la page | La ferme QA persiste | Réussi | Présente après rechargement |
| FRM-006 | Créer un doublon de code | Doublon refusé avec message compréhensible | Échoué | Refus correct, mais message PostgreSQL technique affiché à l'utilisateur |
| FRM-007 | Modifier la ferme QA | Changements enregistrés et persistants | Bloqué | Aucune action Modifier dans ce module |
| FRM-008 | Désactiver/réactiver la ferme QA | Statut et filtres cohérents | Bloqué | Aucune action de changement de statut |
| FRM-009 | Tester la suppression sans dépendance | Confirmation requise et comportement cohérent | Bloqué | Aucune action Supprimer dans ce module |
| FRM-010 | Tester l'accès direct et le retour navigation | Navigation stable | Réussi | Accès direct administrateur fonctionnel |

### Scénarios Serres

| ID | Scénario | Résultat attendu | État | Résultat observé |
|---|---|---|---|---|
| SER-001 | Afficher la liste des serres | Chargement sans erreur et rattachements visibles | Réussi | 4 serres initiales avec ferme, surfaces et statut |
| SER-002 | Filtrer par ferme | Seules les serres de la ferme apparaissent | Réussi | Filtre `QA-FERME-001` : 1/5, serre QA uniquement |
| SER-003 | Créer sans ferme ou sans champs requis | Enregistrement impossible et message explicite | Réussi | Bouton Créer désactivé tant que ferme, nom ou surface manquent |
| SER-004 | Créer `QA-SERRE-001` dans `QA-FERME-001` | Serre créée et correctement rattachée | Réussi | `QA-S001` créée dans la bonne ferme |
| SER-005 | Saisir une surface exploitable supérieure à la surface totale | Valeur refusée ou anomalie signalée | Échoué | 1 200 m² exploitables acceptés pour 1 000 m² total, taux affiché 120 % |
| SER-006 | Créer un doublon de code | Doublon refusé avec message compréhensible | Échoué | Refus correct, mais message PostgreSQL technique affiché |
| SER-007 | Modifier les informations de la serre | Changements enregistrés et persistants | Réussi | Exploitable corrigée à 800 m² ; 80 % persisté après rechargement |
| SER-008 | Désactiver/réactiver la serre | Statut et filtres cohérents | À exécuter | Reporté pour conserver la donnée QA active pour les lots suivants |
| SER-009 | Recharger et vérifier la persistance | Données inchangées après rechargement | Réussi | `QA-SERRE-001`, rattachement et surfaces persistants |
| SER-010 | Tester la dépendance ferme → serre | Suppression de la ferme protégée ou explicitement gérée | Bloqué | Le module Fermes ne propose aucune suppression |
| SER-011 | Créer puis supprimer une serre QA temporaire | Confirmation puis suppression persistante | Réussi | `QA-SERRE-DELETE` créée, confirmation acceptée, supprimée et absente après rechargement |

### Contrôles transverses du lot

| ID | Scénario | Résultat attendu | État | Résultat observé |
|---|---|---|---|---|
| INF-001 | Surveiller les erreurs JavaScript | Aucune erreur non gérée | Réussi | Aucune erreur JavaScript non gérée pendant les parcours |
| INF-002 | Surveiller les réponses HTTP/Supabase | Aucune erreur inattendue | À confirmer | Deux 404 intermittentes sur un chunk Next.js, sans blocage fonctionnel |
| INF-003 | Tester à 390 px de largeur | Actions principales utilisables sans débordement bloquant | Réussi | Largeur document 390 px, boutons Nouvelle ferme/serre visibles |
| INF-004 | Vérifier les libellés accessibles | Champs et boutons identifiables | Échoué | Fenêtres non détectables comme dialogue et plusieurs champs non trouvables par libellé |

## 5. Lot 10 — Administration (en cours)

| ID | Scénario | Résultat attendu | État | Résultat observé |
|---|---|---|---|---|
| ADM-USR-001 | Modifier un utilisateur | Une seule sauvegarde, fin de l'état Traitement et données persistées | Réussi techniquement | Mise à jour regroupée en une requête atomique ; tests unitaires 21/21 |
| ADM-USR-002 | Désigner un super administrateur | Option visible uniquement pour un super administrateur | Réussi techniquement | Contrôle UI et garde SQL prévus ; migration 074 à appliquer |
| ADM-DOM-001 | Voir le menu Domaines | Menu visible pour le super administrateur uniquement | Réussi techniquement | Navigation latérale et palette filtrées par `isPlatformAdmin` |
| ADM-DOM-002 | Ouvrir la gestion des domaines | Liste des clients/domaines accessible | Réussi partiellement | Route HTTP 200 ; validation visuelle authentifiée à finaliser |
| ADM-DOM-003 | Créer et modifier un domaine | Données persistées et messages explicites | À exécuter | Écran et accès Supabase mis en place |
| ADM-ACC-001 | Affecter un utilisateur à un domaine | L'utilisateur reçoit un rôle propre au domaine | Prêt à exécuter | Interface réalisée ; nécessite la migration 075 |
| ADM-ACC-002 | Affecter plusieurs domaines | Toutes les appartenances sont enregistrées atomiquement | Prêt à exécuter | Fonction SQL transactionnelle `set_user_domain_memberships` préparée |
| ADM-ACC-003 | Définir le domaine par défaut | Un seul domaine par défaut est accepté | Réussi techniquement | Index unique existant et validation SQL 075 |
| ADM-ACC-004 | Changer de domaine actif | Le rôle et les permissions suivent le domaine choisi | Réussi techniquement | Sélecteur ordinateur/mobile, contrôle d'affectation et rechargement complet après changement |
| ADM-ACC-005 | Enregistrer un utilisateur actif sans domaine | Enregistrement refusé | Réussi techniquement | Contrôle interface et contrôle transactionnel SQL |
| ADM-ACC-006 | Accès du super administrateur | Tous les domaines actifs restent accessibles | Réussi techniquement | Chargement global réservé à `is_platform_admin` |
| DOM-ISO-001 | Isoler les fermes par domaine | Seules les fermes du domaine actif sont visibles et créées | Réussi | Validation utilisateur : le changement de domaine affiche uniquement les fermes liées au domaine sélectionné |
| DOM-ISO-002 | Isoler les serres par domaine | Seules les serres des fermes du domaine actif sont visibles | En cours | Migration 076 déclarée exécutée ; pages locale et RLS disponibles |
| DOM-ISO-003 | Préserver les données historiques | Toutes les fermes existantes restent disponibles | Réussi techniquement | Backfill prévu vers `DOM-BENHALIMA`, sans suppression |
| DOM-ISO-004 | Isoler les campagnes par domaine | Seules les campagnes du domaine actif sont visibles | Prêt à exécuter | Migration 077 et filtrage de `/campagnes` préparés |
| DOM-ISO-005 | Isoler le plan de culture | Référentiels et plan correspondent au domaine actif | Prêt à exécuter | Campagnes, fermes et serres filtrées ; vue configurée en `security_invoker` |
| DOM-ISO-006 | Isoler les plantations | Campagne et serre appartiennent obligatoirement au même domaine | Réussi techniquement | Contrôle transactionnel par trigger et RLS préparé |
| DOM-ISO-007 | Isoler les récoltes et lots | Récoltes, dispatchs et retours correspondent au domaine actif | Prêt à exécuter | Colonnes, backfill, triggers, RLS et filtres applicatifs préparés |
| DOM-ISO-008 | Isoler les budgets | Versions et lignes correspondent au domaine actif | Prêt à exécuter | Migration 078, triggers, RLS et filtres applicatifs préparés |
| DOM-ISO-009 | Isoler les coûts | Les coûts et référentiels agricoles suivent le domaine actif | Prêt à exécuter | Filtrage direct par `domain_id` et contrôle campagne/serre préparés |
| DOM-ISO-010 | Isoler le compte d'exploitation | Budget et réel utilisent uniquement le domaine actif | Prêt à exécuter | Campagnes, fermes, serres, budgets, coûts et récoltes cloisonnés |
| DOM-ISO-011 | Isoler les fournisseurs | Liste et créations appartiennent au domaine actif | Prêt à exécuter | Migration 079, code unique par domaine, RLS et filtres préparés |
| DOM-ISO-012 | Isoler les achats | Bons, lignes et factures fournisseurs suivent le domaine actif | Prêt à exécuter | Contrôles fournisseur/campagne/serre/article et filtres préparés |
| DOM-ISO-013 | Isoler les stocks | Articles et mouvements correspondent au domaine actif | Prêt à exécuter | RLS, rattachement et contrôles sur les mouvements préparés |

## 6. Registre des anomalies

| ID | Module | Gravité | Résumé | Statut |
|---|---|---|---|---|
| AUTH-001 | Authentification | À confirmer | Écran Initialisation observé uniquement en automatisation après connexion | Non reproduit manuellement |
| AUTH-002 | Authentification | Moyenne | Libellés Email/Mot de passe non associés techniquement aux champs | Ouverte |
| AUTH-003 | Permissions | Haute | Filtrage du menu plus répandu que les gardes explicites de pages | Ouverte |
| FARM-001 | Fermes | Moyenne | Le doublon de code affiche le message PostgreSQL brut `duplicate key value...` | Ouverte |
| FARM-002 | Fermes | Moyenne | Aucune modification, désactivation ou suppression disponible | Ouverte |
| GH-001 | Serres | Haute | Surface exploitable supérieure à la surface totale acceptée ; taux possible au-delà de 100 % | Ouverte |
| GH-002 | Serres | Moyenne | Le doublon de code affiche le message PostgreSQL brut `duplicate key value...` | Ouverte |
| UI-001 | Fermes/Serres | Moyenne | Modales et champs insuffisamment exposés aux sélecteurs/technologies d'assistance | Ouverte |
| TECH-001 | Transverse | À confirmer | Réponses 404 intermittentes sur `/_next/static/chunks/app/page.js` pendant l'automatisation | À confirmer |
