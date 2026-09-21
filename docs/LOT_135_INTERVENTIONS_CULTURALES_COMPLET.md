# Lot 135B–135C — Parcours complet des interventions culturales hors phyto

## Livraison locale et application SQL

La présence de **135A** a été constatée dans Supabase le 18 septembre 2026. **134 était absente**. Les nouveaux lots sont préparés et testés en transaction annulée, pas appliqués durablement par l’agent. Aucun déploiement GitHub/Vercel ou Edge.

Pour appliquer en une fois, utiliser **`outputs/sql/135_interventions_culturales_complet.sql`**, généré par `node scripts/build-cultural-bundle.mjs`. Ce fichier contient une transaction unique : ajoute 134 seulement si absente, puis 135B et 135C. Il refuse de rejouer 135B si sa table existe déjà. **Ne pas appliquer ensuite les sources individuelles en doublon.** Prérequis : 133, 135A et le socle stock/coûts/mobile existant. Ne pas sélectionner seulement un fragment dans l’éditeur SQL.

Accès : **Production → Interventions culturales → Toutes les interventions culturales — planifier et réaliser**, ou `/interventions/programmes`. L’irrigation simple déjà créée reste dans `/interventions`, sans réécriture de son historique. Les recettes restent dans `/interventions/fertigation`.

## Familles couvertes par le parcours

Fertigation ; nutrition foliaire ; fertilisation de fond/amendements ; correction de la qualité de l’eau ; biostimulation hors phyto ; auxiliaires ; piégeage/surveillance ; diffuseurs hors phyto ; nettoyage/hygiène ; entretien du réseau ; travail du sol/substrat ; pollinisation ; ombrage ; CO₂ ; travaux culturaux. Pour les travaux : préciser la tâche dans les consignes (par exemple ébourgeonnage, taille, effeuillage ou palissage).

Ce sont des familles de saisie, **pas des programmes agronomiques recommandés**. Aucun produit, dose, fréquence ou mélange n’est prescrit automatiquement. Le prescripteur confirme le statut hors phyto et l’adaptation des usages. Les articles de catégorie phytosanitaires ou liés à une fiche phyto sont refusés côté serveur, même par appel direct. Un produit réglementé mal classé doit être corrigé au référentiel : ce module ne remplace pas la qualification réglementaire.

## Parcours livré

1. **Brouillon** par société, ferme, campagne, plantations et surfaces. Objectif/consignes obligatoires. Une date, dates précises ou fréquence (jour/semaine/mois/trimestre/année), intervalle, 100 occurrences maximum sur 3 ans. Une copie permet de replanifier sans écraser l’historique ; copier n’annule pas le programme original.
2. **Produits** : articles actifs hors phyto, unité de stock affichée ; quantité globale, dose par hectare ou par m³ d’eau. Fertigation : recette de la ferme figée dans le programme, concentrations dans la solution finale, conversions 135A réutilisées. Aucun calcul de cuve mère/injection implicite. Quantité arrondie à 2 décimales, conformément à la précision actuelle des mouvements de stock ; minimum positif 0,01.
3. **Soumission** possible sans stock. Entrepôt actif obligatoirement rattaché à la ferme dès qu’il y a des produits. Prévision chronologique cumulative des programmes soumis/approuvés par article/entrepôt. Seules les occurrences non clôturées comptent. C’est une prévision, **pas une réservation physique** ; les autres sorties hors de ce parcours restent susceptibles de modifier les soldes.
4. **Validation** par famille et société : 0, 1 ou 2 niveaux, valeur figée à la soumission. Jamais d’auto-validation ; à deux niveaux, le second validateur est distinct du premier et du demandeur. Refus motivé, audits et contrôle d’état côté serveur.
5. **Mobile** : contexte, surfaces, produits par occurrence, calendrier et niveaux dans Mes validations. Push/Telegram, destinataires habilités, rappels et résultat au demandeur via le service existant. Les nouvelles notifications restent désactivées jusqu’à publication de l’interface puis activation explicite du processus et des canaux utilisateurs. Aucun message réel envoyé durant la recette.
6. **Réalisé** par occurrence : date après approbation, eau réelle, surfaces réelles, quantités recalculées ; ajustements manuels avec justification obligatoire si écart. Répartition homogène proportionnelle aux surfaces explicitement confirmée. Produit de substitution interdit sans nouveau programme validé.
7. **Stock et coûts** : sortie atomique dans l’entrepôt de la ferme, stock négatif interdit, nouvelle tentative idempotente. CUMP du stock réel, allocations campagne/serre/variété et qualité du coût ; prix absent : consommation enregistrée mais coût en attente de rapprochement, jamais mis à zéro. Le rapprochement existant conserve les cibles/surfaces d’origine. Aucun coût d’achat imputé une seconde fois.
8. **Non réalisée** avec motif par occurrence : pas de stock ni coût ; les occurrences suivantes restent ouvertes. Annulation du restant d’un programme avec motif, sans effacer les réalisations. Clôture du programme lorsque toutes les occurrences sont réalisées ou déclarées non réalisées.
9. **Alertes et filtres** : familles, fermes, statut, recherche, tri date/titre ; manque par occurrence et retard dans la liste et dans le centre Alertes. Anticipation stock configurable par famille, **15 jours par défaut**. Les nouvelles alertes sont consultatives ; leur envoi externe automatique n’est pas ajouté ici.

## Habilitations

- `cultural.plan` : planifier ; attribuée par défaut au responsable fertigation.
- `cultural.validate` : valider N1 ; responsable fertigation et responsable d’exploitation.
- `cultural.validate2` : valider N2 ; responsable d’exploitation.
- `cultural.execute` : confirmer le réel/non-réalisé ; responsable fertigation et chargé d’irrigation.

Les habilitations se paramètrent au niveau utilisateur/fonction, avec portée ferme existante. Les responsables des autres travaux peuvent recevoir ces habilitations explicitement. Le rôle administrateur ne donne pas implicitement le droit de prescrire ou d’exécuter. Consultation : membre actif du client, accès Agronomie, compte actif et mot de passe à jour.

## Limites maintenues explicitement

- Le parcours complet est livré ; les expertises spécifiques ne sont pas automatisées : analyse de sol/eau, consignes EC/pH, calcul d’injection, incompatibilités de mélanges, suivi des colonies vivantes ou capteurs. Les consignes viennent du responsable qualifié.
- Eau seule reste dans le lot 133 (un niveau, paramètre propre). Le nouveau paramétrage deux niveaux porte sur les familles hors eau seule du lot 135.
- Pas d’automatisation de coûts eau/énergie/main-d’œuvre : ici seuls les produits réellement sortis sont imputés. Utiliser le pointage et les charges existants pour le reste, sans double saisie automatique.
- Pas de correction silencieuse d’un réalisé ni d’édition en place d’un programme validé. Annuler le restant/copie puis nouvelle validation ; les corrections de consommations confirmées restent une procédure distincte.
- Les surfaces réelles doivent rester positives et au plus égales aux surfaces prescrites. Un sous-ensemble de plantations totalement différent nécessite un programme adapté.

## Recette et suivi

Résultats du 18 septembre : **134 tests unitaires / 20 fichiers réussis** ; TypeScript sans erreur ; bundle SQL complet et contrôles métier réussis en ROLLBACK ; interface culturale desktop/mobile 390 px réussie ; non-régression irrigation, validations mobiles irrigation/achats et centre d’alertes (nouvelles familles incluses) réussie. Les appels navigateur sont simulés ; la réception effective d’une notification sur téléphone reste une recette de mise en service.

- SQL : `node scripts/check-cultural-sql.mjs` ; avec bundle : `--bundle` ; après application : `--after`. DDL, habilitations, abonnements fictifs, décisions, mouvements et coûts sont **tous annulés par ROLLBACK**. Aucun dispatcher n’est appelé.
- Interface simulée : `node scripts/test-cultural.mjs` ; requêtes Supabase interceptées, desktop/mobile 390 px, aucune donnée métier écrite.
- Unitaire : `node node_modules/vitest/vitest.mjs run` ; TypeScript : `node node_modules/typescript/bin/tsc --noEmit --incremental false`.
- Après SQL : recette métier à trois comptes si deux niveaux, vérifier les droits et un programme avec trois occurrences dont la dernière manque de stock. Confirmer une occurrence, comparer Stocks/Mouvements et Coûts. Tester Non réalisée sur la seconde sans sortie. Puis publication et activation contrôlée des notifications sur un vrai téléphone.
