# Lot 129 — Performance & rentabilité

## Accès

Finance → Performance & rentabilité (`/couts/performance`). Client sélectionné dans l’en-tête ; filtres campagne, dates, ferme et variété. Comparaison par variété, serre ou ferme, avec synthèse du périmètre filtré.

## Calculs

- Rendement : kg récoltés / cumul des surfaces plantées des cycles retenus. Ce cumul n’est pas la surface cadastrale.
- Coût réel/kg : charges réelles imputées / kg récoltés (toutes catégories, déchets inclus).
- Même allocation des charges que « Coûts/kg et valorisation » : clé de la société (surface ou production) ; allocation sur la campagne complète avant filtrage ferme/variété ; conservation des centimes.
- CA estimé : catégorie 1 × prix export + catégories 2/3 × prix local. Prix de la plantation, sinon prix du référentiel variété. Absence de tarif nécessaire : CA/marge non calculables.
- CA station : montants saisis sur les lots station, filtrés par date de récolte. Ce n’est ni la facturation ni l’encaissement. Un lot non tarifé ou partiellement tarifé rend la marge station non calculable. Les montants partent de la convention DH des données saisies ; les devises restent à vérifier. Ne pas présenter ces marges comme un résultat comptable arrêté.
- Marge indicative : CA sélectionné moins charges imputées ; ratios par kg et m². Pas de moyenne simple des ratios entre serres.
- Budget séparé du réalisé ; budget/kg cible non disponible sur période partielle, budget incomplet ou objectif manquant.

## Classements et réserves

Cycles non terminés exclus du classement par défaut (mais visibles dans le tableau). Inclusion possible explicitement. Les valeurs inconnues ne deviennent pas zéro. Les petits ratios positifs sont affichés « < 0,01 ».

Classements financiers suspendus s’il existe des sorties non imputées ou des coûts non répartis dans le périmètre chargé (avant filtres locaux). Une ligne sans coût réel sur une plantation ou à valorisation provisoire n’est pas éligible au classement financier. Classement rendement disponible indépendamment de la complétude financière.

Même sans anomalie technique, l’exhaustivité des charges n’est pas certifiée. Les comparaisons restent provisoires, particulièrement sur une période partielle et entre cycles de maturités différentes.

## Détail

Au clic : charges directes/communes, catégories, montants des consommations imputées et produits, plantations et récoltes. La quantité d’une consommation affichée est la sortie totale du mouvement, pas une quantité réaffectée à chaque serre. Liens vers les charges et rapprochements.

## Sécurité et livraison

- Migration 129 : RPC de lecture uniquement, autorisation coûts/view et cloisonnement société/campagne.
- Chiffres de CA et prix masqués côté serveur sans marges/view.
- Aucun changement des traitements, récoltes, prix, stocks ou coûts sources.
- Tests : 103 unitaires, TypeScript, recette SQL annulée (périmètre, période, refus anonyme), navigateur PC/mobile avec backend simulé (filtres sans réaffectation, trois niveaux, détail, suspension classement).
- Scripts : `scripts/check-performance-sql.mjs`, `scripts/test-performance-report.mjs`.

## Refonte visuelle du dashboard — 14 septembre 2026

- Trame du Dashboard existant : cartes KPI à accents colorés, typographie et couleurs du thème, panneaux compacts et filtres visibles.
- KPI : récolte, avancement de l’objectif (hors période partielle), rendement pondéré, coût/kg, charges, CA et marge selon habilitation.
- Filtres campagne, dates, ferme, variété ; comparaison variétés / serres / fermes et critère de classement. Mise à jour des KPI et graphiques sur le même périmètre.
- Courbe de récoltes hebdomadaire / mensuelle, cumulée / par période, avec tableau accessible ; périodes intermédiaires sans récolte à zéro. Aucune date de charge inventée pour construire une courbe financière.
- Comparatif graphique des huit premiers éligibles, accès au détail et répartition des charges par catégorie.
- Exclusions des cycles en cours par défaut et contrôles de qualité financière conservés. Aucune nouvelle migration SQL.
- Vérifications : 106 tests unitaires, TypeScript, parcours navigateur simulé ordinateur/mobile, filtres et courbes. Aucun changement des données métier pendant les tests.
