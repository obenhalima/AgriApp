# Initialisation guidée — premier lot

## Disponible en local

Les champs de préparation ont été étendus sur toutes les étapes : coordonnées/surfaces/notes des fermes, statuts des serres, type/responsable/statut des entrepôts, dates et objectifs des campagnes, paramètres économiques des variétés et plantations, fiche salarié/contrat/paie/mission, conditions des partenaires, détail des articles, références de reprise, hypothèses tarifaires, version/notes budgétaires, marchés/clients prévisionnels, notes des coûts réels et effectif/heures des récoltes. Une étape optionnelle Contenants permet plusieurs types de plateaux par récolte. Les indicateurs calculés, signatures de validation et mots de passe ne sont pas des champs importables.

Profils, équipes, responsables et listes paramétrables sont chargés comme références. Les exemples Excel privilégient les références du brouillon, et les feuilles informatives incluent les dépendances transitives (entrepôt → ferme, plantation → campagne/serre/variété). Un test vérifie l’aller-retour de chaque champ déclaré dans chacune des étapes. La préparation ne remplace pas les contrôles serveur métier lors de la future intégration.

Le bouton « Modèle Excel · [étape] » exporte uniquement la saisie de l’étape ouverte, préremplie avec son brouillon. Les feuilles `Ref_` contiennent seulement les références utiles (catalogue et étapes déjà saisies) et ne sont pas importables. « Recharger cette étape » ne remplace que cette étape, après aperçu, même avec un ancien fichier complet. Un modèle d’une autre étape est refusé. Les revues des étapes indépendantes sont conservées. La sauvegarde Excel complète reste une action séparée.

Le wizard démarre désormais par « Client FarmPilot » : sélection parmi les domaines accessibles ou création d’une société pour l’administrateur plateforme. La création réutilise `createDomain`, génère un code et laisse PostgreSQL générer l’UUID. Contrairement au dossier de préparation, cette action enregistre réellement une ligne dans `domains`. Les autres profils ne peuvent pas créer de société. Après sélection, le contexte actif est changé avant d’ouvrir le dossier. Le passage à un autre client impose de nouveau cette première étape.

Menu Administration → Initialiser l’exploitation (`/admin/initialisation`). Accès limité aux administrateurs du client ou de la plateforme.

Ce premier lot est un **dossier de préparation**, pas encore un moteur d’intégration. Il couvre la saisie des fermes, serres, entrepôts, campagnes, variétés, plantations, personnel et profils demandés, partenaires, articles, stock d’ouverture, tarifs de référence, budget mensuel, prévisions commerciales, dépenses et récoltes historiques.

- Saisie directe et modèle Excel complet. Couleurs distinctes obligatoire/facultatif, exemples séparés des données importables.
- Rechargement avec aperçu et confirmation de remplacement. Isolation par identifiant du client dans le classeur.
- Contrôles de champs, références du dossier, doublons, surfaces, périodes et valeurs numériques. Cultures et variétés sont chargées depuis les référentiels partagés actifs : filtre par culture, réutilisation par identifiant, fiche existante non modifiable et choix direct dans les plantations/prévisions. Une nouvelle variété doit choisir une culture existante ; un code ou nom déjà présent pour cette culture est signalé. Les autres références doivent actuellement être présentes dans le dossier, même si elles existent déjà dans FarmPilot.
- Excel inclut les feuilles informatives `Ref_cultures` et `Ref_varietes`. L’identifiant d’une variété sélectionnée est conservé lors de l’export/rechargement. Les anciennes lignes sans identifiant utilisant un code existant doivent être remplacées par la sélection du référentiel, sans rapprochement silencieux sur le nom.
- Progression de préparation : étapes relues, erreurs bloquantes, sections optionnelles sans objet.
- Sauvegarde serveur manuelle, reprise du brouillon par client et verrou optimiste contre les écrasements concurrents. Pas de stockage local automatique de données personnelles. Exporter/sauvegarder avant de changer de page ou de client.
- Aucun compte invité, aucun achat, stock, budget, coût ou récolte créé dans les modules opérationnels.

## Migration

`supabase/migrations/141_initialization_drafts.sql` crée uniquement une table de brouillons et son RPC de sauvegarde, protégés par les droits administrateur et l’appartenance au client. Non appliquée automatiquement à la base POC partagée.

Sans cette migration, la saisie et l’échange Excel restent utilisables mais la sauvegarde serveur est indisponible et signalée. Le modèle n’est pas une sauvegarde complète de l’application.

## Suite requise pour le wizard complet

### Extension des références existantes

Le wizard charge désormais fermes, serres, entrepôts, campagnes, plantations, articles et fournisseurs du client actif, ainsi que les employés rattachés directement à ses fermes. Les cultures, variétés, catégories comptables et clients commerciaux utilisent les catalogues partagés existants de l’application. Les employés sans ferme directe ne sont pas proposés dans cette première résolution.

Les fiches existantes sont sélectionnables et verrouillées, avec conservation de leur identifiant en métadonnées (colonne masquée dans le fichier de données Excel). Les listes de références affichent les noms ; les codes de serre sont qualifiés par ferme pour éviter les collisions. Les nouvelles lignes reçoivent un code métier proposé automatiquement, modifiable. Un code vide à l’import Excel est proposé automatiquement. Aucun UUID métier n’est généré à la préparation : il devra être attribué lors de l’intégration effective en base.

Les sections financières et historiques utilisent ces références mais ne recopient pas les transactions existantes (risque de double comptage). Les profils demandés et unités restent les listes de valeurs du modèle, et les équipes restent à raccorder. Cette extension ne réalise toujours pas l’intégration métier.

1. Rapprochement aux référentiels et entités déjà existants, avec comparaison avant création. Pas de correspondance implicite sur le seul nom.
2. Réglages client, campagnes détaillées, plan importable, équipements/immobilisations, équipes et circuits de validation. Comptes via invitation, jamais par mot de passe Excel.
3. Précontrôle serveur puis intégration transactionnelle/idempotente par étape, journal des créations et possibilité de reprendre après erreur.
4. Stock d’ouverture via le parcours de mouvements et valorisation existant, après rapprochement des unités et fiches phyto.
5. Budget en version brouillon avec détail des postes, mensualisation, charges communes et clés de répartition. Les quantités × prix saisis ici ne sont pas encore matérialisés en `budget_lines`.
6. Historique via les contrôles métier existants (DAR, rapprochement analytique, justificatifs), jamais par insertion brute contournant ces contrôles.
7. Contrôles finaux de cohérence et validation d’activation. Le dossier à 100 % ne signifie pas que l’exploitation est initialisée.

## Recette

Tests unitaires et aller-retour Excel : `npx vitest run lib/initialization.test.ts`.
Contrôle TypeScript : `npx tsc --noEmit`.
Test navigateur avec Supabase entièrement simulé : `node scripts/test-initialization-browser.mjs` (saisie, revue, sauvegarde, reprise et refus utilisateur non administrateur).
Vérifier après application de 141 : accès refusé pour un utilisateur standard, isolation entre deux clients, reprise après rechargement, refus d’une sauvegarde concurrente avec ancienne révision.
