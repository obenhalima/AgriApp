# Fiche serre et pilotage des coûts — 18 septembre 2026

Modifications locales, sans migration SQL ni déploiement.

## Plan de ferme

- Clic ou Entrée/Espace sur une serre : fenêtre modale avec identité, surface officielle, cultures de la campagne, objectifs, progression, rendement et historique des récoltes.
- Coûts directs, charges communes, coût total, coût/kg, budget et écart issus du calcul existant ; droit de consultation des coûts conservé.
- Fermeture par bouton, Échap ou fond ; focus restitué, défilement de la page bloqué pendant l’ouverture.
- En mode dessin, le clic sélectionne toujours la forme ; bouton séparé pour ouvrir sa fiche.
- Changement de ferme, client ou campagne : fermeture de la fiche.
- CA/marge non inventés : indisponibilité explicitée faute de rapprochement des ventes.
- Complément fiche serre : surface plantée cumulée, objectif restant, nombre et moyenne des saisies de récolte, plants et densité. Dates de plantation, début/fin prévus et première/dernière récoltes enregistrées distinctes (pas de déduction d'une fin réelle).
- Interventions : traitements phyto ciblant les plantations de la campagne ; irrigation et interventions culturales filtrées par client, ferme, campagne et serre. Dates prévues/réalisées, produits du programme, états et filtre en retard. Une application partielle n'est pas présentée comme complète. Les données indisponibles sont signalées ; les produits de programmes multiserres ne constituent pas des consommations par serre.
- Lecture seule, aucune nouvelle migration. Test navigateur étendu : dates prévues, application phyto en objet (pas seulement tableau), irrigation réalisée, fertigation en retard et exclusion d'un autre programme de campagne.

## Coûts de production et stock valorisé

- Charte visuelle et en-tête communs, navigation en trois rubriques : production, rapprochements, stock.
- KPI recalculés sur les lignes du périmètre affiché ; ratio global pondéré par les kilogrammes, pas moyenne des ratios des serres.
- Filtres campagne/période et consolidation ; stock courant explicitement indépendant des filtres de production.
- Recherche article/entrepôt et filtre des soldes à valoriser. Actions de rapprochement et valorisation conservées.
- Aucun changement de règle d’allocation, de consommation ni de valorisation.

## Recette

`node scripts/test-greenhouse-dialog.mjs` : données Supabase simulées uniquement. Clic/clavier, fermeture, retour du focus, bonne serre, serre vide, objectifs/récoltes/coûts, mode dessin, largeur mobile, navigation des coûts, recherche et filtre stock.

`node node_modules/vitest/vitest.mjs run lib/productionCosting.test.ts` : 8 tests de calcul.

Les tests ne créent aucune donnée métier et n’effectuent aucune validation sur la base partagée.
