# Récolte : saisie directe de l'effectif

## Activation

Appliquer `supabase/migrations/138_harvest_people_productivity.sql` sur Supabase après revue. Non exécutée automatiquement. Puis actualiser l'application locale. Pas de déploiement GitHub/Vercel.

## Parcours

1. Dans Pointage → Récolte, ouvrir « Objectif journalier par personne » et définir, par ferme, le nombre de kg/personne/jour et la date d'effet. Permission pointage.edit requise.
2. Dans Récoltes → Saisir une récolte, renseigner les plateaux comme avant, puis l'effectif. Les heures par personne restent facultatives.
3. Cocher « toute la récolte de la journée pour ces personnes » uniquement si ces personnes n'ont pas leur journée répartie entre plusieurs saisies.
4. Consulter les ratios dans Pointage → Récolte ou Productivité → Productivité par personne à la récolte.
5. Les anciennes récoltes peuvent être complétées via leur fenêtre de modification.

50 000 kg / 5 personnes = 10 000 kg/personne pour cette saisie. Le poids est celui de la récolte au champ, potentiellement estimé, avant tri station.
Sans heures, aucun kg/heure-personne. Sans déclaration de journée complète, aucun pourcentage d'atteinte de l'objectif journalier. Sans objectif ou effectif, afficher une absence, pas zéro.

## Historique et limites

La synthèse propose un regroupement par jour ou par semaine (lundi–dimanche), avec réalisé comparable, objectif cumulé, écart et atteinte, courbe et tableau accessible. Le calcul hebdomadaire additionne les objectifs des journées effectivement déclarées complètes et disposant d'un objectif ; ce n'est pas un budget hebdomadaire futur indépendant. Les semaines partiellement filtrées restent partielles. Les jours sans saisie ne sont pas inventés comme des récoltes nulles. Les ratios consolidés sont pondérés par les journées-personnes déclarées, jamais moyennés entre récoltes. Sans identification nominative, l'absence de doublons repose sur la déclaration de journée complète.

- L'objectif en kg/personne/jour est distinct de l'ancien objectif en kg/heure-personne. Aucune conversion implicite.
- L'objectif applicable à la date de récolte est conservé côté serveur. Modifier les kilos ou l'effectif d'une récolte déjà renseignée ne réécrit pas son objectif ; changer de date ou de plantation le recalcule.
- Pas d'addition des effectifs en un effectif unique journalier, faute de personnes identifiées. Les ratios sont affichés par récolte. La déclaration de journée complète repose sur l'utilisateur.
- Les heures doivent être celles consacrées à cette récolte ; répartir les heures si plusieurs saisies concernent les mêmes personnes.
- Aucun pointage salarial ou coût n'est créé automatiquement. Ces informations ne constituent pas un enregistrement de paie et ne doivent pas doubler le pointage existant.
- L'ancien mode par équipe et ses attributions restent disponibles derrière « Historique / mode avancé par équipe », sans obligation de les utiliser. Les deux modes ne sont pas additionnés.
- Aucun objectif métier inventé ou imposé par défaut.

## Vérifications

Tests unitaires : `npx vitest run lib/harvestPeople.test.ts lib/harvestProductivity.test.ts`.
Après migration : créer une récolte d'essai, renseigner 5 personnes, contrôler le ratio ; laisser les heures vides puis les compléter ; vérifier qu'une saisie non déclarée journée complète n'affiche pas d'atteinte journalière ; vérifier la conservation de l'objectif après nouvelle version.
