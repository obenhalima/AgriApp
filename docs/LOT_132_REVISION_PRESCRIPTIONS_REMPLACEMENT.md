# Lot 132 — Réviser les prescriptions après réception d’un remplacement

État : préparé le 16 septembre 2026, testé en local et en transaction SQL annulée. **Migration 132 non appliquée**, aucun push GitHub ni déploiement Vercel. Prérequis : migration 130 appliquée. La 131 (filtre serveur de cible lors de la demande fournisseur) demeure un correctif distinct en attente.

## Parcours

Depuis un remplacement au statut « réceptionné », cliquer sur « Réviser les prescriptions concernées ».

- Accès réservé à un prescripteur habilité sur la ferme, membre du client, avec accès de création agronomique et compte actif.
- L’aperçu propose exclusivement les occurrences futures, soumises ou approuvées, sans application enregistrée, dans la même ferme, utilisant l’article initial pour la même cible biologique.
- Dose minimale du nouvel usage proposée (dose maximale si minimum absent), dose modifiable dans l’intervalle. Recalcul explicite si la dose change. Quantités estimées avec surface/bouillie de chaque occurrence et unité de stock du remplaçant.
- Sélection explicite des occurrences ; aucune sélection automatique en fonction du stock restant. Les autres conservent leur produit initial.
- Aperçu des autres produits du mélange ; justification et confirmation de leur vérification requises.
- Soumission atomique : nouvelles prescriptions « soumises », anciens éléments sélectionnés « annulés ». Pas de double traitement actif pour les mêmes occurrences sélectionnées ; anciennes lignes et attestations conservées, lien de révision audité.
- Dates et serres conservées. Les nouvelles demandes sont des occurrences autonomes ; la récurrence originale n’est pas régénérée. Le lien ancien/nouveau figure dans l’audit et les notes.
- DAR et rentrée du nouvel usage repris ; autres produits conservés et recontrôlés par les garde-fous existants. Aucun accord Station précédent transféré. Validations et notifications existantes des nouvelles prescriptions conservées.
- L’entrepôt de réception du remplaçant est utilisé dans la même ferme. Aucun mouvement de stock, aucune réservation et aucun coût créés par la révision. La disponibilité prévisionnelle sera recalculée par le moteur existant.
- Si la nouvelle prescription est refusée, l’ancienne n’est pas réactivée automatiquement : intervention explicite du prescripteur nécessaire.

## Protections

Idempotence de soumission par identifiant, verrouillage des occurrences/lignes avant modification, refus si l’aperçu ne correspond plus aux données courantes, contrôle de l’usage source, cible identique, client/ferme, aucune application existante. Si le produit de remplacement figure déjà dans un mélange, révision manuelle demandée pour éviter un double dosage.

## Vérifications réalisées

- TypeScript et parcours navigateur simulé : dose modifiée impose un recalcul, sélection d’une seule occurrence parmi deux, confirmation obligatoire, conservation de l’identifiant après erreur et nouvelle soumission.
- Script `scripts/check-prescription-revision-sql.mjs` : installe temporairement 132 et construit trois prescriptions de recette dans une transaction terminée par ROLLBACK. Vérifie : interdiction anonyme, droits directs, occurrence passée exclue/refusée, source obsolète refusée, sélection partielle, produit/quantité/DAR, nouvelle validation obligatoire, annulation de la seule ancienne occurrence choisie, idempotence et absence d’effet stock/application.
- Aucune donnée de recette conservée. Recette utilisateur connectée après accord d’application de 132 ; aucune application automatique à son accord sur le développement.
