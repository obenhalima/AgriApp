# Lot 134 — Irrigation dans Mes validations et notifications

18 septembre 2026. Préparé et testé en local. Migration non appliquée durablement ; aucun push GitHub, déploiement Vercel ou déploiement de fonction Supabase. Aucun message réel envoyé pendant la recette.

## Fonctionnement

- Les programmes d’irrigation soumis nécessitant une validation apparaissent dans **Mes validations**, toutes les sociétés auxquelles le responsable a accès.
- Le serveur exige : utilisateur actif, mot de passe à jour, appartenance à la société, ferme active de cette société, lecture Agronomie, habilitation `irrigation.validate` sur la ferme et utilisateur distinct du demandeur.
- La carte expose ferme, demandeur, serres, source d’eau, secteur, consignes, méthode de calcul, litres par occurrence, nombre d’occurrences, total de litres et toutes les dates. Elle précise qu’il s’agit d’eau seule et de la validation de tout le programme.
- Approbation ou refus (motif de 5 caractères minimum), contrôlés et historisés côté serveur. Une décision devenue obsolète est refusée, sans doubler l’audit.
- « Ouvrir la fiche complète » sélectionne la société puis ouvre le programme via `/interventions?programme=<id>`.
- Achats, transferts, sorties de stock et traitements conservent leurs implémentations précédentes, y compris les attestations Station. Les fonctions historiques sont privées et les wrappers délèguent les autres types.

## Destinataires et canaux

Tous les validateurs actuellement habilités et distincts du demandeur sont éligibles. Pas de désignation arbitraire d’une personne. Chacun doit disposer d’un abonnement push actif ou d’une liaison Telegram avec ce canal activé. Une habilitation révoquée retire l’éligibilité ; aucune notification ne confère de nouveaux droits.

- Notifications de demande et rappels via le planificateur existant du lot 126, sans nouveau cron.
- Rappel configurable de 1 à 720 heures, défaut 24 heures, par société et processus.
- Déduplication par programme, destinataire/abonnement, niveau et période de rappel.
- Annulation des messages pending non envoyés après décision/annulation ou perte d’éligibilité.
- Résultat envoyé au demandeur si un autre utilisateur approuve, refuse ou annule et si les notifications sont activées. Pas de faux accord humain en cas de validation désactivée.
- Texte discret : pas de nom de ferme, de quantité ou de consigne sur l’écran verrouillé. L’ouverture passe par la connexion sécurisée FarmPilot ; la notification n’approuve rien directement.

## Activation : ordre impératif

1. Appliquer `supabase/migrations/134_irrigation_mobile_approvals.sql` une seule fois après accord.
2. Vérifier en local « Mes validations » avec deux utilisateurs métier et une demande d’irrigation de test.
3. Après accord distinct, publier l’interface GitHub/Vercel. La fonction Supabase `mobile-dispatch` peut ensuite être redéployée pour le libellé spécifique irrigation ; l’ancien texte générique reste compatible avec le routage et les contrôles serveur.
4. Dans **Mes validations → Paramétrer les notifications et rappels → Programmes d’irrigation**, activer pour la société. Faire un test réel contrôlé sur le téléphone du responsable.

La migration initialise **les notifications irrigation désactivées** pour les sociétés existantes sans écraser un paramètre déjà présent. Les nouvelles sociétés, sans règle irrigation explicite, n’envoient rien non plus. Cela évite d’envoyer des liens vers une interface de production non mise à jour. Cette règle n’empêche ni la soumission ni la validation locale. Elle est indépendante de l’activation de la validation métier dans le lot 133.

## Tests

- `node scripts/check-irrigation-mobile-sql.mjs` : migration et fixtures intégralement annulées. Après application, utiliser `--after`, sans rejouer le DDL.
- Contrôles SQL : accès, visibilité, demandeur exclu, habilitation révoquée, mauvais niveau, commentaire de refus, approbation/refus/audit, décision répétée, activation explicite, destinataires, déduplication, rappels, annulation des pending et notification de résultat.
- Aucun appel à l’expéditeur, HTTP ou réclamation de file pendant les tests ; abonnements factices et messages de recette invisibles aux autres sessions et supprimés par ROLLBACK.
- `node scripts/test-mobile-browser.mjs --irrigation` : backend simulé, écran 390 px, contexte complet, litres formatés, dates, refus court bloqué, décision unique et notifications désactivées par défaut.
- `node scripts/test-mobile-browser.mjs` : non-régression interface validation achat.
- Suite unitaire : 125 tests / 18 fichiers réussis.

## Limites restantes

- Un seul niveau de validation irrigation, comme dans le lot 133. Paramétrage multi-niveaux non livré par ce lot.
- Pas d’alerte push d’irrigation en retard ou de notification de réalisation : seuls demandes, rappels de validation et résultats sont couverts.
- Fertigation, stocks d’engrais, coûts et autres familles encore à développer.
- Réception sur téléphone réel et production non testées : aucun envoi ou déploiement autorisé par ce lot local.
