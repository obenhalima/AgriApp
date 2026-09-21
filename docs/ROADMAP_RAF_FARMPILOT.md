# Roadmap du reste à faire FarmPilot

## Parcours complet cultural — 135B/135C, 18 septembre 2026

- Préparé en local pour les 15 familles hors irrigation eau seule : brouillon, dates/récurrences, produits ou sans produit, recette fertigation figée, validation 0/1/2 niveaux par famille, demandeur et validateurs distincts, réel par occurrence, non-réalisé motivé, annulation et copie/replanification.
- Stock par entrepôt de la ferme, disponibilité cumulée par date, planification sans stock, blocage du réel insuffisant, idempotence, recalcul sur eau/surfaces réelles et justification des écarts. Les articles phyto sont exclus côté serveur.
- CUMP et ventilation réelle campagne/serre/variété à la consommation ; prix absent en attente de rapprochement. Validation mobile/notifications raccordées ; alertes de retard et de stock au centre, horizon par famille 15 jours par défaut.
- Migration 135A constatée appliquée. Bundle `outputs/sql/135_interventions_culturales_complet.sql` : 134 conditionnelle + 135B + 135C dans une transaction, testé par ROLLBACK, **pas appliqué durablement**. Aucun déploiement GitHub/Vercel/Edge ni notification externe.
- Vérifications : SQL métier/droits/coûts/mobile en transaction annulée, UI mockée desktop/mobile ; détails dans `docs/LOT_135_INTERVENTIONS_CULTURALES_COMPLET.md`.
- Reste de mise en service : exécuter le bundle, recette à comptes distincts et vrais articles, publication puis activation des notifications et réception réelle téléphone. Expertise agronomique automatique (injection/EC/pH/compatibilités), compteurs, main-d’œuvre/eau/énergie et corrections des réalisés ne sont pas présentés comme livrés.

## Recettes de fertigation — lot 135A, 18 septembre 2026

- Préparé en local : recettes par ferme avec habilitation dédiée, engrais actifs hors phyto, concentrations de solution finale, conversions compatibles et simulation du besoin dans l’entrepôt de la ferme.
- Stock manquant signalé sans bloquer l’enregistrement ; recette immuable, copie et nouvelles tentatives sans doublon. Pas de dose arbitraire ni de conversion masse/volume.
- SQL testé en transaction annulée ; migration 135A à appliquer, dépend de 133 (pas de 134). Aucun mouvement/coût, notification ou déploiement créé.
- Reste **135B** : planification et recette figée, validation/mobile, disponibilité cumulée, consommation réelle et imputation au CUMP. La simulation 135A ne réserve pas le stock. Détail : `docs/LOT_135A_RECETTES_FERTIGATION.md`.

## Validations mobiles irrigation — lot 134, 18 septembre 2026

- Préparé en local : programmes d’irrigation dans Mes validations, contexte complet (serres, eau, dates, consignes), décision serveur sans auto-validation, accès à la fiche du bon client/programme.
- Réutilisation de la file et du planificateur existants : destinataires habilités par ferme, rappels configurables, déduplication, annulation des notifications obsolètes et résultat au demandeur.
- Activation explicite obligatoire par société ; désactivée par défaut tant que l’interface n’est pas publiée. Aucun nouveau canal, aucun envoi réel pendant les tests.
- Recette SQL annulée réussie ; navigateur mobile simulé irrigation validé ; suite unitaire 125 tests. Migration 134 préparée, non appliquée durablement. Aucun push GitHub/Vercel ni déploiement Edge.
- Reste : application après accord, recette à deux comptes, publication puis activation/envoi réel contrôlé ; multi-niveaux, fertigation/stock/coûts. Détail : `docs/LOT_134_VALIDATIONS_MOBILES_IRRIGATION.md`.

## Interventions culturales — lot 133, 18 septembre 2026

- Premier lot préparé en local : entrée Production → Interventions culturales, programme d’irrigation eau seule par ferme/campagne/serres, dates ou récurrence, brouillon, soumission, validation par un autre utilisateur habilité, réalisé par occurrence et annulation du restant sans perte d’historique.
- Eau : volume saisi, estimation durée × débit ou mesure compteur en m³ convertie en litres. Affichage français à deux décimales, pas de débit/volume par défaut arbitraire. Volume global par occurrence, non ventilé par serre.
- Validation activable par société (administrateur), un niveau, figée à la soumission. Habilitations planifier/valider/confirmer associées aux fonctions existantes, respect des périmètres ferme et société.
- Référentiel de cadrage des autres familles affiché en « À venir » ; pas encore administrable en base.
- Vérification : 124 tests unitaires, recette SQL réussie et entièrement annulée, interface desktop/mobile 390 px avec backend simulé réussie. Migration 133 **appliquée par l’utilisateur le 18 septembre**, schéma vérifié et recette SQL post-application réussie avec ROLLBACK ; interface locale HTTP 200. Reste la recette utilisateur à deux comptes. Aucun push GitHub/Vercel.
- Prochains sous-lots : secteurs/compteurs et ventilation serre ; révisions de programme ; validations multi-niveaux et notifications mobiles ; fertigation (recettes, stocks, réel, coûts) ; auxiliaires/pièges ; hygiène et travaux culturaux.
- Détail, habilitations, limites et recette : `docs/LOT_133_INTERVENTIONS_IRRIGATION.md`.

## Révision des prescriptions après remplacement — lot 132, 16 septembre 2026

- Bouton depuis un remplacement réceptionné : choix des occurrences futures de la même ferme/cible, dose et quantité recalculées, nouvelle validation obligatoire. Annulation explicite des seules anciennes occurrences sélectionnées ; historique et autres occurrences préservés.
- Préparé en local, TypeScript et navigateur simulé validés. Recette SQL complète en transaction annulée réussie ; aucune prescription métier ni stock modifié. Accord d’application reçu ; tentatives bloquées par les connexions Supabase. Après redémarrage du 18 septembre, absence de table/fonctions 132 vérifiée : migration toujours non appliquée, à reprendre séparément. Aucun push GitHub ni Vercel.
- Détail et limites : docs/LOT_132_REVISION_PRESCRIPTIONS_REMPLACEMENT.md.

## Correctif remplacement : même cible biologique — lot 131

- Filtre local limité aux cibles du produit commandé dans la liste Station active ; cible unique automatique, choix explicite si plusieurs. Changer de ligne ou de cible efface le remplaçant sélectionné.
- Migration 131 préparée pour vérifier la cible commune côté serveur à la demande, à l’accord et à la réception. Non appliquée ; accord requis pour la base Supabase partagée. Aucun push/déploiement.
- Le BDC ne stockant pas la cible d’une prescription source, elle n’est pas inventée : choix dans les cibles du produit commandé. Si ce lien manque, corriger le référentiel avant remplacement.

## Remplacement fournisseur — lot 130, préparation locale

- Demande, accord phyto sans auto-validation et réception du nouvel article préparés ; historique et quantités commandées/livrées distinctes. Aucune modification automatique des prescriptions.
- Code testé localement avec backend simulé ; 115 tests unitaires et TypeScript réussis. Migration 130 appliquée à la base unique Supabase après accord utilisateur. Recette SQL complète annulée réussie avant/après application (acteurs réels, achat temporaire, refus des contournements, stock/quantité/prix et idempotence) ; aucune donnée métier de test persistée. Recette utilisateur dans le navigateur connecté à réaliser. Aucun push GitHub ni déploiement Vercel.
- Surcoût : règle proposée de nouveau BDC soumis à validation achat. Notifications automatiques et intégration à Mes validations restent à compléter pour ce processus.
- Détails : docs/LOT_130_REMPLACEMENTS_FOURNISSEURS.md.

## Règle de livraison validée — 14 septembre 2026

- Application et tests d’abord en local ; base unique sur Supabase, toute migration affectant cette base partagée nécessite un accord explicite.
- Présentation et recette utilisateur avant tout nouvel envoi GitHub / déploiement Vercel.

## Refonte du dashboard Performance — 14 septembre 2026

- Trame visuelle alignée sur le Dashboard existant : KPI colorés, filtres dynamiques, progression des récoltes cumulée/par période (semaine/mois), comparaison graphique et répartition des charges.
- Contrôles de qualité et ratios pondérés conservés. Détail et consultation mobile disponibles. Aucune migration SQL supplémentaire.
- 106 tests unitaires et recette navigateur simulée validés ; données métier inchangées.

## Performance & rentabilité — lot 129, 14 septembre 2026

- Nouvel écran Finance → Performance & rentabilité : filtres client/campagne/période/ferme/variété, comparaisons variétés/serres/fermes, synthèse du périmètre, tris rendement/coût/kg/marge, détail charges/récoltes/consommations.
- Allocation partagée avec le rapport de valorisation, réalisée avant les filtres locaux ; ratios pondérés, budget séparé du réalisé, CA estimé distinct du CA saisi en station (pas une facturation ni un encaissement).
- Cycles non terminés exclus du classement par défaut ; suspension financière sur sorties en attente/coûts non répartis ; absence de coûts/prix/récoltes signalée. L’exhaustivité métier des charges n’est jamais certifiée automatiquement.
- Migration 129 appliquée. 103 tests unitaires, TypeScript, recette SQL annulée et parcours navigateur PC/mobile réussis. Commit `0d9fef4` poussé ; déploiement Vercel déclenché. Documentation : `docs/LOT_129_PERFORMANCE_RENTABILITE.md`.

## Correction de la confirmation du stock — 14 septembre 2026

- Commit `11252cf` : fenêtres natives de prix/justificatif remplacées par un dialogue explicite (article, entrepôt, quantité, prix et valeur calculée). Validation détaillée du prix et du justificatif de 5 caractères minimum, erreurs serveur dans le dialogue, attente bornée à 30 secondes.
- Prix existant prérempli pour confirmation ; stock sans prix valorisable. Quantités et anciennes consommations non modifiées par cette action. Section Stock conservée ouverte après actualisation, message de réussite et statut rechargé.
- TypeScript et 93 tests unitaires réussis. Navigateur avec données simulées : prix manquant, justificatif court, virgule décimale, erreur serveur, conservation de saisie, confirmation prix existant et actualisation des statuts vérifiés.
- Recette SQL sur les quatre stocks BENHALIMA sans valorisation réussie, intégralement annulée. Aucun prix réel inventé/enregistré. Déploiement Vercel déclenché.

## Import draw.io et initialisation des serres — lot 128, 14 septembre 2026

- Correctif `deca0d9` : chargement du profil différé hors du callback d’authentification, délai applicatif indépendant de l’AbortSignal (30 s), état d’attente/erreur également visible près du bouton ; retry idempotent conservé. 93 tests, TypeScript et navigateur avec session expirée réussis. Test SQL avec le fichier complet et 29 créations annulé avec succès. Déploiement Vercel déclenché.

- Import depuis le plan de la ferme sélectionnée : correspondances par code, rattachement aux serres de cette ferme ou création avec code, nom, type, statut et surfaces officielles. Préparation groupée des créations manquantes.
- Autres éléments du dessin conservés comme décor, sans création implicite d’entrepôts/équipements. Surfaces existantes et plantations inchangées ; plantations des nouvelles serres à préparer séparément.
- Enregistrement atomique, droits fermes/edit + serres/create, contrôle de révision et reprise idempotente après coupure réseau.
- Migration 128 appliquée. 90 tests unitaires, TypeScript, compilation de production et recette SQL annulée réussis. Navigateur simulé : 29 serres et 120 autres éléments du fichier 114, création/rattachement, surface obligatoire et reprise réseau vérifiés.
- Commit `2dcf2ef` envoyé sur GitHub. Aucune serre réelle initialisée automatiquement ; surfaces officielles à renseigner lors de l’import. Procédure : `docs/LOT_128_IMPORT_DRAWIO.md`.

## Prescriptions multicibles — lot 125, 14 septembre 2026

- Une cible biologique vérifiée par ligne, choisie avant le produit. Liste filtrée par cible et liste Station active ; changer une cible efface seulement sa ligne.
- Dose, unité, DAR et délai de rentrée hérités de l’usage de cette ligne ; quantités recalculées avec le volume commun. Un produit ne figure qu’une fois pour éviter le double dosage ; la compatibilité du mélange reste à vérifier par le prescripteur.
- Migration 125 préparée : cible et nom canonique conservés sur chaque produit et occurrence, contrôles serveur, accords Station et calcul DAR adaptés. Anciennes prescriptions et historiques non réécrits.
- Tests : TypeScript, 75 unitaires et recette SQL transactionnelle annulée réussis ; navigateur PC avec données simulées, soumission multicible sans stock vérifiée.
- Migration 125 appliquée et recette SQL rejouée après application : 26 prescriptions existantes inchangées, aucune donnée de recette conservée. Parcours navigateur PC et mobile simulés validés, compilation de production réussie. Commit `abfe62d` publié ; formulaire multicible vérifié dans les scripts servis sur `https://agri-app-orpin.vercel.app/agronomie/traitements` (HTTP 200). Recette métier utilisateur à réaliser. L’import global Excel des fermes 114 et Benhalima est un chantier distinct.

## Plan interactif de ferme — lot 114, 11 septembre 2026

- Premier lot développé : onglet Plan de la ferme, grille sans fond, placement des serres existantes, déplacement, dimensions graphiques, rotation, sauvegarde par ferme et consultation culture/production par campagne.
- Surfaces officielles inchangées ; droits `fermes.edit` et contrôle serveur, anti-écrasement concurrent. SQL 114 à appliquer manuellement ; recette connectée en attente.
- Suite : travaux/traitements et alertes au clic, puis CA/coûts/marges avec règles d'affectation ; cartographie avancée ultérieure. Aucun indicateur financier fictif dans ce premier lot.
- Procédure et recette : `docs/LOT_114_PLAN_FERME.md`.

## Telegram — lot 113, 10 septembre 2026

- Pilote sécurisé préparé : invitations personnelles liées à un employé actif et à sa ferme/société, consommation atomique du code (7 jours), révocation, vérification du périmètre à chaque message, conversations privées uniquement.
- Écran `/rh/chatbot` limité à la société sélectionnée ; génération/révocation réservées aux administrateurs de cette société via RPC.
- 13 tests unitaires du webhook pilote réussis. SQL 113 et déploiement des deux fonctions non exécutés ; recette avec deux comptes Telegram à réaliser.
- Les anciennes commandes métier et les récapitulatifs globaux sont neutralisés dans le code à déployer, pas encore sur le serveur distant. Le bot n'est pas déclaré activé.
- Reste à faire : migrer les parcours récoltes/pointage, puis station/tri/prix avec permissions et idempotence ; récapitulatifs séparés par ferme/client ; vocal après sécurisation. Ne pas réexposer les handlers historiques.
- Procédure : `docs/TELEGRAM_ACTIVATION_ET_INVITATIONS.md`.

## Suivi des sous-lots stocks — 9 septembre 2026

- 106A : référentiel entrepôts livré.
- 106B : quantités/seuils par entrepôt livrés, filtre corrigé.
- 106C : préparation des articles depuis les listes positives livrée.
- 106D : transferts livrés, application SQL et recette à confirmer.
- 107A : prévision par occurrence préparée, application SQL et recette en attente.
- 107B : planification sans article de stock, alertes par occurrence et rattachement des articles préparés ; migration 107b_plan_without_stock.sql et recette connectée en attente. Voir docs/LOT_107B.md. Notifications automatiques d'approvisionnement non incluses.

Détails et critères de recette : docs/LOT_106B.md, LOT_106C.md, LOT_106D.md et LOT_107A.md.

## Objet

### À réaliser — Alertes de stock des traitements planifiés

- Décision validée : délai d'anticipation de **15 jours par défaut**, paramétrable par client/société.
- Alimenter la page Alertes avec une alerte par occurrence ayant un stock insuffisant dans l'entrepôt prévu, en tenant compte des besoins des occurrences antérieures.
- Afficher date, ferme, entrepôt, produit, quantité nécessaire et manque ; liens vers prescriptions et transferts.
- Inclure les occurrences en retard encore à réaliser ; exclure celles annulées ou exécutées.
- Recalcul à l'ouverture et à l'actualisation ; disparition de l'alerte dès couverture du besoin. Pas d'email automatique dans ce lot.
- Statut : planifié, non implémenté. Priorité immédiate : correction du chargement des bons d'achat.

Ce document constitue le référentiel vivant du reste à faire de FarmPilot à la suite de la réunion des responsables des fermes Ajana et Benhalima. Il enregistre les décisions métier, l’ordre des chantiers, leur état et leurs critères de validation.

Dernière mise à jour : 8 septembre 2026

## Légende des statuts

- À cadrer : les règles métier doivent encore être précisées.
- Prêt : les décisions nécessaires sont prises.
- En cours : conception ou réalisation commencée.
- À valider : réalisation terminée en attente de validation métier.
- Terminé : validé et utilisable.

## Décisions métier validées

1. Une personne ne peut jamais valider une demande qu’elle a elle-même saisie.
2. Le responsable phytosanitaire peut prescrire et valider un traitement, mais pas valider sa propre prescription.
3. Le responsable d’exploitation ne constitue pas obligatoirement un second niveau. Le nombre de niveaux reste paramétrable par société et par type de processus.
4. Le responsable phytosanitaire confirme l’application réelle du traitement.
5. Le contrôle DAR bloque strictement la récolte. Une dérogation reste possible pour une personne possédant l’habilitation spécifique correspondante.
6. L’autorisation d’une dérogation DAR constitue une habilitation indépendante des rôles généraux.
7. La gestion de la paie est activable ou désactivable par société. Lorsque la paie est désactivée, les coûts de main-d’œuvre restent saisissables ou importables manuellement.
8. FarmPilot doit gérer les bons de livraison clients. Les bons de livraison fournisseurs restent des documents externes pouvant être joints aux achats ou réceptions.
9. Les certifications détaillées seront traitées ultérieurement. Le modèle devra toutefois prévoir un canevas standard extensible.
10. Une même personne peut cumuler les fonctions de responsable phytosanitaire et de chargé d’irrigation, notamment dans les petites exploitations.
11. L’applicateur et l’ouvrier restent des acteurs traçables, sans obligation de disposer d’un compte de connexion.

## Roadmap consolidée

| Lot | Chantier | Priorité | Statut | Dépendance principale |
|---|---|---:|---|---|
| 1 | Fonctions, habilitations et séparation saisie validation | Critique | Terminé | Socle multi-sociétés |
| 2 | Workflow complet des traitements phytosanitaires | Critique | À valider | Lot 1 |
| 3 | Blocage DAR et dérogations habilitées | Critique | En cours : 3A préparé (112), SQL et recette en attente ; 3B à réaliser | Lots 1 et 2 |
| 4 | Planification hebdomadaire et opérations culturales | Haute | Prêt | Lot 1 |
| 5 | Bons de livraison clients et expéditions | Haute | Prêt | Récoltes, commandes et facturation |
| 6 | Modularisation RH, pointage et paie | Haute | Prêt | Paramètres par société |
| 7 | Irrigation, fertigation et suivi climatique | Haute | Prêt | Lot 1 et planification |
| 8 | Canevas standard des certifications | Moyenne | À cadrer | Gestion documentaire |
| 9 | Tableaux de bord consolidés | Moyenne | À cadrer | Lots opérationnels |

## Lot 1 Fonctions habilitations et séparation saisie validation

### Objectif

Déterminer sans ambiguïté qui occupe chaque fonction dans chaque société ou ferme, quelles actions cette personne peut réaliser et qui peut valider chaque étape. Le modèle doit autoriser le cumul de fonctions sans confondre fonction métier, rôle d’accès et compte utilisateur.

### État existant

- Les rôles donnent des permissions par module et par action.
- Les utilisateurs peuvent appartenir à plusieurs sociétés avec un rôle par société.
- Les circuits de validation permettent de choisir un rôle responsable et un à trois niveaux.
- Le moteur transversal interdit déjà au demandeur de valider sa propre demande.
- Certains anciens workflows utilisent encore des contrôles de responsable spécifiques et doivent être harmonisés.
- Il n’existe pas encore de fonction métier affectée à un utilisateur pour une ferme et une période.
- Il n’existe pas encore de catalogue d’habilitations métier indépendantes des permissions d’écran.

### Conception retenue

#### Fonctions métier

Catalogue initial :

- responsable d’exploitation et technique ;
- responsable phytosanitaire ;
- responsable fertigation ;
- chargé d’irrigation ;
- caporal ou responsable des travaux ;
- gestionnaire administratif, traçabilité et stocks.

Une personne peut cumuler plusieurs fonctions. Une affectation possède une société, éventuellement une ferme, une date de début, une date de fin et un statut actif.

#### Habilitations métier

Catalogue initial :

- prescrire un traitement ;
- valider un traitement ;
- confirmer une application ;
- autoriser une dérogation DAR ;
- demander une sortie de stock ;
- valider une sortie de stock ;
- exécuter une sortie de stock ;
- demander un achat ;
- valider un achat ;
- valider un pointage ;
- clôturer une période de paie.

Une habilitation peut provenir d’une fonction, puis être accordée ou retirée explicitement à un utilisateur dans une société et éventuellement une ferme.

#### Séparation des tâches

- Le demandeur ou prescripteur ne peut valider aucun niveau de sa propre demande.
- Une personne ne peut prendre qu’une décision par demande, même si elle possède plusieurs fonctions.
- Les niveaux de validation s’exécutent dans l’ordre.
- Chaque niveau peut viser une fonction, une habilitation ou une personne désignée.
- Les super-administrateurs ne contournent pas automatiquement la séparation des tâches. Toute intervention exceptionnelle doit être explicitement tracée.

### Évolutions prévues

1. Ajouter le catalogue des fonctions métier.
2. Ajouter les affectations utilisateur société ferme fonction avec période de validité.
3. Ajouter le catalogue des habilitations métier.
4. Ajouter les habilitations accordées par fonction et les exceptions par utilisateur.
5. Remplacer le seul rôle responsable d’un circuit par une configuration distincte pour chaque niveau.
6. Centraliser la vérification des habilitations dans des fonctions SQL sécurisées.
7. Appliquer l’interdiction d’auto-validation à tous les workflows.
8. Ajouter dans la fiche utilisateur les fonctions et habilitations par société ou ferme.
9. Ajouter dans les circuits de validation le validateur attendu à chaque niveau.
10. Ajouter un journal d’audit des affectations, habilitations et décisions.

### Critères d’acceptation

- Un utilisateur peut cumuler responsable phytosanitaire et chargé d’irrigation.
- Une fonction peut être limitée à une ferme ou couvrir toute une société.
- Une affectation peut être datée et remplacée sans supprimer son historique.
- Le prescripteur d’un traitement ne voit pas l’action permettant de valider sa propre demande.
- Une tentative directe en base de données de s’auto-valider est refusée.
- Deux niveaux différents peuvent cibler deux habilitations différentes.
- Le second niveau peut être activé ou désactivé selon le type de processus.
- Un responsable habilité peut continuer à effectuer des saisies ordinaires.
- Chaque décision indique le demandeur, le validateur, son habilitation, son niveau, la date et le commentaire.
- Les affectations et habilitations respectent l’isolation entre sociétés.

### Livrables prévus

- migration SQL du modèle organisationnel et des habilitations ;
- écran de paramétrage des fonctions et habilitations ;
- évolution de la fiche utilisateur ;
- évolution des circuits de validation ;
- sécurisation uniforme des validations ;
- script de vérification SQL ;
- scénarios de recette métier à exécuter ultérieurement.

## Journal d’avancement

### Validations mobiles — 12 septembre 2026

Migrations 119–122 appliquées ; centre personnel multi-sociétés et PWA installés en local, contrôles serveur et tests mobiles réalisés. Webhook Telegram sécurisé déployé et bot @BenhalimaFarm_bot raccordé. **Publication HTTPS et envoi automatique push/Telegram encore bloqués/non activés** : reconnexion Vercel et configuration du planificateur nécessaires. Détail et recette : `VALIDATIONS_MOBILES_119_121.md`. Intégration des dérogations DAR, statut de correction dédié et escalades restent à traiter ; aucun contrôle métier existant n'a été assoupli.

### Valorisation et coûts/kg — 12 septembre 2026

Lots 115–118 : développement et tests techniques réalisés (CUMP, réception valorisée, consommation réelle, transferts sans charge, ventilation serre et consolidation pondérée ferme/société, intégration au plan). Voir `DEPLOIEMENT_COUTS_115_118.md` pour les règles et le suivi d'application. Publication Vercel en attente de reconnexion (jeton invalide). Recette métier et clôture comptable légale non terminées.

Migrations 115–118 appliquées et contrôlées sur le projet lié le 12 septembre. Reprise : 10 écritures archivées, 10 soldes à confirmer dont 7 sans valeur connue ; aucune consommation historique automatiquement imputable. Les tests de reprise ne persistent aucune donnée fictive.

| Date | Lot | Événement | Résultat |
|---|---|---|---|
| 8 septembre 2026 | Global | Consolidation des décisions de la réunion | Roadmap créée |
| 8 septembre 2026 | Lot 1 | Audit du RBAC, des appartenances société et du moteur de validation | Socle réutilisable identifié, modèle fonctions et habilitations à ajouter |
| 8 septembre 2026 | Lot 1 | Préparation de la migration 086 et des écrans associés | SQL prêt à appliquer, recette métier requise après application |
| 8 septembre 2026 | Lot 1 | Migration 086 appliquée et nouvelles fonctionnalités validées | Lot terminé |
| 8 septembre 2026 | Lot 2 | Préparation de la migration 087 et du workflow complet des traitements | SQL prêt à appliquer, recette métier requise |
| 8 septembre 2026 | Lot 2 | Ajout de la planification, des unités de dose et des aides de saisie dans la migration 088 | SQL prêt à appliquer après 087 |
| 8 septembre 2026 | Lot 2 | Migrations 087 et 088 appliquées avec succès | Workflow et planification disponibles, recette métier à réaliser ultérieurement |
| 8 septembre 2026 | Lot 2 | Préparation de la migration 089 : ferme, surfaces, bouillie, doses et quantités | SQL prêt à appliquer ; interface vérifiée, contrôles serveur inclus |
| 8 septembre 2026 | Lot 2 | Préparation de la migration 090 : complétude ONSSA et sécurité des produits | SQL et contrôles prêts ; prescription alimentée par tout le catalogue, avec identification des produits à lier au stock |
| 8 septembre 2026 | Transverse | Lot 091 : mot de passe temporaire administrateur | Migration, fonction serveur, brouillon d’e-mail et changement obligatoire préparés ; SQL et déploiement requis |
| 8 septembre 2026 | Lot 2 | Lot 092 : quantité prévue robuste et dérogation manuelle | Virgules et alias d’unités pris en charge ; quantité manuelle tracée avec justification obligatoire |
| 8 septembre 2026 | Lot 2 | Correctif 093 : unités de dose | Valeurs historiques et nouvelles prescriptions comparées sous une forme canonique |
| 8 septembre 2026 | Lot 2 | Lot 094 : liaison phyto-stock | Unité proposée dans l’interface et compatibilité contrôlée en base lors de la liaison |
| 8 septembre 2026 | Lot 2 | Lot 095 : listes positives et cibles | Modèle versionné et référentiel de cibles créés ; prescription guidée par la cible, import à poursuivre |
| 8 septembre 2026 | Lot 2 | Lot 097 : conformité marché et LMR | Séparation ONSSA/marchés, exigences client versionnées et règle du minimum paramétrable |
| 8 septembre 2026 | Lot 2 | Lot 099 : bouillie prévisionnelle et consommation réelle | Défaut client à 1 000 L/ha paramétrable ; surface et bouillie réelles recalculent chaque produit ; sortie de stock sur le réel, avec dérogation justifiée |
| 8 septembre 2026 | Lot 2 | Lot 100 : intégration des listes positives | Validation globale, création et liaison des produits, cibles et usages manquants ; |
| 8 septembre 2026 | Lot 2 | Lots 101–102 : éligibilité Station et page Cibles | Statuts Station/ONSSA séparés, prescription filtrée par cible et liste active, administration et fusion des cibles |
| 9 septembre 2026 | Lot 2 | Correctif 103 : cibles vides | Nettoyage des données, contraintes SQL et import avec héritage des cellules fusionnées et avertissement des lignes sans cible |
| 9 septembre 2026 | Lot 2 | Correctif 104 : qualité des cibles importées | Détection des valeurs non biologiques, validation explicite des nouvelles cibles et exclusion des prescriptions avant vérification |
| 9 septembre 2026 | Lot 2 | Correctif 105 : usages et bouillie par hectare | Faux usages désactivés, liste Station active sans repli incorrect, saisie L/ha avec volume global calculé |
| 8 septembre 2026 | Lot 2 | Lot 100 : intégration des listes positives | Validation globale transactionnelle, création et liaison des produits/cibles/usages manquants ; produits importés bloqués jusqu’à vérification ONSSA |
| 8 septembre 2026 | Lot 2 | Lot 101 : éligibilité Station × cible × produit | Cibles du fichier structurées, statut Station séparé du statut ONSSA et prescription filtrée par la liste positive active |
| 8 septembre 2026 | Lot 2 | Lot 100 : intégration des listes positives | Validation globale, création et liaison des produits, cibles et usages manquants ; produits importés bloqués jusqu’à vérification ONSSA |

### Lot 126 — Notifications de validation automatiques (14 septembre 2026)

- Envoi push/Telegram raccordé au planificateur Supabase toutes les minutes ; migration 126 appliquée et secrets provisionnés sans exposition dans Git.
- Maintien des habilitations, des confirmations Station, des préférences par canal/processus et des rappels existants. Le clic ouvre la validation sécurisée sur téléphone.
- 81 tests unitaires et recette mobile simulée réussis. Reste : activation par chaque responsable et recette de réception sur téléphone réel.
- Hors périmètre : envoi automatique des alertes générales du lot 123, substitution fournisseur et nouveaux écrans de pointage.

### Lot 127 — Import du plan de ferme depuis Excel (14 septembre 2026)

- Premier onglet : reconnaissance des serres nommées dans les cellules fusionnées, aperçu puis rattachement au référentiel de la ferme. Import sans dessin manuel et sans changement des surfaces.
- Fichier ferme 114 : 29 serres reconnues. Rattachement réel en attente du choix de ferme et des surfaces officielles.
- Bâtiments, bassins et routes non inclus dans cette première version. Source et aperçu restent privés.

## Points à arbitrer ultérieurement

### Lot 124 — Attestation Station (14 septembre 2026)

- Réalisé : couleurs V/vert, O/J/jaune, R/R*/rouge à l’import et au contrôle ; les couleurs uniquement graphiques sans code restent à renseigner manuellement. Classe inconnue : blocage de validation, jamais de vert implicite.
- Circuit unique : demandeur phyto puis responsable d’exploitation (fonction active sur la société ou la ferme, habilitation de validation, sans auto-validation). Le paramètre historique de validation facultative ne peut plus auto-approuver une nouvelle prescription.
- Cases individuelles non précochées : accord Food Safety pour jaune ; accord Station et restrictions pour rouge. Aucune connexion Station ni nouveau validateur.
- Historique côté serveur : acteur, date, produits, couleurs, versions de liste et confirmations. Contrôle des sources modifiées, des restrictions datées expirées, des doubles clics, des changements de produits/cibles après validation.
- Migration 124 appliquée. Tests : 72 unitaires, TypeScript, recette SQL annulée (aucune donnée métier conservée), recette mobile simulée 390 px. Correction du type enum dans la notification de résultat des traitements.
- Les anciennes prescriptions approuvées ne sont pas réécrites ni munies d’attestations inventées. Les nouveaux accords sont consultables via « Couleurs / accords Station ».
- Non inclus dans ce lot : prescriptions multi-cibles, substitution fournisseur, décisions directement dans Telegram, nouveau pointage et analytique variété. Le mobile actuel passe par l’écran FarmPilot ; aucun envoi push n’est activé par ce lot.

### Centre d’alertes — lot 123 (14 septembre 2026)

- Réalisé : stock faible/épuisé (total client et seuils entrepôt), traitements en retard, manques prévisionnels cumulés par occurrence, absence de récolte positive pendant la période prévue.
- Paramètres par client : anticipation stock traitements 15 jours, retard 0 heure, absence de récolte 3 jours par défaut ; activation par famille. Modification réservée à l’administration du client via RLS.
- Filtres type/ferme/entrepôt, liens vers les modules sources et actualisation chaque minute. Pas de résolution artificielle : la correction métier fait disparaître l’alerte.
- Migration 123 appliquée. Vérifications : 8 tests ciblés, suite complète de 65 tests réussie, TypeScript, requêtes des sources sur la base, RLS activée sans accès anonyme, et recette navigateur mobile 390 px (données simulées, sans modification métier). Code publié sur GitHub : `88e7f19`.
- Reste à faire : envoi automatique de ces alertes par push/Telegram, acquittement/historique et autres familles métier. Les alertes actuelles sont calculées à l’ouverture du centre, sans envoi externe.

- gestion formelle d’un suppléant pendant une absence ;
- portée ferme obligatoire ou facultative selon chaque fonction ;
- habilitations accordées automatiquement par fonction ou entièrement configurables ;
- durée de conservation du journal d’audit ;
- processus autorisant exceptionnellement une validation de plateforme.
