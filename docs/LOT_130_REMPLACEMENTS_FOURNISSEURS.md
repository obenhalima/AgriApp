# Lot 130 — Remplacement d’un produit phyto livré

## État au 14 septembre 2026

Code disponible dans l’application locale. Base unique Supabase : **migration 130 appliquée après accord explicite de l’utilisateur**, aucun commit/push ni déploiement Vercel pour ce lot.
Vérifications réalisées : TypeScript, 115 tests unitaires, parcours navigateur simulé (demande, erreur avec conservation des saisies et de l’identifiant, réception d’un remplacement approuvé, file mobile). Recette SQL connectée exécutée avant puis après application, intégralement annulée : demande et reprise idempotentes, refus d’auto-validation et d’acteur étranger, refus de surcoût et de réception sans accord, données sources modifiées, quantité exacte, nouveau stock uniquement, prix accepté, aucune charge ni prescription créée. Zéro demande de substitution conservée après recette. Recette utilisateur dans son navigateur connecté encore à réaliser.

## Parcours préparé

1. Dans le détail d’un bon envoyé ou partiellement reçu : **Proposer un remplacement**.
2. Choisir ligne d’origine, entrepôt de ferme, cible / produit de la liste Station active déjà lié au stock ; saisir quantité du bon à couvrir, quantité effectivement livrée, prix dans la devise du bon et motif.
3. Dans **Approvisionnement → Remplacements phyto**, un responsable phytosanitaire habilité sur cette ferme, distinct du demandeur, accepte ou refuse avec justification.
4. Dans la réception du bon, sélectionner le remplacement approuvé. Entrepôt et quantité couverte sont repris ; le serveur doit vérifier leur correspondance. Le mouvement concerne exclusivement le nouvel article, la quantité réellement livrée et le prix accepté, converti en MAD si nécessaire.
5. L’ancienne ligne du bon n’est pas réécrite : son compteur reçu couvre la quantité commandée remplacée. Ce compteur n’est donc pas la quantité physique du nouveau produit ; celle-ci figure dans la demande et le mouvement de stock. L’accord, les données source, les acteurs, les dates et la référence de réception restent conservés.

## Règles de sécurité et limites du premier lot

- Demande et accord ne créent aucun stock ; entrée seulement à la réception confirmée. Identifiant de réception réutilisable après délai dépassé ; opérations SQL transactionnelles.
- Une demande ouverte par ligne. Pendant cette demande, réception standard de cette ligne bloquée ; les autres lignes restent réceptionnables. Annuler la demande pour revenir au produit original.
- Réception de la quantité exacte approuvée dans ce premier lot. Pour un fractionnement différent, annuler puis soumettre les quantités corrigées ; ne pas forcer les quantités dans la réception.
- Deux produits ne sont jamais considérés comme équivalents sur la seule matière active ou unité. Choix et quantités explicites, éligibilité de l’usage Station et unité contrôlées ; données sources changées → nouvelle demande nécessaire.
- **Règle proposée à valider** : surcoût par rapport à la portion remplacée du bon → nouveau BDC avec validation achat. Le responsable phyto ne peut augmenter seul un budget d’achat déjà validé.
- Les prescriptions existantes, doses, DAR, accords Station et applications passées ne sont pas modifiés. Pour utiliser le nouveau produit, préparer une nouvelle prescription et la faire valider ; annuler séparément les occurrences devenues inutiles. Pas de remplacement automatique en masse.
- La facture fournisseur doit être rapprochée des articles, quantités et prix réellement reçus ; le montant du BDC initial est conservé.
- La file de décision est responsive ; **envoi de notifications et intégration à “Mes validations” non inclus** dans ce premier lot. À compléter avant de considérer le parcours mobile automatique comme livré.

## Recette connectée (SQL exécutée ; vérification utilisateur à poursuivre)

| Scénario | Attendu |
|---|---|
| Utilisateur d’un autre client, demande étrangère, entrepôt étranger | Refus serveur, aucune écriture |
| Demandeur tente de valider ; responsable d’une autre ferme | Refus |
| Responsable phyto actif et habilité, autre utilisateur | Décision enregistrée avec justification |
| Double clic / reprise après délai dépassé | Pas de demande ni entrée dupliquée ; identité réutilisée |
| Même identifiant de demande avec contenu modifié | Refus |
| Liste remplacée, usage ou unité modifiés après accord | Réception refusée, nouvelle demande requise |
| Réception avant accord / mauvais entrepôt / quantité différente | Refus atomique |
| 5 L du bon couverts par 2,50 kg d’un autre produit | +2,50 kg du nouveau produit, aucun ajout à l’ancien ; 5 unités couvertes sur le bon |
| Prix et change | CUMP calculé sur valeur réellement reçue, pas sur ancien prix |
| Surcoût proposé | Nouveau BDC demandé, pas de contournement du circuit achat |
| Autres lignes sans substitution | Parcours de réception standard conservé |
| Annulation / refus / réception réussie | Statuts et historique actualisés |
| Prescription approuvée existante | Inchangée ; nouvelle validation nécessaire pour un autre produit |

Migration préparée : `supabase/migrations/130_purchase_phyto_substitutions.sql`.

Après cette recette et validation utilisateur seulement : GitHub puis Vercel. Ne pas appliquer la migration sur Supabase sans accord : même avec l’interface locale, cette base est partagée avec Vercel.
