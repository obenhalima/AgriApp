# Agronomie 360

Version locale — `/agronomie/dashboard`, menu Production → Agronomie 360. Aucune migration SQL ni déploiement nécessaires pour le code local ; les modules sources doivent être installés.

## Lecture

- La campagne en cours est sélectionnée automatiquement, puis toutes les fermes du client actif sont affichées. Plusieurs campagnes en cours : priorité à la date de début la plus récente, avec mention explicite ; sinon dates actives, puis dernière campagne disponible avec avertissement. La sélection manuelle reste possible.
- À l'ouverture de `/`, après chargement complet des habilitations, les utilisateurs ayant agronomie/consultation et un client actif arrivent sur Agronomie 360. Les autres gardent l'accueil historique. Les liens directs (notamment validations mobiles) et l'obligation de changement de mot de passe sont préservés.
- Synthèse exécutive : volume en tonnes, objectif restant, anneau d'avancement, priorités factuelles et prochaine échéance. Pas de tendance inventée, ni score de santé arbitraire. Les détails des règles sont repliables.
- Actualisation toutes les cinq minutes uniquement quand la page est visible ; le choix manuel de campagne est conservé pendant ces actualisations.
- Production brute, rendement pondéré par surface cumulée des plantations, pourcentage de l'objectif complet. Un objectif manquant n'est pas remplacé par zéro.
- Coûts enregistrés et coût/kg : calcul d'allocation existant sur la campagne entière, puis filtre ferme. Les imputations provisoires/incomplètes sont signalées.
- Volumes d'eau des confirmations d'irrigation et d'interventions disponibles : pas une consommation totale mesurée de toute la ferme.
- Stock actuel : valeur connue et articles sous leur seuil d'entrepôt. Indépendant de la campagne ; il ne s'agit pas d'une projection de pénurie des interventions futures.
- Priorités : interventions validées en retard, demandes soumises, plantations sans saisie récente pendant leur fenêtre prévue de récolte, stocks sous seuil.
- Horizon 7/15/30 jours et absence de récolte 3/7/15 jours : paramètres d'affichage locaux, pas modification de la politique de notifications.
- Courbe mensuelle des récoltes saisies, comparaison des rendements des huit premières serres, détail des serres, agenda et lecture économique.
- Le CA station est affiché seulement si disponible et intégralement valorisé selon les règles existantes. Il n'est pas assimilé au CA comptable facturé. Pas de marge inventée.

## Périmètre et précautions

Les parcelles/serres et récoltes sont paginées. Une demande multiserres est comptée une fois dans la ferme concernée. Une application partielle figure dans les interventions exécutées, sans être présentée comme une exécution complète. Les ratios ne constituent pas un classement de rentabilité à stades de culture identiques.

Les accès agronomie, production, récoltes, stocks et coûts sont respectés. Les données indisponibles sont signalées explicitement, indépendamment des autres sources. La navigation change de client en réinitialisant l'écran ; les réponses obsolètes sont ignorées. Aucun nouvel endpoint privilégié ni contournement RLS.

Cette vue ne prétend pas couvrir les mesures climatiques, analyses de laboratoire, conformité DAR, paie, besoins prévisionnels de stock ou toutes les données historiques du journal agronomique. Elle renvoie vers les modules spécialisés ; leurs filtres ne sont pas automatiquement transférés.

## Tests

- `lib/agronomy360.test.ts` : périmètre ferme, objectifs inconnus, ratio, fenêtre de récolte, activités partagées/fermées.
- `scripts/test-greenhouse-dialog.mjs` : sélection de campagne/ferme, horizon, rendu graphiques, largeur mobile, refus de la source financière, avec Supabase entièrement simulé.
- Contrôle TypeScript et inspection visuelle du dashboard.

Pas de publication GitHub/Vercel dans ce lot.
