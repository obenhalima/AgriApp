# Rapport de tests FarmPilot

Date de début : 27 août 2026  
Environnement : application locale Next.js, base Supabase configurée dans `.env.local`  
Méthode : inspection statique, tests navigateur Playwright/Edge et tests automatisés existants.

## Synthèse

| Lot | Module | Statut | Résultat |
|---|---|---:|---|
| 0 | Tests unitaires existants | Validé | 21/21 tests réussis |
| 1 | Authentification et permissions | Avec réserves | Connexion invalide correctement rejetée, mais protections de routes et accessibilité à renforcer |
| 2 | Référentiels agricoles | À tester | Fermes, serres, cultures, variétés |
| 3 | Planification et production | À tester | Campagnes, plan de culture, plantations |
| 4 | Récoltes et station | À tester | Récoltes, lots, pesée, tri, bordereaux |
| 5 | Commerce et facturation | À tester | Marchés, clients, commandes, factures |
| 6 | Achats et stocks | À tester | Fournisseurs, bons d'achat, réceptions, stocks |
| 7 | Finance analytique | À tester | Coûts, budgets, amortissements, CPC, marges |
| 8 | Ressources humaines | À tester | Employés, pointage, paie, congés, CNSS |
| 9 | Administration et intégrations | À tester | Imports, référentiels, workflows, IA, Telegram |

## Lot 0 — Tests unitaires existants

Commande : `npm.cmd test -- --reporter=verbose`

Résultat :

- 2 fichiers de tests réussis ;
- 21 tests réussis ;
- aucune erreur ;
- couverture fonctionnelle limitée aux moteurs `coutRevient` et `productivite`.

## Lot 1 — Authentification et permissions

### Scénarios exécutés

| ID | Scénario | Résultat attendu | Résultat obtenu | Verdict |
|---|---|---|---|---|
| AUTH-01 | Ouvrir `/` sans session | Redirection vers `/login` | Redirection effectuée | Conforme |
| AUTH-02 | Ouvrir `/admin/users` sans session | Redirection vers `/login`, sans chargement de données | Redirection effectuée, mais des requêtes `roles` et `profiles` partent avant la redirection | Réserve |
| AUTH-03 | Ouvrir `/factures` sans session | Redirection vers `/login`, sans chargement de données | Redirection effectuée, mais plusieurs requêtes métier partent avant la redirection | Réserve |
| AUTH-04 | Ouvrir `/recoltes` sans session | Redirection immédiate vers `/login` | Le contenu de la page Récoltes a pu être rendu pendant le test et la navigation vers `/login` a été avortée | Échec |
| AUTH-05 | Soumettre des identifiants invalides | Refus et message compréhensible | Message `Email ou mot de passe incorrect`, URL inchangée | Conforme |
| AUTH-06 | Soumettre un formulaire vide | Soumission impossible | Bouton désactivé et champs requis | Conforme |
| AUTH-07 | Identifier les champs par leur libellé accessible | Les libellés doivent cibler les champs | `getByLabel('Email')` ne trouve pas le champ | Échec |
| AUTH-08 | Vérifier les permissions d'un utilisateur non-admin | Routes et actions interdites inaccessibles | Non exécuté : aucun compte de test par rôle n'est disponible | Bloqué par données de test |
| AUTH-09 | Vérifier connexion/déconnexion valide | Connexion, persistance puis suppression de session | Non exécuté : aucun compte de test dédié n'est disponible | Bloqué par données de test |

### Anomalies

#### AUTH-BUG-01 — Garde d'authentification uniquement côté client

- Gravité : haute.
- Fichier principal : `components/layout/AppShell.tsx`.
- Comportement : les composants de page sont montés avant que l'effet `router.replace('/login')` termine la redirection.
- Conséquence : flash de contenu protégé et lancement de requêtes Supabase inutiles avant redirection. Sur `/recoltes`, la redirection a même été avortée pendant un scénario.
- Sécurité effective : elle dépend de la RLS Supabase. La navigation Next.js ne constitue pas une frontière de sécurité.
- Recommandation : ajouter une protection serveur par middleware/cookies Supabase, puis ne pas rendre les enfants tant que l'utilisateur n'est pas authentifié.

#### AUTH-BUG-02 — Les permissions filtrent le menu mais protègent peu de routes

- Gravité : haute pour le contrôle fonctionnel, critique si une politique RLS correspondante manque.
- Constat : la sidebar applique `canAccessModule`, mais seulement 7 pages sur 46 contiennent une vérification explicite `isAdmin`, `canAccessModule` ou `hasPermission`.
- Conséquence : un utilisateur connecté peut saisir directement l'URL d'un module absent de son menu. La RLS doit alors bloquer chaque lecture et chaque écriture.
- Recommandation : créer une garde de route/module centralisée et conserver les contrôles RLS/RPC côté base.

#### AUTH-BUG-03 — Libellés du formulaire non associés aux champs

- Gravité : moyenne.
- Comportement : un sélecteur accessible par libellé ne retrouve ni le champ Email ni le champ Mot de passe.
- Conséquence : navigation et compréhension dégradées avec les technologies d'assistance.
- Recommandation : générer un `id` pour chaque champ et relier le `<label>` avec `htmlFor`, ou envelopper directement l'input dans le label.

### Points conformes

- Les identifiants invalides sont rejetés par Supabase.
- Le message d'erreur est traduit et ne divulgue pas si l'adresse existe.
- Le mot de passe est saisi dans un champ de type `password`.
- Le bouton est désactivé tant que les deux champs ne sont pas renseignés.
- Une page `/login` dédiée existe et un utilisateur déjà connecté doit être renvoyé vers `/`.
- Le rôle administrateur et les permissions `module.action` sont chargés depuis Supabase.
- Les clés `service_role` ne sont pas utilisées dans le navigateur d'après l'audit du dépôt.

### Limites du lot 1

Les tests complets de rôles nécessitent au minimum deux comptes dédiés :

- un administrateur de test ;
- un utilisateur restreint avec un petit ensemble de permissions.

Les tests ne doivent pas utiliser les identifiants personnels ou le compte administrateur réel.

