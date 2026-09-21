# 106D — Transferts inter-entrepôts

Implémentation prête ; migration et recette base en attente.
Appliquer supabase/migrations/106d_stock_transfers.sql après 106B.
Menu Approvisionnement → Transferts, ou bouton Transferts dans Stocks.

Une demande porte sur un article et deux entrepôts actifs du même client.
Le stock est contrôlé à la demande puis atomiquement à l'expédition.
Le circuit stock_transfer est activé par défaut ; il se paramètre dans
Administration → Circuits de validation. Les niveaux, habilitations,
interdiction d'auto-validation et décisions automatiques utilisent le moteur existant.
Pour un client créé après la migration, configurer son circuit avant une demande.

Expédition : sortie source et état en transit dans une même transaction.
Réception intégrale : entrée destination et clôture dans une même transaction.
Chaque sens possède au maximum un mouvement par transfert. Le coût unitaire
est mémorisé à l'expédition et réutilisé à la réception.
Les quantités en transit sont exclues du stock disponible global et destination.
L'article n'est pas dupliqué ; l'affectation destination est créée à la réception.
Annulation possible avant expédition pour le demandeur ou administrateur.
Quantités à deux décimales, conformément au journal de mouvements existant.

Contrôle syntaxique TypeScript effectué. Les scénarios base sont décrits dans
supabase/verification/106d_stock_transfers_checks.sql et restent à exécuter après SQL.
Prochaine étape : 107A — disponibilité prévisionnelle par occurrence.
