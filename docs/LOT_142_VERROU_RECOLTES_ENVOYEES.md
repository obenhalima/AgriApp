# Lot 142 — Verrou serveur des récoltes envoyées

Statut au 2 octobre 2026 : application à Supabase déclarée par l'utilisateur, puis recette confirmée (« c'est bon, continue »). Pas de réinspection distante automatique. Aucune publication de code effectuée dans ce lot.

## Règles

- Tout lien source d'envoi, même partiel, et tout lien direct historique Station verrouille la récolte. Les liens existants sont repris lors de la migration.
- Un registre privé conserve le verrou si un lien ou un lot est supprimé. Aucune procédure de déverrouillage n'est fournie ; les corrections historiques devront faire l'objet d'un processus explicite et audité.
- Édition et suppression de la récolte refusées côté serveur. Seule la synchronisation du poids réel avec la somme exacte des sources des lots pesés est permise ; aucun poids arbitraire. Le snapshot d'objectif par personne est conservé.
- Les champs générés ne sont pas comparés avant calcul PostgreSQL. La mise à jour technique de `updated_at` est admise.
- Le registre n'est pas accessible aux rôles applicatifs. Les fonctions de trigger n'ont pas de droit d'exécution public.
- Suppression groupée : authentification, rôle administrateur et permission de suppression sur chaque domaine, verrouillage ordonné des récoltes, refus global si une récolte est envoyée ou absente. Aucun nettoyage d'envois orphelins, aucune suppression de sources.
- Les nouvelles liaisons verrouillent la ligne récolte, vérifient le domaine et inscrivent le registre dans la même transaction. Les écritures concernées exigent READ COMMITTED (mode habituel PostgREST) ; les modes à snapshot durable sont refusés plutôt que de risquer un contrôle périmé.

## Vérifications locales

`scripts/test-sent-harvest-guard.sql` construit un schéma minimal et applique la vraie migration. Tests : reprise historique, refus édition/suppression, sélection mixte sans suppression partielle, poids arbitraire refusé, conservation du verrou après suppression du lien, refus inter-domaines, suppression non envoyée.

`scripts/test-sent-harvest-concurrency.mjs` exécute la vraie fonction `admin_weigh_station_dispatch` extraite de 059, puis teste en deux sessions l'envoi avant une édition et une suppression avant un envoi. Endpoint fixé à 127.0.0.1:55432 ; aucune lecture des secrets applicatifs. Tests réussis le 2 octobre 2026.

Les helpers d'authentification sont simulés dans cette base jetable. Ces tests ne constituent pas une recette complète des RLS, de tous les triggers historiques ou du schéma Supabase déployé.

## Avant application distante

1. Revue de 142 et sauvegarde/restauration vérifiée sur une copie du schéma réel. Prérequis : migrations de production jusqu'à 141, notamment domaines, pesée et objectif par personne.
2. Recette avec les triggers réels (DAR, pointage, snapshot), comptes autorisés/interdits, envois groupés et récoltes en unités de plateaux.
3. Prévoir une fenêtre sans saisies : la migration verrouille brièvement les trois tables pendant la reprise ; timeout de verrou 5 secondes, transaction entièrement annulée en cas d'échec.
4. Valider le comportement du reset démo : le registre empêche aussi l'effacement des récoltes expédiées. Ne pas supprimer ce registre pour contourner le contrôle en exploitation.
5. Obtenir l'accord d'application. La présence du fichier local ne protège pas encore la base distante.

Limite UI : après suppression exceptionnelle d'un lien d'envoi, le contrôle visuel fondé sur les liens peut ne plus griser la récolte ; le registre serveur continue à refuser sa modification. Une lecture dédiée du verrou durable pourra compléter l'interface après déploiement.
