# Lot 125 — Prescriptions multicibles

## Livré

- Cible vérifiée sélectionnée sur chaque ligne, suivie d’un produit éligible pour cette cible.
- Dose, unité, DAR et délai de rentrée hérités de l’usage correspondant. Volume de bouillie commun ; calcul automatique de toutes les lignes et maintien des dérogations manuelles justifiées.
- Changement de cible : réinitialisation du seul produit concerné et de sa confirmation d’étiquette.
- Pas d’ajout automatique de tous les produits, pas de produit en double dans une prescription.
- Les occurrences conservent les associations cible/produit. Le stock insuffisant ne bloque pas la planification.
- Contrôles Station et instantané DAR adaptés aux cibles des lignes. Accords séparés, aucune auto-validation.
- Anciennes prescriptions conservées : repli sur la cible historique, sans réécriture de leurs attestations ou applications.

## Vérifications du 14 septembre 2026

- TypeScript sans erreur ; 75 tests unitaires réussis.
- Navigateur local PC et mobile 390 px, Supabase simulé : listes filtrées, deux cibles, calcul 500 ml et 2 kg, réinitialisation isolée, envoi sans stock.
- SQL sur projet lié, transaction annulée avant et après migration : deux occurrences, cibles canoniques, calcul, manque de stock, atomicité, rejet des doublons/surdosages/cibles non associées/produits inexistants, accords jaune et rouge, interdiction d’auto-validation et de modification après accord, structure DAR.
- Migration 125 appliquée ; 26 prescriptions avant/après. Les données de test ne sont pas conservées.
- Compilation de production locale réussie dans un dossier isolé, sans toucher au serveur de développement. Commit GitHub : `abfe62d` ; version multicible vérifiée sur l’URL principale Vercel (HTTP 200 et nouveau endpoint présent dans les scripts de la page). Recette métier utilisateur à réaliser.

## Limites

La sélection de produits pour des cibles différentes n’atteste pas la compatibilité du mélange. Cette vérification reste à la charge du prescripteur. Même ensemble de serres, même calendrier et même volume de bouillie pour toutes les lignes ; des périmètres différents nécessitent des prescriptions distinctes.

L’envoi automatique push, les substitutions fournisseur et le nouveau pointage ne font pas partie de ce lot.
