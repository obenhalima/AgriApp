# Lot 1 — Suite de la recette, 2 octobre 2026

Migration 143 préparée, NON APPLIQUÉE à Supabase. Pas de publication.

## Bordereaux

La migration remplace les deux RPC de 069 sans rejouer sa reprise historique. Prix pondéré à la validation et recalcul du prix résiduel à l'annulation. Conservation d'une référence de bordereau restant. Refus d'annulation si une facture est explicitement liée au bordereau ou à un lot alloué. Refus de revalidation d'un brouillon encore facturé.

Chaque ligne doit préciser une ferme autorisée (permission récoltes/edit), avec FIFO limité à son domaine. Les anciennes lignes « toutes fermes » doivent donc être ventilées avant traitement. Lignes verrouillées et ordre FIFO déterministe. Aucun rapprochement implicite sur le nom d'une facture : les factures historiques sans lien ne peuvent pas être détectées avec certitude.

Tests `scripts/test-settlement-corrections.sql`, sur PostgreSQL local jetable avec schéma minimal et authentification simulée : 100 kg acceptés, A=40 kg×2 et B=60 kg×4 donnent 320 et un prix moyen de 3,2. Annulation B donne 80 et un prix de 2 ; revalidation rétablit 320 sans doublon. Double validation, stock insuffisant, annulation facturée et ferme absente refusés. Recette complète sur copie du schéma réel requise avant application.

## Risques encore ouverts

1. Composition (`app/recoltes/page.tsx`) : lot puis sources créés séparément. Échec partiel possible. Regroupement par variété uniquement : revoir les groupes multi-fermes. Remplacer par RPC atomique avec recalcul du disponible sous verrou et idempotence.
2. Tri (même fichier) : parent enregistré puis retour/écart créé. Certaines erreurs enfant sont seulement journalisées. Transaction parent/enfant nécessaire, avec contrôle des quantités et protection des lots déjà tarifés.
3. Pesée (059) : contributions sources réécrites proportionnellement. Conserver une quantité d'origine distincte pour éviter de soustraire des kilos pesés d'un disponible au champ encore estimé lors d'envois partiels.
4. Stock retour : marquer « renvoyé » n'est pas une réexpédition traçable. Lier la sortie réelle au lot enfant et contrôler son disponible.
5. Facturation : certains anciens bordereaux multi-marchés ne référencent qu'une première facture. Une liaison exhaustive reste nécessaire avant calcul fiable du reste à facturer.

Lot 1 non clôturé. Aucune donnée réelle modifiée.
