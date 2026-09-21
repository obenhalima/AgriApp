# Plan de test évolutif — FarmPilot

## Ajout du 18 septembre 2026 — lot complet 135B/135C

- SQL en ROLLBACK réussi : 15 familles, ferme/campagne/plantation, séparation demandeur/N1/N2, décisions mobiles, refus d’un niveau périmé, stock cumulatif (5 kg pour trois besoins de 2 kg), recalcul fertigation sur eau réelle, CUMP et variété, réel idempotent, manque/écart non justifié rejetés sans modification du stock, non-réalisé sans mouvement, annulation conservant l’historique, travaux sans produit et zéro mouvement, coût absent non mis à zéro puis rapprochement sur cibles d’origine, exclusion des articles phyto et accès étranger/anonyme refusé.
- Notifications : opt-in obligatoire, destinataires par niveau, déduplication, annulation de l’ancien niveau et retour au demandeur ; abonnements/file de test annulés, aucun envoi HTTP externe.
- Bundle incluant 134 manquante testé dans la même transaction annulée. Les migrations ne sont pas appliquées durablement.
- UI simulée : saisie, trois dates, unités/virgules, filtre entrepôt, réessai avec même ID, alerte manque, auto-validation non proposée, quantité réelle justifiée, validation mobile N2 à 390 px. Aucun stock ni compte métier modifié par le navigateur.
- Scripts : `check-cultural-sql.mjs` (`--bundle` ou `--after`), `test-cultural.mjs`, tests `lib/cultural.test.ts` et `lib/mobilePush.test.ts`.
- Résultat final unitaire : 134 tests / 20 fichiers réussis. Non-régression navigateur : irrigation, validation mobile irrigation/achats et centre Alertes avec filtres culturaux réussis (HTTP simulé).
- Reste : recette métier après SQL à trois comptes, envoi réel sur téléphone après publication et activation ; coût eau/énergie/main-d’œuvre et expertise agronomique hors périmètre du calcul de consommation produit.

## Ajout du 18 septembre 2026 — lot 135A, recettes de fertigation

- Réussis : 129 tests unitaires / 19 fichiers, dont 4 tests fertigation (masse, volume, unités incompatibles, nombres invalides). TypeScript sans erreur.
- SQL en transaction annulée : enregistrement sans stock, calcul serveur, lecture du solde du seul entrepôt, refus société/ferme/entrepôt étrangers, capacité révoquée, accès anonyme et écritures directes interdits, rejet cuve mère et unités incompatibles, doublons de lignes et réessais, conservation immuable de la recette. Aucun mouvement ou coût généré. Migration non appliquée durablement, absence de table vérifiée après ROLLBACK.
- Navigateur local avec HTTP Supabase simulé : filtre entrepôt, unités compatibles, virgule/espace, alerte manque, invalidation de simulation, retry du même identifiant après erreur, copie sans écrasement et bouton désactivé sans habilitation. Vue desktop et mobile 390 px réussies ; aucune donnée métier ni notification réelle.
- Scripts : `check-fertigation-recipes-sql.mjs` (puis `--after` après application), `test-fertigation-recipes.mjs`.
- Reste : appliquer 135A, recette utilisateur avec engrais réels ; lot 135B pour programmes, validations, prévision cumulative et consommation réelle. Aucun déploiement GitHub/Vercel.

## Ajout du 18 septembre 2026 — lot 134, validations mobiles irrigation

- SQL en transaction annulée : accès mobile, contexte, exclusion du demandeur, refus après révocation d’habilitation, mauvais niveau, motif trop court, audit approbation/refus, refus d’une décision répétée, notifications désactivées par défaut, destinataires, déduplication, rappels et annulation des pending après décision. Message de résultat au demandeur vérifié dans la file temporaire.
- UI simulée à 390 px : détails irrigation et litres en format français, calendrier, refus minimum 5 caractères, confirmation et un seul appel de décision, paramètre notification irrigation non activé par défaut.
- Suite unitaire : 125 tests / 18 fichiers réussis. Aucun message envoyé, aucun abonnement ou programme de test conservé.
- Scripts : `check-irrigation-mobile-sql.mjs` (option `--after` après application), `test-mobile-browser.mjs --irrigation`.
- Restent : application de 134, recette métier à deux comptes, envoi sur téléphone réel après publication et activation explicite. Aucun déploiement réalisé.

## Ajout du 18 septembre 2026 — lot 133, irrigation simple

- Réussis : 6 nouveaux tests de calcul/date (virgule, espace, valeurs invalides, litres et m³, dates invalides, doublons, intervalles, fins de mois). Suite complète : **124 tests / 18 fichiers**.
- Réussis en transaction SQL annulée : accès anonyme/étranger refusé, ferme/serres/campagne, absence d’écriture directe client, calcul serveur, produits interdits dans l’irrigation simple, création et confirmation idempotentes, auto-validation et validation sans habilitation refusées, validation figée à la soumission, confirmation avant approbation refusée, réel non écrasable, annulation du restant sans perte de l’historique, clôture automatique, absence de mouvement de stock. Test de lecture workspace également exécuté. Aucune fixture ni habilitation temporaire conservée.
- Réussis dans un navigateur local avec Supabase simulé : création récurrente, quantité décimale française, reprise du même identifiant après erreur, soumission, absence de bouton d’auto-validation, approbation et confirmation par compteur ; affichage mobile 390 px sans débordement une fois la navigation responsive stabilisée.
- Scripts : `scripts/check-irrigation-sql.mjs`, `scripts/test-irrigation.mjs`.
- Mise à jour du 18 septembre : 133 appliquée par l’utilisateur, tables et fonctions présentes vérifiées, recette SQL `--after` réussie et annulée, page locale HTTP 200.
- Restent : recette connectée avec deux utilisateurs métier, notifications réelles, validations multi-niveaux, secteurs/compteurs structurés, fertigation/stock/coûts. Aucune notification ni consommation de produit n’est implémentée dans ce lot.

## Ajout du 12 septembre 2026 — validations mobiles 119–122

- Réussis : 23 tests unitaires push/SSRF/webhook/association Telegram, TypeScript, compilation de production.
- Réussis en transaction annulée : accès personnel, refus étranger et auto-validation, code à usage unique, passage de niveau, rejet des décisions répétées, refus d'une session à mot de passe temporaire, verrou de réclamation des notifications.
- Réussi dans un navigateur mobile simulé 390 × 844 : affichage sans débordement, motif du refus obligatoire, confirmation et un seul appel de décision. Toutes les requêtes Supabase sont simulées : aucune décision métier réelle envoyée.
- Contrôlés : manifeste et icône HTTP 200 ; bot @BenhalimaFarm_bot, webhook du projet et pilote activé ; file non accessible aux rôles anon/authenticated.
- Non réalisés : réception effective push/Telegram sur téléphones réels, publication HTTPS nouvelle version, déclenchement automatique du planificateur, recette métier complète par responsables. Voir `VALIDATIONS_MOBILES_119_121.md`.

## Ajout du 11 septembre 2026 — lot 114, plan schématique

- Exécuté : 5 tests unitaires de géométrie et formatage, tous réussis (`lib/farmLayout.test.ts`).
- Exécuté : route `/plan-culture` répond HTTP 200 (ne valide pas les interactions authentifiées).
- En attente : migration 114 et recette connectée de sauvegarde/rechargement, isolation sociétés/fermes, droits lecture seule, concurrence, sélection de campagne et comparaison des récoltes.
- Scénarios détaillés : `docs/LOT_114_PLAN_FERME.md` ; contrôles SQL en lecture seule : `supabase/verification/114_farm_schematic_plan_checks.sql`.

Dernière mise à jour : 8 septembre 2026  
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

## 6. Recette roadmap RAF — Lots 1 et 2

| ID | Lot | Scénario | Résultat attendu | État | Résultat observé |
|---|---:|---|---|---|---|
| RAF-AUTH-001 | Transverse | Cliquer sur le bouton Rafraîchir après connexion | La session reste active et les données sont rechargées | Réussi | Dashboard conservé, société BENHALIMA et utilisateur Agent Test toujours actifs |
| RAF-AUTH-002 | Transverse | Rafraîchissement complet du navigateur après connexion | La session est restaurée sans retour à `/login` | Réussi | Écran INITIALISATION temporaire puis retour automatique au dashboard authentifié |
| RAF-L1-001 | 1 | Ouvrir la fiche utilisateur | Sociétés, fonctions et habilitations sont visibles | Réussi | Affectations multi-sociétés, six fonctions et onze habilitations affichées |
| RAF-L1-002 | 1 | Vérifier le cumul des fonctions | Plusieurs fonctions peuvent être sélectionnées pour la même personne | Réussi visuellement | Toutes les fonctions sont proposées sous forme de cases indépendantes |
| RAF-L1-003 | 1 | Vérifier les exceptions d’habilitation | Chaque habilitation accepte Héritée, Accorder ou Retirer | Réussi visuellement | Les trois choix sont présents pour chaque habilitation |
| RAF-L2-001 | 2 | Charger le journal des traitements | La liste s’affiche sans erreur | Réussi | Écran chargé, aucune demande existante pour BENHALIMA |
| RAF-L2-002 | 2 | Ouvrir une nouvelle prescription | Le formulaire de prescription et planification s’affiche | Réussi après correction | Formulaire affiché avec les trois modes de planification et toutes les aides de champ, sans erreur console |
| RAF-L2-003 | 2 | Sélectionner une ferme et ses serres | Seules les plantations de la ferme sont proposées, avec sélection globale | Réussi techniquement | Ferme et action « Sélectionner toutes les serres » disponibles dans le formulaire 089 |
| RAF-L2-004 | 2 | Calculer surface, bouillie et quantité prévue | Les calculs suivent les serres, le volume de référence et l’unité de dose | Prêt à exécuter | Interface et garde SQL préparées ; migration 089 à appliquer avant recette complète |
| RAF-L2-005 | 2 | Contrôler la dose prescrite | Dose minimale préremplie et dose hors plage refusée côté serveur | Prêt à exécuter | Double contrôle interface et trigger SQL préparé dans 089 |
| RAF-L2-006 | 2 | Planifier mensuellement, trimestriellement ou annuellement | Les occurrences respectent l’intervalle calendaire | Prêt à exécuter | Fonction SQL étendue dans 089 |
| RAF-L2-007A | 2 | Saisir une bouillie avec virgule et une dose par 100 L | La quantité prévue est recalculée dans l’unité du stock | Prêt à exécuter | Migration 092 à appliquer |
| RAF-L2-007B | 2 | Activer la quantité manuelle | La quantité devient modifiable et une justification est obligatoire et persistée | Prêt à exécuter | Migration 092 à appliquer |
| RAF-L2-007 | 2 | Ouvrir la liste des produits d’une prescription | Tous les produits du catalogue de la société sont affichés ; ceux sans article de stock sont signalés et non sélectionnables | Prêt à exécuter | Chargement du catalogue complet ajouté ; recette après application de 090 |
| RAF-AUTO-001 | Transverse | Exécuter les tests unitaires automatisés | Tous les tests réussissent | Réussi | 2 fichiers, 21 tests sur 21 réussis |
| RAF-AUTH-003 | Transverse | Un administrateur applique un mot de passe temporaire | Le mot de passe est remplacé, audité sans être stocké et le compte est marqué pour changement obligatoire | Prêt à exécuter | Migration 091 et fonction serveur à déployer |
| RAF-AUTH-004 | Transverse | Se connecter avec un mot de passe temporaire | L’utilisateur est limité à la page de changement, puis accède à l’application après avoir choisi son mot de passe | Prêt à exécuter | Recette après application de 091 |
| RAF-AUTH-005 | Transverse | Préparer l’e-mail du mot de passe temporaire | Le client de messagerie s’ouvre avec destinataire, objet et corps préremplis sans envoi automatique | Prêt à exécuter | Vérifier avec le client de messagerie Windows configuré |

Les contrôles SQL métier détaillés de 086, 087 et 088 restent à exécuter dans une session Supabase authentifiée ou via l’éditeur SQL.

## 7. Registre des anomalies

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
| PHYTO-001 | Traitements phytosanitaires | Bloquante | L’ouverture de « Nouvelle prescription » provoquait un écran vide : l’icône `CircleHelp` utilisée par `FieldHelp` était absente de la version installée de `lucide-react` | Corrigée et retestée |
