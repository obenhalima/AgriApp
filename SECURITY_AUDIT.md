# Audit de sécurité — FarmPilot (Next.js + Supabase)

> Audit du 2026-06. Périmètre : RLS, fonctions `SECURITY DEFINER`, Edge Functions
> (Deno), exposition de secrets côté client, dépendances. Méthode : 4 audits
> spécialisés + vérification manuelle des findings à fort impact.
>
> **Note de méthode** : les RPC admin destructives (`admin_nuclear_wipe`,
> `admin_delete_campaign`, `admin_bulk_delete_harvests`, `admin_validate_*`,
> `admin_generate_*_invoice`, `admin_reseed_workflows`) **sont protégées** —
> elles vérifient `is_admin_caller()` / `is_admin(auth.uid())` dans leur corps.
> Le `GRANT … TO authenticated` est le pattern Supabase requis et n'est PAS une
> faille en soi. Elles ne figurent donc pas dans les criticités ci-dessous.

---

## 🔴 CRITIQUE — à corriger en priorité

### C1. RPC `admin_weigh_station_dispatch` sans contrôle d'autorisation
- **Fichier** : `supabase/migrations/055_station_weighing.sql:31`
- **Problème** : aucune vérification `auth.uid()` / `is_admin`. `GRANT EXECUTE … TO authenticated`.
- **Exploit** : **n'importe quel utilisateur connecté** (rôle opérateur, commercial…) peut appeler
  `admin_weigh_station_dispatch(lot, 0.01)` → falsifie le poids réel pesé → fausse le tri, le CA et les factures.
- **Impact** : intégrité financière (fraude sur tonnage/CA).
- **Régression introduite récemment (Lot 2 pesée station).**

### C2. RPC `create_ecart_dispatch` sans contrôle d'autorisation
- **Fichier** : `supabase/migrations/048_ecart_buyer.sql:87`
- **Problème** : aucun check d'identité ; `GRANT … TO authenticated`.
- **Exploit** : tout utilisateur connecté crée des dispatches « écart » fictifs.
- **Impact** : pollution des données commerciales / stock.

### C3. Edge Functions modifiant l'état SANS autorisation du rôle
- **Fichiers** :
  - `supabase/functions/workflow-transition/index.ts:72-79` (commentaire : *« userId optionnel »*)
  - `supabase/functions/purchase-order-receive/index.ts` (JWT optionnel)
  - `supabase/functions/purchase-order-direct/index.ts` (JWT optionnel)
- **Problème** : la fonction utilise le **service_role** (bypass RLS) et n'exige ni JWT valide ni rôle.
  L'`userId` n'est lu que « si présent ». Appelable avec la **clé anon publique**.
- **Exploit** : un visiteur (clé anon = publique) peut faire transiter des documents, réceptionner
  des BL, créer des bons d'achat.
- **Impact** : intégrité des workflows / stock / achats.

### C4. Webhook Telegram — secret optionnel
- **Fichier** : `supabase/functions/telegram-webhook/index.ts:1546`
- **Problème** : la vérif `X-Telegram-Bot-Api-Secret-Token` est **sautée si `TELEGRAM_WEBHOOK_SECRET`
  n'est pas défini** (`if (TELEGRAM_WEBHOOK_SECRET) { … }`).
- **Exploit** : si le secret n'est pas configuré en prod, n'importe qui connaissant l'URL peut forger
  un update Telegram et **enregistrer des récoltes au nom d'un ouvrier** (en connaissant son chat_id).
- **Action** : rendre le secret **obligatoire** (rejeter si absent) + vérifier qu'il est bien défini en prod.

---

## 🟠 ÉLEVÉ

### H1. Confidentialité paie — bulletins/CNSS/congés lisibles par TOUS les connectés
- **Fichier** : `supabase/migrations/018_hr_module.sql:204`
- **Problème** : `payslips`, `payroll_periods`, `leave_requests`, `leave_balances`, `cnss_declarations`
  ont `FOR SELECT TO authenticated USING (true)`.
- **Exploit** : tout employé connecté lit **tous les salaires, cotisations, congés** de ses collègues.
- **Impact** : confidentialité RH (et conformité). L'écriture est correctement admin-only.
- **Correctif** : restreindre la lecture à `is_admin(auth.uid())` (V1) ou à l'employé propriétaire.

### H2. RLS d'écriture trop permissive — `USING(true) WITH CHECK(true)`
- **Fichiers** :
  - `003_harvest_station_price.sql:16` (harvest_station_prices)
  - `004_recoltes_marche_daily.sql:23,44` (harvest_market_prices, harvest_daily_status)
  - `054_harvest_trays.sql:57` (**harvest_tray_lines — introduit récemment, Lot 1**)
- **Problème** : `FOR ALL TO authenticated USING(true) WITH CHECK(true)` → tout connecté peut
  créer/modifier/supprimer **tous** les enregistrements (prix station, prix marché, lignes de plateaux).
- **Impact** : falsification de prix / traçabilité.
- **Correctif** : lecture `USING(true)`, écriture gated `is_admin` **ou** appartenance (`recorded_by = auth.uid()`).

### H3. `ai-analyze-cpc` — aucune auth + CORS `*`
- **Fichier** : `supabase/functions/ai-analyze-cpc/index.ts:10,169`
- **Problème** : pas de vérification JWT ; reçoit des **données comptables** et les envoie à Gemini.
- **Exploit** : appelable par n'importe qui ; exfiltration possible + injection de prompt (`messages`).
- **Correctif** : exiger un JWT valide, restreindre CORS au domaine, borner les entrées.

### H4. Appels Edge Functions IA avec la clé anon en Bearer (pas le token de session)
- **Fichiers** : `lib/aiAnalysis.ts:43`, `lib/aiChat.ts:45`
- **Problème** : `Authorization: Bearer ${anonKey}` au lieu de `session.access_token`.
  → l'Edge Function ne peut pas identifier l'appelant (cohérent avec C3/H3).
- **Correctif** : utiliser `supabase.auth.getSession()` → `access_token` (cf. `lib/adminUsers.ts:61` qui le fait bien).

### H5. Dépendances vulnérables (npm audit)
- **xlsx** : Prototype Pollution + ReDoS — **pas de patch** (utilisé pour export/import Excel).
- **tmp** : Path Traversal (HIGH). **postcss** (via Next) : XSS. **ws** : fuite mémoire.
- **Correctif** : `npm audit`, monter Next.js, envisager `xlsx` → fork maintenu (`@e965/xlsx`) ou cantonner xlsx à des fichiers de confiance.

---

## 🟡 MOYEN

- **M1. CORS `*` sur toutes les Edge Functions** (`admin-create-user`, daily-recap, etc.) — restreindre au domaine de prod.
- **M2. Garde d'accès admin côté client uniquement** (`app/admin/**/page.tsx` : `if (!isAdmin) return …`).
  Atténué par la RLS/RPC côté serveur pour les **actions**, mais l'UI admin reste affichable → fuite d'info. À doubler d'une vérif serveur pour les pages très sensibles.
- **M3. XSS potentiel** : `app/rh/chatbot/page.tsx:346` `dangerouslySetInnerHTML` sur `recapPreview`.
  Source actuellement maîtrisée (Edge Function), mais fragile — assainir ou rendre via texte + `<br/>` contrôlés.
- **M4. Annuaire exposé** : `profiles` / `users` lisibles par tout connecté (emails, noms, rôles) → énumération / phishing.

---

## ✅ Points conformes (vérifiés)

- `SUPABASE_SERVICE_ROLE_KEY` **jamais** exposé côté client ; seules `NEXT_PUBLIC_*` (URL + anon key) le sont.
- `.env.local` **non committé** (présent dans `.gitignore`) ; `.env.example` sans vraies valeurs.
- RLS **activée** sur toutes les tables `public.*` (migration 023 balaie le reste).
- RPC admin destructives **protégées** par `is_admin_caller()` (le `GRANT authenticated` est normal).
- `admin-create-user` **vérifie le JWT + le rôle admin** avant de créer un compte. ✅
- Toutes les fonctions `SECURITY DEFINER` ont `SET search_path = public` (anti-détournement).
- Pas de secret en dur, pas d'`eval`, pas de token en `localStorage`, pas de log de secrets.

---

## Plan de remédiation proposé

**Lot sécurité 1 (rapide, fort impact)** — migration `059_security_hardening.sql` — ✅ **FAIT** :
1. ✅ Ajout de `is_admin(auth.uid())` à `admin_weigh_station_dispatch` (C1) et `create_ecart_dispatch` (C2).
2. ✅ Policies `USING(true) WITH CHECK(true)` (H2) remplacées : lecture ouverte, écriture admin ; `harvest_tray_lines` = INSERT ouvert (saisie caporal) mais UPDATE/DELETE admin.
3. ✅ Lecture paie/CNSS/congés (H1) restreinte à `is_admin` (V1).
> ⚠️ Effet de bord : la **pesée station** et la **création d'écart** exigent désormais l'admin. Ajouter un rôle « opérateur station » plus tard si des non-admins doivent peser.

**Lot sécurité 2 (Edge Functions)** :
4. Rendre `TELEGRAM_WEBHOOK_SECRET` obligatoire (C4).
5. Exiger un JWT valide + rôle dans workflow-transition / purchase-order-* (C3) et ai-analyze-cpc (H3).
6. Corriger `lib/aiAnalysis.ts` / `aiChat.ts` → token de session (H4).
7. Restreindre CORS au domaine (M1).

**Lot sécurité 3 (hygiène)** : `npm audit` (H5), garde serveur pages admin (M2), assainir le chatbot (M3).
