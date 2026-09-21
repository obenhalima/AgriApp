# FarmPilot — validations mobiles et notifications

## État au 12 septembre 2026

### Installé et vérifié

- Migrations 119 à 122 appliquées au projet Supabase lié `dlisonvsphybjiyxoymk`. La 122 contrôle aussi la cohérence société/politique/entité et les détails affichés.
- Centre `/validations` accessible dans Pilotage → Mes validations, adapté au téléphone.
- Liste personnelle multi-sociétés, détails des produits/articles, fournisseur/demandeur, décisions et historique.
- Achats et transferts : reprise des niveaux du moteur existant. Traitements et sorties : reprise de leurs RPC métier actuelles, sans réécriture de leurs contrôles.
- Refus motivé, confirmation explicite, vérification serveur du niveau en cours, exclusion de l'auto-validation et des décisions répétées.
- Compte inactif ou mot de passe temporaire à changer : décision mobile refusée.
- PWA : manifeste, icônes Android/Apple, service worker sans cache des données métier ; aucune décision hors ligne.
- Paramètres par société/processus : notifications activées/désactivées et rappel de 1 à 720 heures (24 h par défaut).
- File d'envoi serveur avec verrou de 3 minutes, 20 envois par lot, réessais plafonnés à 5 et délai croissant.
- Contrôles d'habilitation et d'adhésion réévalués avant envoi ; message discret sans données commerciales sur l'écran verrouillé.
- Code personnel Telegram à usage unique, valable 15 minutes, conversation privée uniquement, déconnexion possible.
- Webhook `telegram-webhook` déployé ; pilote sécurisé activé. Bot **@BenhalimaFarm_bot** identifié et webhook contrôlé/configuré vers ce projet (sans suppression des messages en attente).

### Ce qui n'est PAS encore opérationnel

La **publication Vercel est bloquée par l'absence d'authentification CLI**. L'interface locale est disponible, mais la version mobile nouvelle n'est pas publiée en HTTPS. Aucune réception push réelle n'a été validée sur Android/iPhone.

Le **service d'envoi planifié n'est pas activé** : clés VAPID, secret du planificateur, URL publique et paramètres de production à configurer après reconnexion. La présence d'une association Telegram ne signifie pas encore que les notifications automatiques sont envoyées. Le bouton push indique explicitement l'absence de configuration.

Les permissions de notification et l'installation sur chaque téléphone nécessitent un geste de son utilisateur ; l'administrateur ne peut pas les accepter à sa place.

### Limites métier conservées

- Le centre ne remplace pas tous les workflows de l'ERP : il couvre achats, transferts, traitements et sorties existants.
- Les demandes de dérogation DAR ne sont pas ajoutées par ce lot. Le garde-fou récolte existant n'est pas assoupli ; un workflow dédié reste nécessaire avant de les intégrer au centre mobile.
- Il n'y a pas de nouveau statut « à corriger » ni de resoumission automatique : utiliser le refus motivé, puis la correction dans le module source selon ses possibilités.
- Aucun suppléant/escalade n'est attribué automatiquement. Les rappels vont aux personnes déjà habilitées ; configurer explicitement les suppléants dans les circuits existants.
- Les traitements/sorties gardent leur fonctionnement actuel ; cette intégration ne transforme pas implicitement leur circuit en validation multi-niveaux.
- Les restrictions ferme sont celles des RPC existantes. Le centre n'accorde pas de nouvelle habilitation de ferme par lui-même.
- Les envois sont « au moins une fois » en cas d'interruption après transmission : un doublon de notification est possible, pas une double validation. Le téléphone regroupe les push par demande.

## Utilisation

1. Ouvrir `/validations` après connexion. Toutes les sociétés autorisées sont consultables, avec filtre par société. La fiche source bascule vers la bonne société avant ouverture.
2. Vérifier les lignes, le contexte et les pièces dans la fiche source si nécessaire, puis approuver ou refuser avec motif.
3. Pour paramétrer les rappels : sélectionner la société dans la barre supérieure, puis `/validations/parametres` (administrateur uniquement). Ces réglages ne changent pas l'obligation de validation métier.
4. Pour Telegram : « Installer FarmPilot / Notifications » → « Relier Telegram » → ouvrir le lien du bot et envoyer `/start FP_CODE`. Ne jamais partager le code personnel.
5. Pour installer après publication : Android/Chrome → Installer ; iPhone/Safari → Partager → Sur l'écran d'accueil. Sur iPhone, ouvrir l'icône installée (iOS 16.4 minimum pour les push).
6. Sur un téléphone partagé, se déconnecter : l'abonnement push local est désinscrit avant la déconnexion.

## Reprise du déploiement en ligne

1. `vercel login`, puis confirmer le projet `frampilot` et vérifier que sa configuration Supabase vise bien le projet lié. Ne pas publier contre une autre base.
2. Configurer en production : `APP_PUBLIC_URL` (URL HTTPS stable), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, et les variables Supabase existantes. La clé VAPID privée et le jeton Telegram ne doivent jamais porter le préfixe `NEXT_PUBLIC_`, ni figurer dans Git. Générer les clés VAPID une seule fois et conserver leur paire pour ne pas invalider les abonnements.
3. Compiler et publier avec `vercel deploy --prod`. Ne pas rejouer les migrations déjà appliquées (119–122).
4. Programmer un appel serveur régulier (par exemple chaque minute) vers `GET /api/mobile/dispatch`, avec `Authorization: Bearer CRON_SECRET`. Utiliser un planificateur compatible avec le forfait d'hébergement, sans supposer qu'un cron à la minute est inclus dans Vercel Hobby. Le script `scripts/run-mobile-dispatch.mjs` permet aussi une exécution ponctuelle contrôlée.
5. Enregistrer deux téléphones de test, soumettre une vraie demande de test depuis un autre utilisateur, puis vérifier notification, ouverture, décision et retour au demandeur. Tester aussi retrait d'habilitation et déconnexion.

Le point de contrôle `mobile-readiness` est réservé à la clé serveur. `node scripts/check-mobile-readiness.mjs` vérifie le bot sans afficher les secrets. Son option `--configure` ne remplace pas un webhook pointant vers une autre destination.

## Vérifications réalisées

- TypeScript : sans erreur ; compilation Next de production réussie dans un dossier séparé pour ne pas détruire le cache local.
- 23 tests unitaires (endpoint push, protection SSRF, webhook et association Telegram).
- SQL avec ROLLBACK : boîte personnelle, accès étranger refusé, code Telegram non réutilisable, niveaux successifs et décisions répétées.
- Navigateur à 390 × 844 avec Supabase entièrement simulé : pas de débordement horizontal, refus sans motif bloqué, confirmation et exactement un appel de décision. Aucune demande réelle approuvée par ce test.
- Capture de recette simulée : `tmp/mobile/mobile-validation.png`.
- L'audit npm signale des vulnérabilités dans l'arbre de dépendances existant : pas de `audit fix --force` ni de montée de version majeure aveugle dans ce lot. Une revue dédiée reste à faire avant généralisation.

Les fichiers SQL de tests doivent être exécutés en transaction annulée. Le script de préparation fournit `tmp/mobile/post-deploy-tests.sql` pour tester après installation, sans rejouer les migrations.
