# Récolte : productivité des équipes

Accès : Pointage → « Récolte : pointer les équipes et comparer aux objectifs ».
Lien également dans Productivité. URL : `/pointage/recolte`.

## Mise en service

Appliquer manuellement `supabase/migrations/137_harvest_team_productivity.sql` après revue, puis actualiser.
Cette migration n'a pas été exécutée automatiquement sur Supabase. Aucun déploiement GitHub/Vercel.
Si 137 a déjà été appliquée avant la correction du rattachement client des serres, appliquer seulement `137b_harvest_labor_farm_domain.sql`. Le domaine d'une serre est résolu par sa ferme, pas par un champ `greenhouses.domain_id`.
Prérequis : schéma existant avec pointage 062/063, domaines et permissions 072–077.

1. Créer les équipes dans le référentiel existant et les rattacher à la ferme.
2. Définir un objectif de récolte par ferme (kg/heure-personne), avec une date d'effet.
3. Enregistrer la récolte dans le module Récoltes.
4. Dans le pointage récolte, choisir la récolte, son équipe, l'effectif présent, les heures par personne hors pauses et les kilos attribués à cette équipe.
5. Consulter les KPI et comparer les équipes, avec filtres campagne, ferme, équipe et période.

L'enregistrement crée atomiquement le pointage général ET l'attribution. Ne pas repointer les mêmes heures ailleurs.
Si une équipe couvre plusieurs récoltes, répartir également ses heures entre ces récoltes ; ne pas recopier la journée entière pour chacune.
Les équipes proposées appartiennent à la ferme de la récolte. Les kilos attribués, toutes équipes confondues, ne peuvent excéder le total de la récolte (verrou SQL).

## Calcul

8 personnes × 5 heures = 40 heures-personnes ; 2 400 kg / 40 h = 60 kg/h-personne.
Avec objectif de 50 : attendu = 2 000 kg, atteinte = 120 %.
Agrégation = somme des kilos / somme des heures, jamais moyenne des ratios.
Le pourcentage d'atteinte porte seulement sur les pointages disposant d'un objectif ; les autres restent dans les kilos et les heures et sont signalés.
L'objectif applicable à la date de récolte est copié à l'enregistrement. Une nouvelle version ne modifie pas les pointages déjà saisis.

## Traçabilité et limites du premier lot

- Pas de réattribution automatique des anciens pointages : le rapprochement historique exige une revue pour éviter les doubles heures.
- Effectif collectif déclaré ; pas encore de liste nominative, de contrôle des chevauchements ni de créneaux horaires.
- Pas de classement individuel ni de coût salarial calculé sans taux réel.
- Les kilos proviennent du total Récoltes avant tri station : ils peuvent être estimés. Pas une mesure de qualité après tri.
- Une annulation conserve l'audit de l'attribution, supprime le pointage associé et libère les kilos. Recréer ensuite la saisie corrigée.
- La réduction d'une récolte en dessous des kilos attribués ou son changement de plantation/date est bloqué tant que les attributions ne sont pas annulées.
- Les pointages liés ne sont pas modifiables/supprimables depuis le pointage général.
- Permissions : pointage.view pour l'écran, pointage.create pour saisir, pointage.edit pour les objectifs et annulations ; contrôles répétés côté serveur. Pas de permissions nouvelles accordées.

## Vérification

- `npx vitest run lib/harvestProductivity.test.ts` : formules, pondération, objectifs absents, annulations, regroupements, dates d'effet.
- `node scripts/test-harvest-productivity.mjs` : parcours navigateur entièrement simulé ; aucune écriture Supabase.
- Avant mise en production, tester les RPC sur une base de recette : dépassement de kilos, saisies concurrentes, permission refusée, équipe autre ferme, rejouement identique, annulation et conservation des objectifs historiques.
