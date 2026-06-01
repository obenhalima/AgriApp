# Roadmap FramPilot / AgriApp

> Backlog des évolutions produit pour le pilotage de production agricole
> du Domaine BENHALIMA (tomates serres, Maroc).
>
> Format : **🔥 P1 (urgent)** · **⚡ P2 (important)** · **💡 P3 (nice-to-have)**

---

## 📦 MODULE TRI / DISPATCHES / RÉCOLTES

### ✅ P1 — Destination du rejet (freinte / écart) — **LIVRÉ V1 mai 2026**

Implémenté dans le sprint mai 2026. **V1 livrée** :

- [x] Migration 038 : colonne `destination_rejet` sur `harvest_lots`
  - 4 valeurs : `destruction` | `retour_stock` | `vente_industrie` | `dons`
- [x] Colonnes `rejet_qty_kg` et `parent_dispatch_id` pour audit
- [x] **Page Web `/recoltes`** — modal Tri étendu :
  - Affiche le détail Rejet (Brute − Acceptée)
  - Sélecteur visuel 4 cartes (icône + description)
  - Si `retour_stock` : message d'info qui prévient de la création du lot enfant
- [x] **Création automatique du `harvest_lot` enfant** `category='stock_retour'`
  - Numéro de lot `{ORIGINAL}-RETOUR`
  - `parent_dispatch_id` pointe vers le dispatch d'origine
  - `tri_status='pending'` (disponible pour ré-envoi)
- [x] **Nouvel onglet "🔄 Stock retour"** sur `/recoltes`
  - Liste des lots de retour disponibles
  - Boutons "✅ Renvoyé" et "🗑️ Détruit" pour marquer la consommation
- [x] **Bot Telegram** — étape après écart% :
  - Nouvelle étape `ask_destination_rejet` avec 4 boutons inline
  - i18n en 4 langues (FR / EN / AR classique / Darija arabe)
  - Création auto du stock_retour identique à la version Web
  - Message de confirmation enrichi avec mention du lot enfant créé

**V2 (à venir)** :

- [ ] Composition directe d'un nouvel envoi station depuis un lot stock_retour
- [ ] Mettre à jour le calcul du CA : `qty_rejet × prix_marche_secondaire`
  quand le retour est ré-envoyé
- [ ] Stats périodiques : "% rejets valorisés" comme KPI Dashboard CEO

**Impact estimé V1** : visibilité totale sur la destination du rejet,
audit trail complet. **Impact estimé V2** : +5-15% CA récupéré.

---

## 💰 MODULE FACTURATION & TARIFICATION STATION

### ✅ P1 — Bordereaux station (tarification hebdomadaire) — **LIVRÉ V1 juin 2026**

La station de conditionnement envoie chaque semaine un bordereau qui paye
les dispatches déjà triés. Un dispatch peut être tarifé partiellement sur
plusieurs bordereaux (split FIFO).

- [x] **Migration 040** — 3 nouvelles tables :
  - `station_settlements` (en-tête bordereau, 1 par semaine ISO)
  - `station_settlement_lines` (1 ligne par farm × market × variety)
  - `station_settlement_allocations` (FIFO sur N dispatches)
- [x] Code auto-généré format `SET-YYYY-Www` via trigger
- [x] Colonnes `qty_priced_kg` + `settlement_id` sur `harvest_lots`
- [x] Trigger de maintenance `total_amount` / `total_qty_kg`
- [x] **Migration 041** — RPC `admin_validate_station_settlement(uuid)` :
  - Algorithme FIFO (date_lot ASC) sur les dispatches `tri_status='tried'`
  - Met à jour `qty_priced_kg` + bascule `tri_status='priced'` quand lot soldé
  - Atomique (échoue si stock insuffisant)
  - RPC complémentaire `admin_unvalidate_station_settlement` pour revenir en arrière
- [x] **Helpers** `lib/stationSettlements.ts` :
  - `getUnpricedLotsSummary()` — stock dispo agrégé market × variety × farm
  - `buildMatrix()` — fusion stock + lignes existantes pour saisie
  - `createCurrentWeekSettlement()` — création idempotente par semaine ISO
- [x] **UI** nouveau sous-onglet "Bordereaux station" dans `/factures`
  - Liste des bordereaux (brouillon + validés)
  - Modal matrice market × variety × farm avec dispo / qty / prix
  - Validation des quantités vs stock dispo
  - Boutons Valider FIFO / Annuler validation
  - Vue en lecture seule pour bordereaux validés

**V2 (à venir)** :

- [ ] Génération d'une vraie `invoice` (facture client) à la validation
- [ ] Lien `harvest_lots ↔ invoices` pour suivi croisé prix payé / coût production
- [ ] Vue "Bordereaux en retard" (>2 semaines sans validation)
- [ ] Stats : prix moyen par variété par mois sur graphique

**Impact V1** : workflow officiel station ↔ exploitation tracé en base,
prêt pour audit. Plus de saisie ad-hoc dans Excel.

---

## 🤖 MODULE CHATBOT TELEGRAM

### ⚡ P2 — TTS (text-to-speech) pour les réponses du bot
Permettre aux ouvriers ne lisant pas de recevoir les confirmations en
audio (synthèse vocale via Google Cloud TTS ou ElevenLabs).

### ⚡ P2 — Intégration WhatsApp Business
En plus de Telegram, supporter WhatsApp via WhatsApp Business API.
Workflow identique mais via Twilio ou Meta API directe.

### 💡 P3 — Reconnaissance vocale offline (Vosk)
Pour les zones sans réseau stable, fallback de transcription locale
sur le téléphone via Vosk (modèles compacts arabe/français).

---

## 📊 DASHBOARD CEO & ANALYTIQUE

### ⚡ P2 — Bench mark inter-fermes automatique
Comparaison automatique des fermes sur indicateurs filière :
- kg/m² vs objectif
- Coût/kg produit
- % qualité Cat. 1
- Délai de rotation Plantation → 1ère récolte

### 💡 P3 — Prédiction du yield via ML
Modèle simple (régression) basé sur historique campagne, variété,
type de serre, mois de plantation → prédiction kg total.

### 💡 P3 — Alertes intelligentes proactives
Email/Telegram quotidien quand :
- Yield diverge de >20% vs prévision
- Stock intrants critique sous le seuil de sécurité
- Facture client en retard > 30j

---

## 🚜 MODULE PRODUCTION

### ⚡ P2 — Carnet de bord agronomique
Pour chaque plantation, log quotidien :
- EC / pH de l'eau d'irrigation
- T°C jour/nuit
- HR (humidité relative)
- Stade phéno (BBCH)
- Observations sanitaires (maladies, ravageurs)

### 💡 P3 — Intégration capteurs IoT
Si la ferme s'équipe : ingestion automatique des données capteurs
(stations météo, sondes substrat) via MQTT.

---

## 💰 MODULE FINANCE

### ⚡ P2 — Multi-devises (EUR / MAD / USD)
Tableau de bord avec conversion automatique au taux du jour.
Particulièrement utile pour le CA Export (EUR) vs charges locales (MAD).

### ⚡ P2 — Gestion des taxes export
TVA exonérée Export, droits de douane par destination, ATR/EUR.1.

### 💡 P3 — Forecasting cash flow rolling 90j
Vue glissante 90 jours encaissements prévus vs décaissements prévus.

---

## 👥 MODULE RH

### ⚡ P2 — Pointage par chatbot Telegram
Les ouvriers déclarent leur arrivée/départ via Telegram (au lieu
de la pointeuse physique).

### 💡 P3 — Calcul payroll automatique CNSS Maroc complet
Génération des bordereaux CNSS officiels (BDS) prêts pour soumission.

---

## 🛡️ ADMINISTRATION & SÉCURITÉ

### ⚡ P2 — Logs d'audit centralisés
Table `audit_logs` pour tracer qui a fait quoi (modifications
critiques : suppression campagne, changement de prix, etc.).

### ⚡ P2 — Export/Import de configuration complète
Permettre à un admin de sauvegarder/restaurer toute la config
métier (workflows, comptes comptables, paramètres) en JSON.

### 💡 P3 — Mode multi-tenant (multi-domaines agricoles)
Architecture qui permet à plusieurs domaines indépendants d'utiliser
la même instance avec isolation totale.

---

## 🎨 UX / UI

### ⚡ P2 — Mode mobile-first complet
Audit page par page pour assurer une bonne expérience sur smartphone
(actuellement plutôt tablet/desktop friendly).

### 💡 P3 — Thèmes personnalisables par utilisateur
Au-delà du dark/light, permettre des thèmes de couleur custom (utile
pour daltoniens ou préférences visuelles).

---

## 📅 HISTORIQUE DES SPRINTS RÉCENTS (mai 2026)

- ✅ Refonte UI complète + design system (Card / Badge / KPICard / DataTable)
- ✅ Module Plan de culture (Dashboard + Plan + Volumes + Gantt)
- ✅ Assistant IA + insights Dashboard CEO
- ✅ Bot Telegram multilingue (FR / Darija arabe / Arabe / EN)
- ✅ Export Excel formaté multi-onglets (Compte d'exploitation + Budgets)
- ✅ Page admin /demo-reset (Nuclear / Reset / Wizard / Générateur récoltes)
- ✅ Migration 036 (RPC admin défensives) + 037 (Reseed workflows)
- ✅ Générateur Commerce (dispatches + tri + prix + factures)
- ✅ Dashboard CEO aligné sur logique récoltes × prix variété
- ✅ Vue Budget Multi-fermes avec sous-totaux par ferme

---

*Dernière mise à jour : voir `git log ROADMAP.md` pour l'historique.*
