# Installer une instance dédiée ItriX Farm

## État du chantier

La copie de travail part du commit GitHub `7fff6b1cf6afeeab03daf07c8e6572f3c63cebd1`. La procédure de désignation du premier super-administrateur a été testée sur un PostgreSQL jetable avec le garde de rôle ItriX Farm. Le socle SQL d’installation neuve, l’assistant et la recette Supabase/Vercel restent à réaliser.

Le projet Vercel **itrix-domaine-benhalima-recette** et le projet Supabase **Domaine BENHALIMA - Recette** ont été créés. Le projet Supabase est dans l’organisation **Domaine BENHALIMA**, en Irlande. Les références sont consignées dans le [manifeste de recette](../deployment/domaine-benhalima-recette.json). L’installation du schéma et le premier déploiement restent à faire. La production sera provisionnée après la recette.

## Architecture

Chaque contrat dispose de son propre projet Vercel et de son propre projet Supabase. Une instance peut accueillir plusieurs sociétés. Les droits, fermes et données opérationnelles restent rattachés à leur société. L’instance ItriX Technologies héberge les démonstrations et sert de source en lecture seule pour les référentiels approuvés.

## 1. Préparer les cibles

1. Relever l’organisation, le nom, la région et le plan du projet Supabase. Créer un projet vide dans l’organisation désignée.
2. Créer un projet Vercel distinct. Prévoir un accès de recette avant l’ouverture du domaine client.
3. Copier [le manifeste d’exemple](../deployment/dedicated-instance.example.json) dans un fichier de travail et y renseigner les identifiants cibles et le commit livré. Conserver les clés et mots de passe dans les gestionnaires de secrets.
4. Vérifier les références à partir des tableaux de bord, puis exécuter depuis la racine du dépôt :

```sh
node scripts/check-dedicated-instance-target.mjs <manifeste> <ref-supabase-cible> <projet-vercel-cible>
```

Ce contrôle vérifie la cohérence des identifiants déclarés. Avant chaque opération distante, vérifier aussi que la connexion effective utilise la base du projet cible et que les variables Vercel correspondent à ce projet.

## 2. Installer le schéma et le référentiel

Préparer un socle SQL versionné, puis le restaurer sur un projet de recette vide. Les migrations historiques `001`, `072`, `073` et `152` comprennent des exemples ou supposent la présence de sociétés ou de comptes de la démo. Leur exécution en bloc sur la nouvelle instance est à proscrire. Vérifier Auth, les politiques RLS, Storage et les fonctions Edge sur le projet de recette. Laisser les notifications et intégrations externes désactivées jusqu’à la recette.

Préparer deux jeux de données à partir du standard ItriX Farm et d’une extraction DOMBEN501 en lecture seule.

| Jeu | Périmètre |
| --- | --- |
| Socle proposé à l’installation | Cultures, unités et listes de choix, plan comptable et catégories de coûts, modèles de rôles et circuits de validation |
| Catalogue général | Variétés, articles de stock, produits phytosanitaires, coûts de référence et marchés, à sélectionner fiche par fiche |

La sélection doit être exportée avec ses dépendances et des identifiants métier stables. Recréer les liens à l’import avec les identifiants de la cible. Les fournisseurs, clients commerciaux, utilisateurs, fermes, serres, campagnes, stocks et historiques sont à saisir dans la nouvelle instance selon les besoins.

## 3. Créer le premier super-admin

Une fois le socle installé, créer et confirmer le compte Auth dans le projet dédié. Vérifier que son profil a été créé et qu’il est actif. Sur cette base encore sans société, appeler le script avec une connexion du propriétaire de la base :

```sh
psql -v admin_id=<uuid-du-compte-auth> -f deployment/bootstrap-first-platform-admin.sql
```

Fournir la connexion à `psql` via un profil de connexion sécurisé. Vérifier le rôle du compte dans l’application.

## 4. Recetter l’assistant

- Créer la première société, revoir le socle, choisir des fiches du catalogue, puis valider le récapitulatif.
- Quitter avec enregistrement et reprendre avec l’autre administrateur. Vérifier que quitter sans enregistrer reprend le dernier brouillon conservé.
- Vérifier que le super-admin peut terminer seul. S’il a invité l’administrateur de la société, chacun peut finaliser. Les utilisateurs ordinaires accèdent aux modules après finalisation.
- Après finalisation, modifier les réglages dans les écrans habituels et ajouter une fiche via le catalogue permanent.
- Dans un second lot, tester l’ajout d’une société depuis zéro et par clonage. Le clonage préremplit chaque étape depuis le paramétrage actuel de la source choisie. L’administrateur revoit, adapte ou recommence chaque étape. Si le code d’une fiche du catalogue existe déjà, conserver la fiche du brouillon sauf remplacement explicite.

## 5. Ouvrir la production et livrer les correctifs

Vérifier les sauvegardes, les accès, les URL Auth et l’absence de données de démo avant l’ouverture. Reporter dans le dossier de livraison le commit et le tag Git, le déploiement Vercel, la référence Supabase, les migrations et la validation de recette.

Intégrer les correctifs dans le Git privé commun, les tester sur un environnement séparé, puis publier une version. Valider et déployer la version pour chaque instance concernée. Vérifier la compatibilité du schéma avec la version précédente de l’application et prévoir séparément la restauration des données.
