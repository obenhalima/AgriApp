# Telegram — activation du pilote et ajout de personnes (lot 113)

## Périmètre et état

Préparé dans le dépôt, non déployé, SQL non appliqué par Codex. Ce lot permet d'inviter plusieurs employés, chacun avec son propre compte Telegram privé, et de vérifier leur société/ferme avec `/statut`.

Ce n'est PAS encore l'ouverture des saisies métier. Récoltes, pointages, envois station, prix, vocal/IA et récapitulatifs restent bloqués dans les fonctions livrées. Le code historique est conservé dans des fonctions non exposées, sans interrupteur permettant de le réactiver. Les parcours devront être migrés et testés séparément. Le message pilote est en français ; la langue choisie est conservée pour les futurs parcours.

Une personne = un employé actif = une ferme active d'une société active. Le rattachement direct de l'employé est prioritaire ; son équipe sert de repli uniquement sans ferme directe. Un changement de ferme invalide l'ancien accès et nécessite une nouvelle invitation. Les comptes historiques sans périmètre ne sont pas automatiquement autorisés.

## 1. Préparer Supabase

Vérifier le projet cible avant chaque déploiement. Si un ancien bot tourne déjà, déployer d'abord les fonctions sécurisées avec `TELEGRAM_PILOT_ENABLED=false` : l'ancien récap global doit également être neutralisé.

Dans le terminal du projet, avec la CLI Supabase installée et authentifiée :

```powershell
supabase functions deploy telegram-webhook --project-ref VOTRE_PROJECT_REF --no-verify-jwt
supabase functions deploy daily-recap --project-ref VOTRE_PROJECT_REF
```

Le webhook n'utilise pas de JWT Telegram : son secret d'en-tête est obligatoire. Ne pas appliquer `--no-verify-jwt` indistinctement aux autres fonctions. Le `daily-recap` livré retourne 503 et ne lit/envoie aucune donnée ; suspendre aussi son éventuel cron pour éviter les échecs répétitifs. Ne pas redéployer une ancienne version de ces deux fonctions.

Exécuter **en entier** `supabase/migrations/113_telegram_secure_enrollment.sql` dans le SQL Editor du projet. Prérequis : migrations existantes incluant 021, 022, 035, 072 et rattachement direct des employés déjà en place.

Le SQL remplace les anciennes politiques globales des deux tables chatbot, interdit les écritures directes depuis le navigateur et expose des RPC contrôlées. Il ne supprime aucun compte ni message. Les anciens comptes sans société/ferme devront être réinvités ; aucune attribution automatique.

## 2. Créer ou récupérer le bot

Dans Telegram, ouvrir le compte officiel **@BotFather**. Utiliser `/newbot` pour un nouveau bot, ou gérer le bot existant. Conserver son nom public et son jeton séparément. Ne jamais mettre le jeton dans un message FarmPilot, un commit, une capture ou une variable `NEXT_PUBLIC_*`.

Dans Supabase → Edge Functions → Secrets, définir :

| Secret | Valeur |
| --- | --- |
| TELEGRAM_BOT_TOKEN | Jeton fourni par BotFather |
| TELEGRAM_WEBHOOK_SECRET | Secret aléatoire fort, par exemple 64 caractères hexadécimaux |
| TELEGRAM_PILOT_ENABLED | `false` pendant la préparation, puis `true` pour le pilote |

Les variables Supabase internes sont déjà fournies aux Edge Functions. Aucune clé Gemini n'est nécessaire pour ce pilote. Les secrets ne se transmettent pas dans la conversation avec Codex.

## 3. Connecter Telegram au webhook

Utiliser `setWebhook` de l'API Telegram avec :

- URL : `https://VOTRE_PROJECT_REF.supabase.co/functions/v1/telegram-webhook` (pas localhost).
- `secret_token` : exactement le secret configuré côté Supabase.
- `allowed_updates` : `message` et `callback_query`.

Le script local `scripts/configure-telegram-webhook.ps1` demande les secrets en saisie masquée, identifie le bot, demande confirmation avant de modifier le webhook, puis affiche uniquement le résultat et le nombre de messages en attente. Il ne déploie rien et ne modifie pas les secrets Supabase.

```powershell
.\scripts\configure-telegram-webhook.ps1 -ProjectRef VOTRE_PROJECT_REF
```

Passer `TELEGRAM_PILOT_ENABLED` à `true` seulement après déploiement sécurisé et application du SQL. Garder l'ancien `daily-recap` désactivé. Le bot tourne alors sur Supabase : le PC local n'a pas besoin de rester allumé pour recevoir les messages.

Dans `.env.local`, ajouter seulement le nom public du bot, sans `@` :

```dotenv
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=NomDeVotreBot
```

Redémarrer le serveur local pour charger cette variable ; en déploiement web, configurer la même variable et reconstruire l'application. Sans cette variable, l'invitation reste utilisable en envoyant manuellement `/start CODE` au bon bot.

## 4. Ajouter chaque personne

1. Se connecter en administrateur de la société et sélectionner cette société dans FarmPilot.
2. Créer/vérifier l'employé dans RH : actif, rattaché à la bonne ferme active (directement ou via son équipe).
3. Ouvrir **RH → Chatbot Telegram**, `/rh/chatbot`.
4. Sélectionner l'employé/ferme et la langue, puis **Générer une invitation**. La confirmation rappelle que tout ancien accès/code de cet employé sera révoqué.
5. Transmettre en privé le lien d'invitation ou le nom du bot et `/start CODE`. Le code est personnel, valable 7 jours, consommé atomiquement une seule fois. Ne pas l'envoyer dans un groupe.
6. La personne ouvre une conversation privée avec le bot, puis clique Démarrer ou envoie la commande. Elle vérifie son nom, sa société et sa ferme.
7. Cliquer **Actualiser** dans FarmPilot : statut **Inscrit**. L'actualisation masque le code affiché ; le conserver avant si la personne n'est pas encore inscrite.
8. Répéter pour les autres employés. Un seul bot suffit ; chaque personne a son compte Telegram et son propre code.

Pour un code expiré ou un nouveau téléphone/compte Telegram : générer une nouvelle invitation. Pour couper l'accès : **Désactiver**. Le prochain message est refusé, même si un ancien bouton est toujours affiché sur Telegram. Un compte Telegram actif ne peut pas s'approprier un deuxième accès par un autre code.

## 5. Recette connectée obligatoire avant ouverture à plusieurs personnes

- Admin A : ne voit/invite que les employés de A, même en appelant les RPC manuellement avec un domaine B.
- Deux employés de deux sociétés/fermes : `/statut` affiche uniquement leur propre rattachement.
- Employé sans ferme, inactif ou ferme/société inactive : inscription/accès refusé.
- Code invalide, expiré, révoqué ou déjà consommé : aucun nouvel accès.
- Deux consommations concurrentes d'un code : une seule inscription. Deux invitations simultanées d'un employé : seule la dernière reste active.
- Désactiver l'accès puis renvoyer un message/ancien bouton : aucune donnée affichée.
- Changer la ferme de l'employé puis `/statut` : ancien accès refusé, réinvitation nécessaire.
- Groupe/canal : aucune inscription ni donnée, même avec un code valide.
- Webhook sans secret ou secret erroné : refus ; configuration absente ou pilote désactivé : 503.
- Ancien bouton de récolte, message vocal ou récap : aucune saisie, aucune lecture métier, aucun appel IA.
- Rejouer `/start` après une réponse Telegram perdue : le même accès est reconnu, pas de nouvel utilisateur.

Tests locaux : `node node_modules/vitest/vitest.mjs run supabase/functions/telegram-webhook/secure-pilot.test.ts`. Ils utilisent des simulations, pas la base distante. Le script de vérification SQL 113 est en lecture seule et ne remplace pas ces essais avec deux comptes réels.

Résultat local du 10 septembre 2026 : 13/13 tests réussis ; syntaxe TS/TSX des quatre fichiers applicatifs vérifiée, script PowerShell analysé sans erreur. Le contrôle TypeScript global signale des erreurs hors de ce lot dans les budgets, coûts et composants de factures ; ce n'est pas une validation globale de l'application. Aucune recette Telegram/Supabase réelle n'a encore été exécutée.

## 6. Lots suivants (non livrés ici)

1. Récoltes et pointage : filtrage serveur ferme/client, contrôle des identifiants de boutons et sessions, permissions par personne, conservation du blocage DAR, idempotence des messages.
2. Envois station/tri/prix : mêmes contrôles sur toutes les lectures et écritures, respect des validations et séparation des tâches.
3. Récapitulatifs individuels séparés par ferme/client, opt-in, autorisation de l'appel manuel/cron ; puis vocal avec son propre consentement et ses contrôles.

## Sources techniques

- [Création d'un bot Telegram](https://core.telegram.org/bots/tutorial)
- [Webhook et contrôle de son état](https://core.telegram.org/bots/api#setwebhook)
- [Secrets Supabase](https://supabase.com/docs/guides/functions/secrets)
- [Déploiement des fonctions](https://supabase.com/docs/guides/functions/deploy)
- [Configuration JWT des fonctions](https://supabase.com/docs/guides/functions/function-configuration)
