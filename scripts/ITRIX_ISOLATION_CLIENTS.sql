-- ITRIX: CONSOLIDATED INSTALLATION V3. RUN THIS FILE ONLY.
-- 45 crops (24 active / 21 inactive), 69 suggestions across three clients.
-- 12 active varieties: four independent varieties per client with domain_id.
-- Applies the isolation package. FULL DATABASE BACKUP REQUIRED BEFORE RUNNING.
-- Run the WHOLE file in the Supabase SQL Editor and return isolation_check.
-- Supersedes separate execution of 150..154; do not run them afterwards.
-- All installation statements execute inside ONE server-side DO statement.
-- Any installation error aborts that statement with no partial installation.
-- PostgreSQL execution is not verified by local source/unit tests.
-- Not a rollback button for business imports. That requires a separate module
-- application journal and server API. Never revert tenant isolation from the UI.
-- Commercial preferences remain guarded; empty legacy settlements quarantined.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
DO $itrix_install_v3$
DECLARE report jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('itrix_client_reference_install_v3',0));
 EXECUTE $itrix_ddl_v3$
-- Source: 150_freeze_shared_business_references.sql
-- Emergency containment, NOT tenant isolation.
-- Keeps existing reads and foreign keys intact until client-specific copies
-- and all dependent references have been migrated and verified.
-- Apply only after validating the deployed schema and taking a backup.

CREATE OR REPLACE FUNCTION public.guard_shared_business_reference_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- JWT identity survives SECURITY DEFINER: client RPCs cannot bypass this guard.
  IF auth.role() IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Référentiel partagé temporairement en lecture seule : isolation par client requise.'
      USING ERRCODE = '42501';
  END IF;
  IF TG_LEVEL = 'STATEMENT' THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_shared_business_reference_write() FROM PUBLIC;

DO $containment$
DECLARE reference_table text;
BEGIN
  FOREACH reference_table IN ARRAY ARRAY[
    'varieties', 'crops', 'crop_variety_catalog',
    'reference_lists', 'reference_values', 'seed_suppliers',
    'app_settings', 'exchange_rates', 'account_categories',
    'workflow_definitions', 'workflow_states', 'workflow_transitions'
  ] LOOP
    -- Do not freeze an already isolated table without reviewing its policies.
    IF EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=reference_table AND column_name='domain_id') THEN
      RAISE EXCEPTION 'Table % déjà rattachée à un client : vérifier la migration avant application.', reference_table;
    END IF;
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false)', reference_table || '_shared_insert_frozen', reference_table);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false)', reference_table || '_shared_update_frozen', reference_table);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (false)', reference_table || '_shared_delete_frozen', reference_table);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_shared_business_reference_write()', reference_table || '_shared_write_guard', reference_table);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_shared_business_reference_write()', reference_table || '_shared_truncate_guard', reference_table);
  END LOOP;
END
$containment$;

-- Source: 151_client_reference_ownership_preparation.sql
-- EXPANSION ONLY. Does not assign, duplicate, delete or remap existing data.
-- Not a completed isolation migration: keep reference writes frozen until the
-- reviewed ownership map, relational remapping and RLS cutover are validated.

DO $prepare$
DECLARE reference_table text;
BEGIN
  FOREACH reference_table IN ARRAY ARRAY['varieties','crops','seed_suppliers','crop_variety_catalog'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = format('public.%I', reference_table)::regclass
      AND tgname=reference_table || '_shared_write_guard' AND NOT tgisinternal AND tgenabled <> 'D') THEN
      RAISE EXCEPTION 'Écritures partagées non verrouillées sur % : valider le confinement avant préparation.', reference_table;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS domain_id uuid REFERENCES public.domains(id) ON DELETE RESTRICT', reference_table);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(domain_id)', reference_table || '_client_ownership_idx', reference_table);
  END LOOP;
END
$prepare$;

-- Private plan: one explicitly reviewed destination per source/client.
-- No authenticated user can read or write the plan, including a tenant admin.
CREATE TABLE public.client_reference_migration_plan (
  reference_table text NOT NULL CHECK (reference_table IN ('varieties','crops','seed_suppliers','crop_variety_catalog')),
  source_id uuid NOT NULL,
  domain_id uuid NOT NULL REFERENCES public.domains(id) ON DELETE RESTRICT,
  destination_id uuid NOT NULL,
  approved boolean NOT NULL DEFAULT false,
  evidence text NOT NULL CHECK (length(trim(evidence)) > 0),
  PRIMARY KEY(reference_table,source_id,domain_id),
  UNIQUE(reference_table,destination_id)
);
ALTER TABLE public.client_reference_migration_plan ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.client_reference_migration_plan FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_reference_migration_plan TO service_role;

-- Source: 152_approved_client_reference_plan.sql
-- PLAN ONLY, NOT CUTOVER. Requires reviewed 150/151 first.
-- No production execution authorized. Does not change crops, varieties or history.
-- User-approved: CHRY active STALSON/BEN; MARQ active BEN and linked to Tomate;
-- DURASOL/SAIKO STAR active BEN501. Three independent Tomate destination rows.

ALTER TABLE public.client_reference_migration_plan
  ADD COLUMN target_active boolean,
  ADD COLUMN target_crop_source_id uuid;

DO $approved_plan$
DECLARE
  tomato uuid := '67c4a6a8-d572-42e4-884f-f32f12c0a1aa';
  stalson uuid := '5f4db5a9-195b-45ce-bccf-c5ac7e61dc81';
  ben uuid := '8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79';
  ben501 uuid := 'f3a70e55-3adc-4cd2-9fcc-f4a8abe4f217';
  reference_table text;
BEGIN
  IF auth.role() IN ('authenticated','anon') THEN
    RAISE EXCEPTION 'Préparation réservée à une intervention administrative approuvée.' USING ERRCODE='42501';
  END IF;
  LOCK TABLE public.client_reference_migration_plan IN EXCLUSIVE MODE;
  LOCK TABLE public.domains, public.crops, public.varieties IN SHARE MODE;
  IF (SELECT relrowsecurity FROM pg_class WHERE oid='public.client_reference_migration_plan'::regclass) IS DISTINCT FROM true
    OR has_table_privilege('authenticated','public.client_reference_migration_plan','SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
    OR has_table_privilege('anon','public.client_reference_migration_plan','SELECT, INSERT, UPDATE, DELETE, TRUNCATE') THEN
    RAISE EXCEPTION 'Le plan de migration doit rester privé : vérifier ses droits avant préparation.';
  END IF;
  FOREACH reference_table IN ARRAY ARRAY['varieties','crops','seed_suppliers','crop_variety_catalog'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=format('public.%I',reference_table)::regclass
      AND tgname=reference_table || '_shared_write_guard' AND NOT tgisinternal AND tgenabled='O')
      OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=format('public.%I',reference_table)::regclass
      AND tgname=reference_table || '_shared_truncate_guard' AND NOT tgisinternal AND tgenabled='O') THEN
      RAISE EXCEPTION 'Confinement incomplet sur % : aucune préparation autorisée.',reference_table;
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.client_reference_migration_plan) THEN
    RAISE EXCEPTION 'Un plan existe déjà : examiner son contenu, ne pas le remplacer automatiquement.';
  END IF;
  IF (SELECT count(*) FROM public.domains WHERE is_active AND
    ((id=stalson AND code='STALSON') OR (id=ben AND code='DOM-BENHALIMA') OR (id=ben501 AND code='DOMBEN501'))) <> 3 THEN
    RAISE EXCEPTION 'Clients validés absents, inactifs ou modifiés : refaire l’inventaire.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.crops WHERE id=tomato AND code='tomate' AND name='Tomate' AND is_active AND domain_id IS NULL) THEN
    RAISE EXCEPTION 'Culture Tomate modifiée depuis l’inventaire.';
  END IF;
  IF (SELECT count(*) FROM public.varieties) <> 4 OR
    (SELECT count(*) FROM public.varieties WHERE domain_id IS NULL AND supplier_id IS NULL AND (
      (id='806f845e-9e81-489a-9341-7ace21dcccda' AND code='CHRY' AND commercial_name='Cherry F1' AND crop_id=tomato AND is_active=false) OR
      (id='8d67b5d6-a0c9-4939-94a1-ed090d3899ba' AND code='MARQ' AND commercial_name='Marquise' AND crop_id IS NULL AND is_active=false) OR
      (id='37caf3ef-fbab-4a25-94a3-9fe35402432b' AND code='V01' AND commercial_name='DURASOL' AND crop_id=tomato AND is_active=true) OR
      (id='ec26adb4-a819-4750-afe9-6b3594eb0796' AND code='V02' AND commercial_name='SAIKO STAR' AND crop_id=tomato AND is_active=true)
    )) <> 4 THEN
    RAISE EXCEPTION 'Variétés modifiées depuis l’inventaire : réexaminer le plan avant toute copie.';
  END IF;

  INSERT INTO public.client_reference_migration_plan
    (reference_table,source_id,domain_id,destination_id,approved,evidence,target_active,target_crop_source_id)
  VALUES
    ('crops',tomato,stalson,gen_random_uuid(),true,'Copie Tomate indépendante pour STALSON',true,NULL),
    ('crops',tomato,ben,gen_random_uuid(),true,'Copie Tomate indépendante pour BENHALIMA',true,NULL),
    ('crops',tomato,ben501,tomato,true,'Conserver l’identifiant Tomate chez BENHALIMA - 501',true,NULL),
    ('varieties','806f845e-9e81-489a-9341-7ace21dcccda',stalson,gen_random_uuid(),true,'CHRY : copie active STALSON, validée par utilisateur',true,tomato),
    ('varieties','806f845e-9e81-489a-9341-7ace21dcccda',ben,'806f845e-9e81-489a-9341-7ace21dcccda',true,'CHRY : identifiant conservé BENHALIMA, réactivation validée',true,tomato),
    ('varieties','8d67b5d6-a0c9-4939-94a1-ed090d3899ba',ben,'8d67b5d6-a0c9-4939-94a1-ed090d3899ba',true,'MARQ : active BENHALIMA, rattachement Tomate validé',true,tomato),
    ('varieties','37caf3ef-fbab-4a25-94a3-9fe35402432b',ben501,'37caf3ef-fbab-4a25-94a3-9fe35402432b',true,'DURASOL : active BENHALIMA - 501, identifiant conservé',true,tomato),
    ('varieties','ec26adb4-a819-4750-afe9-6b3594eb0796',ben501,'ec26adb4-a819-4750-afe9-6b3594eb0796',true,'SAIKO STAR : active BENHALIMA - 501, identifiant conservé',true,tomato);

  IF EXISTS(SELECT 1 FROM public.client_reference_migration_plan p WHERE p.destination_id<>p.source_id AND (
    (p.reference_table='crops' AND EXISTS(SELECT 1 FROM public.crops c WHERE c.id=p.destination_id)) OR
    (p.reference_table='varieties' AND EXISTS(SELECT 1 FROM public.varieties v WHERE v.id=p.destination_id))
  )) THEN
    RAISE EXCEPTION 'Collision d’identifiant de destination : aucune modification conservée.';
  END IF;
END
$approved_plan$;

-- Source: 153_complete_approved_reference_plan.sql
-- PLAN ONLY. Do not execute without approval of the entire migration package.
-- Requires 150, 151 and 152 in that order. No business rows are changed here.
-- User approved 2026-10-13: copy all 15 crops and 23 suggestions to the three
-- named clients, preserve crop active flags, copy all four varieties as active.
DO $complete_plan$
DECLARE t text; d uuid; r record;
  clients uuid[] := ARRAY['5f4db5a9-195b-45ce-bccf-c5ac7e61dc81'::uuid,
   '8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79'::uuid,
   'f3a70e55-3adc-4cd2-9fcc-f4a8abe4f217'::uuid];
  keeper uuid := 'f3a70e55-3adc-4cd2-9fcc-f4a8abe4f217';
BEGIN
 IF auth.role() IN ('authenticated','anon') THEN
  RAISE EXCEPTION 'Intervention administrative approuvée requise' USING ERRCODE='42501';
 END IF;
 LOCK TABLE public.client_reference_migration_plan,public.domains,public.crops,
  public.varieties,public.seed_suppliers,public.crop_variety_catalog IN EXCLUSIVE MODE;
 IF (SELECT count(*) FROM public.client_reference_migration_plan)<>8
  OR EXISTS(SELECT 1 FROM public.client_reference_migration_plan WHERE NOT approved OR NOT domain_id=ANY(clients))
  OR (SELECT count(*) FROM public.client_reference_migration_plan WHERE reference_table='varieties')<>5
  OR (SELECT count(*) FROM public.client_reference_migration_plan WHERE reference_table='crops')<>3 THEN
  RAISE EXCEPTION 'Plan 152 absent, incomplet ou déjà étendu : arrêt sans modification';
 END IF;
 IF EXISTS(SELECT 1 FROM public.seed_suppliers)
  OR (SELECT count(*) FROM public.crops)<>15
  OR (SELECT count(*) FROM public.crop_variety_catalog)<>23
  OR (SELECT count(*) FROM public.varieties)<>4 THEN
  RAISE EXCEPTION 'Inventaire modifié : refaire le précontrôle avant migration';
 END IF;
 IF EXISTS(SELECT 1 FROM (VALUES
  ('05092d2a-ab77-4a79-94c9-af1075a3f88f'::uuid,'aubergine',true),
  ('09df68c5-61f9-447f-a38f-2ddaa7c79bcc'::uuid,'myrtille',false),
  ('32f86174-337f-49b4-89d6-2233992a77f6'::uuid,'courgette',true),
  ('3caa6bda-f1ed-47db-9425-5fc9102d75ab'::uuid,'concombre',true),
  ('650f00c9-ad7b-4f58-bae7-1ca8d0fb8e35'::uuid,'petits_pois',false),
  ('67c4a6a8-d572-42e4-884f-f32f12c0a1aa'::uuid,'tomate',true),
  ('6c16087b-efee-4e51-8f75-3e2f7112305e'::uuid,'oignon',false),
  ('80906ec8-41a0-4065-8630-0e701cfaa1ee'::uuid,'poivron',true),
  ('8403139c-a489-49bf-8e5b-b4c9bd4a3972'::uuid,'fraise',false),
  ('9001723e-fb75-406f-a1bc-42ded96659e3'::uuid,'haricot_vert',true),
  ('b25579d4-ffb1-475c-b641-218d4a245747'::uuid,'framboise',false),
  ('c1bd511c-4345-45b1-b5de-ae96ed88d2f5'::uuid,'pomme_de_terre',false),
  ('d86f2df9-4428-446a-a141-eca43c6fd7ec'::uuid,'piment_fort',false),
  ('e42f5ec6-95e4-4e56-93da-b48aeea87cc6'::uuid,'pasteque',true),
  ('e4f2d2c8-b7ec-4207-9702-3dac76c4fab2'::uuid,'melon',true)
 ) expected(id,code,active) LEFT JOIN public.crops c ON c.id=expected.id
 WHERE c.id IS NULL OR c.code IS DISTINCT FROM expected.code OR c.is_active IS DISTINCT FROM expected.active OR c.domain_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Cultures ou statuts différents de la confirmation';
 END IF;
 IF EXISTS(SELECT 1 FROM (VALUES
  ('0db2ac67-5384-420e-9b3c-fd174645052e'::uuid,'fraise','San Andreas'),
  ('12646817-da83-4636-85e9-2d3b9e8f0b53'::uuid,'piment_fort','Sahem'),
  ('1694dd0c-0da6-4d70-aa68-21bff804bb62'::uuid,'framboise','Glen Lyon'),
  ('2a53a946-c47d-453b-bb75-571781bdfa1e'::uuid,'framboise','Adelita'),
  ('2b8002ef-2c1c-4048-8d93-c275a20f311c'::uuid,'poivron','Tzil'),
  ('380c037a-768f-4136-9617-c2d03ebc8cdd'::uuid,'framboise','Carmina'),
  ('3b8e91a0-9330-4bbb-b691-b32ee1810f74'::uuid,'fraise','Splendor'),
  ('42482652-45e8-4bc5-875b-118f42d07b8d'::uuid,'fraise','Oso Grande'),
  ('499c347b-ac96-444b-9703-4907d9c36e74'::uuid,'framboise','Sevillana'),
  ('4d746091-4eb1-468c-b33b-87db95571bad'::uuid,'framboise','Cardinal'),
  ('53538c20-fbbe-41ae-baf6-5d1f0f40f589'::uuid,'fraise','Camarosa'),
  ('681ff919-3140-4ea6-9aaf-d86ab21791f9'::uuid,'poivron','Angelito'),
  ('6db737ef-07fe-465a-8c18-a6358cc833cb'::uuid,'poivron','Saitama'),
  ('750d3ab9-70c9-4c02-b307-9c7cb66f4041'::uuid,'poivron','Saidah'),
  ('7d118fbf-3f51-42e0-80ce-b87ebc6717a3'::uuid,'fraise','Sabrina'),
  ('7e4dcda4-a766-4779-8fcc-b89b34d473d2'::uuid,'fraise','Chandler'),
  ('8547a44e-0d13-439f-8ca7-958e9a139585'::uuid,'framboise','Marabia'),
  ('87a3376c-fafa-4f2c-877d-d9d7c4672828'::uuid,'poivron','Masami'),
  ('948129c8-08ae-41a4-895f-7d7195c52d04'::uuid,'framboise','Maravilla'),
  ('96ae8a23-958d-4785-bf9d-ae0b4781af7e'::uuid,'framboise','Alicia'),
  ('9efb02ba-2e2b-427d-a16c-157da9079199'::uuid,'fraise','Festival'),
  ('c7df9bef-37df-4634-a527-260113b0ec6a'::uuid,'framboise','Brillance'),
  ('d632bdc2-d034-45f6-895d-af2b3d405e2a'::uuid,'fraise','Fortuna')
 ) expected(id,crop_code,name) LEFT JOIN public.crop_variety_catalog c ON c.id=expected.id
 WHERE c.id IS NULL OR c.crop_code IS DISTINCT FROM expected.crop_code OR c.name IS DISTINCT FROM expected.name OR c.domain_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Catalogue différent de l’inventaire confirmé';
 END IF;
 FOREACH t IN ARRAY ARRAY['crops','varieties','seed_suppliers','crop_variety_catalog'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=format('public.%I',t)::regclass
   AND tgname=t||'_shared_write_guard' AND tgenabled='O') THEN
   RAISE EXCEPTION 'Confinement requis sur %',t;
  END IF;
 END LOOP;
 FOREACH d IN ARRAY clients LOOP
  IF NOT EXISTS(SELECT 1 FROM public.domains WHERE id=d AND is_active) THEN
   RAISE EXCEPTION 'Client absent ou inactif';
  END IF;
  INSERT INTO public.client_reference_migration_plan(reference_table,source_id,domain_id,destination_id,approved,evidence,target_active)
   SELECT 'crops',c.id,d,CASE WHEN d=keeper THEN c.id ELSE gen_random_uuid() END,true,
    'Copie indépendante confirmée le 2026-10-13 ; statut conservé',c.is_active
   FROM public.crops c WHERE c.code<>'tomate';
  INSERT INTO public.client_reference_migration_plan(reference_table,source_id,domain_id,destination_id,approved,evidence)
   SELECT 'crop_variety_catalog',c.id,d,CASE WHEN d=keeper THEN c.id ELSE gen_random_uuid() END,true,
    'Suggestion copiée indépendamment ; confirmation du 2026-10-13' FROM public.crop_variety_catalog c;
  INSERT INTO public.client_reference_migration_plan(reference_table,source_id,domain_id,destination_id,approved,evidence,target_active,target_crop_source_id)
   SELECT 'varieties',v.id,d,gen_random_uuid(),true,
    'Toutes les variétés copiées actives par client ; confirmation du 2026-10-13',true,
    '67c4a6a8-d572-42e4-884f-f32f12c0a1aa'::uuid FROM public.varieties v
   WHERE NOT EXISTS(SELECT 1 FROM public.client_reference_migration_plan p
    WHERE p.reference_table='varieties' AND p.source_id=v.id AND p.domain_id=d);
 END LOOP;
 IF (SELECT count(*) FROM public.client_reference_migration_plan)<>126 THEN
  RAISE EXCEPTION '126 destinations attendues : 45 cultures, 69 suggestions, 12 variétés actives';
 END IF;
END $complete_plan$;

-- Private immutable baseline for drift detection and manual recovery planning.
-- This is not a replacement for a full database backup or a post-cutover rollback RPC.
CREATE TABLE public.client_reference_source_snapshot (
 reference_table text NOT NULL, source_id uuid NOT NULL, before_row jsonb NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(reference_table,source_id)
);
ALTER TABLE public.client_reference_source_snapshot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_reference_source_snapshot FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.client_reference_source_snapshot TO service_role;
INSERT INTO public.client_reference_source_snapshot(reference_table,source_id,before_row)
 SELECT 'crops',id,to_jsonb(c) FROM public.crops c UNION ALL
 SELECT 'varieties',id,to_jsonb(v) FROM public.varieties v UNION ALL
 SELECT 'crop_variety_catalog',id,to_jsonb(c) FROM public.crop_variety_catalog c;

-- Source: 154_client_reference_cutover.sql
-- CANDIDATE ONLY: PostgreSQL rehearsal and explicit execution approval required.
-- Requires 150..153. Transactional cutover of the four crop/variety references.
-- The eight other references frozen by 150 remain frozen. No quantities/prices
-- are changed. Unknown owners, references, or source drift abort the transaction.
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';

DO $preflight$
DECLARE t text;
BEGIN
 IF auth.role() IN ('authenticated','anon') THEN
  RAISE EXCEPTION 'Intervention administrative approuvée requise' USING ERRCODE='42501';
 END IF;
 LOCK TABLE public.client_reference_migration_plan,public.client_reference_source_snapshot,
  public.crops,public.varieties,public.crop_variety_catalog,public.seed_suppliers,
  public.domains,public.farms,public.greenhouses,public.campaigns,
  public.campaign_plantings,public.harvest_lots,public.cost_entries,
  public.market_prices,public.markets,public.sales_order_lines,public.sales_orders,
  public.station_settlement_lines,public.station_settlements,public.clients,
  public.cultural_consumptions,public.cultural_programs,public.initialization_drafts IN EXCLUSIVE MODE;
 IF (SELECT count(*) FROM public.client_reference_migration_plan)<>126
  OR (SELECT count(*) FROM public.client_reference_migration_plan WHERE reference_table='crops')<>45
  OR (SELECT count(*) FROM public.client_reference_migration_plan WHERE reference_table='crop_variety_catalog')<>69
  OR (SELECT count(*) FROM public.client_reference_migration_plan WHERE reference_table='varieties')<>12
  OR EXISTS(SELECT 1 FROM public.client_reference_migration_plan WHERE NOT approved)
  OR EXISTS(SELECT 1 FROM public.seed_suppliers) THEN
  RAISE EXCEPTION 'Plan confirmé incomplet ou inventaire modifié';
 END IF;
 IF has_table_privilege('authenticated','public.client_reference_migration_plan','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  OR has_table_privilege('anon','public.client_reference_migration_plan','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  OR has_table_privilege('authenticated','public.client_reference_source_snapshot','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  OR has_table_privilege('anon','public.client_reference_source_snapshot','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN
  RAISE EXCEPTION 'Plan et instantané doivent rester privés';
 END IF;
 FOREACH t IN ARRAY ARRAY['crops','varieties','seed_suppliers','crop_variety_catalog'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=format('public.%I',t)::regclass
   AND tgname=t||'_shared_write_guard' AND tgenabled='O')
   OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=format('public.%I',t)::regclass
   AND tgname=t||'_shared_truncate_guard' AND tgenabled='O') THEN
   RAISE EXCEPTION 'Confinement complet requis sur %',t;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.client_reference_migration_plan p JOIN public.domains d ON d.id=p.domain_id
  WHERE NOT d.is_active OR d.id NOT IN ('5f4db5a9-195b-45ce-bccf-c5ac7e61dc81','8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79','f3a70e55-3adc-4cd2-9fcc-f4a8abe4f217')) THEN
  RAISE EXCEPTION 'Client du plan absent ou inactif';
 END IF;
 IF EXISTS(SELECT 1 FROM public.client_reference_migration_plan p WHERE p.reference_table='varieties'
  AND (p.target_active IS DISTINCT FROM true OR p.target_crop_source_id IS DISTINCT FROM '67c4a6a8-d572-42e4-884f-f32f12c0a1aa'::uuid
   OR p.source_id NOT IN ('806f845e-9e81-489a-9341-7ace21dcccda','8d67b5d6-a0c9-4939-94a1-ed090d3899ba',
     '37caf3ef-fbab-4a25-94a3-9fe35402432b','ec26adb4-a819-4750-afe9-6b3594eb0796'))) THEN
  RAISE EXCEPTION 'Répartition des variétés différente du plan approuvé';
 END IF;
 -- Enumerate all incoming foreign keys, not only varieties' direct callers.
 IF (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid IN
  ('public.varieties'::regclass,'public.crops'::regclass,'public.seed_suppliers'::regclass,'public.crop_variety_catalog'::regclass))<>8
  OR EXISTS(SELECT 1 FROM pg_constraint k WHERE k.contype='f' AND k.confrelid IN
   ('public.varieties'::regclass,'public.crops'::regclass,'public.seed_suppliers'::regclass,'public.crop_variety_catalog'::regclass)
   AND NOT ((k.confrelid='public.varieties'::regclass AND k.conrelid IN
    ('public.campaign_plantings'::regclass,'public.cost_entries'::regclass,'public.harvest_lots'::regclass,
     'public.market_prices'::regclass,'public.sales_order_lines'::regclass,'public.station_settlement_lines'::regclass)
    AND k.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=k.conrelid AND attname='variety_id')]::smallint[])
    OR (k.conrelid='public.varieties'::regclass AND
     ((k.confrelid='public.crops'::regclass AND k.conname='varieties_crop_id_fkey')
      OR (k.confrelid='public.seed_suppliers'::regclass AND k.conname='varieties_supplier_id_fkey'))))) THEN
  RAISE EXCEPTION 'Dépendance nouvelle ou différente : réexaminer les clés étrangères';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.cost_entries'::regclass AND tgname='trg_guard_generated_consumption_cost' AND tgenabled='O')
  OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.station_settlement_lines'::regclass AND tgname='trg_sl_recompute_totals' AND tgenabled='O') THEN
  RAISE EXCEPTION 'État des triggers métier différent de l’inventaire';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_depend dep JOIN pg_rewrite rw ON rw.oid=dep.objid JOIN pg_class v ON v.oid=rw.ev_class
  WHERE dep.classid='pg_rewrite'::regclass AND dep.refclassid='pg_class'::regclass
   AND dep.refobjid IN ('public.varieties'::regclass,'public.crops'::regclass,'public.seed_suppliers'::regclass,'public.crop_variety_catalog'::regclass)
   AND v.relkind IN ('v','m') AND v.oid NOT IN ('public.v_planting_forecasts'::regclass,'public.v_production_summary'::regclass)) THEN
  RAISE EXCEPTION 'Vue dépendante non examinée : arrêt de la migration';
 END IF;
END $preflight$;

CREATE TABLE public.client_reference_live_before AS
 SELECT 'crops'::text AS reference_table,id AS source_id,to_jsonb(c) AS row FROM public.crops c UNION ALL
 SELECT 'varieties',id,to_jsonb(v) FROM public.varieties v UNION ALL
 SELECT 'crop_variety_catalog',id,to_jsonb(c) FROM public.crop_variety_catalog c;
ALTER TABLE public.client_reference_live_before ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_reference_live_before FROM PUBLIC,anon,authenticated,service_role;
DO $source_check$
BEGIN
 IF EXISTS(SELECT 1 FROM public.client_reference_live_before l FULL JOIN public.client_reference_source_snapshot s
  USING(reference_table,source_id) WHERE l.row IS DISTINCT FROM s.before_row)
  OR EXISTS(SELECT 1 FROM public.client_reference_migration_plan p LEFT JOIN public.client_reference_live_before s USING(reference_table,source_id)
   WHERE s.source_id IS NULL)
  OR EXISTS(SELECT 1 FROM public.client_reference_live_before s WHERE NOT EXISTS(
   SELECT 1 FROM public.client_reference_migration_plan p WHERE p.reference_table=s.reference_table AND p.source_id=s.source_id AND p.destination_id=s.source_id)) THEN
  RAISE EXCEPTION 'Sources modifiées ou couverture du plan insuffisante';
 END IF;
 IF EXISTS(SELECT 1 FROM public.client_reference_migration_plan p JOIN public.client_reference_live_before l
  ON l.reference_table=p.reference_table AND l.source_id=p.destination_id WHERE p.destination_id<>p.source_id) THEN
  RAISE EXCEPTION 'Collision d’identifiant de destination';
 END IF;
END $source_check$;

-- Resolve ownership using authoritative parent chains, never using the shared
-- variety itself. Commercial preferences with no owner are rejected, not guessed.
CREATE TABLE public.client_reference_usage_work AS
WITH raw(reference_table,record_key,variety_id,candidates) AS (
 SELECT 'campaign_plantings',p.id::text,p.variety_id::text,ARRAY[p.domain_id::text,c.domain_id::text,f.domain_id::text]
  FROM public.campaign_plantings p LEFT JOIN public.campaigns c ON c.id=p.campaign_id
  LEFT JOIN public.greenhouses g ON g.id=p.greenhouse_id LEFT JOIN public.farms f ON f.id=g.farm_id
 UNION ALL
 SELECT 'harvest_lots',h.id::text,h.variety_id::text,ARRAY[h.domain_id::text,p.domain_id::text,f.domain_id::text]
  FROM public.harvest_lots h LEFT JOIN public.campaign_plantings p ON p.id=h.campaign_planting_id
  LEFT JOIN public.greenhouses g ON g.id=h.greenhouse_id LEFT JOIN public.farms f ON f.id=g.farm_id
 UNION ALL
 SELECT 'cost_entries',e.id::text,e.variety_id::text,ARRAY[e.domain_id::text,c.domain_id::text,f.domain_id::text]
  FROM public.cost_entries e LEFT JOIN public.campaigns c ON c.id=e.campaign_id
  LEFT JOIN public.greenhouses g ON g.id=e.greenhouse_id LEFT JOIN public.farms f ON f.id=g.farm_id
 UNION ALL
 SELECT 'sales_order_lines',l.id::text,l.variety_id::text,ARRAY[to_jsonb(l)->>'domain_id',to_jsonb(o)->>'domain_id',c.domain_id::text,f.domain_id::text,to_jsonb(b)->>'domain_id']
  FROM public.sales_order_lines l LEFT JOIN public.sales_orders o ON o.id=l.order_id LEFT JOIN public.campaigns c ON c.id=o.campaign_id
  LEFT JOIN public.greenhouses g ON g.id=l.greenhouse_id LEFT JOIN public.farms f ON f.id=g.farm_id LEFT JOIN public.clients b ON b.id=o.client_id
 UNION ALL
 SELECT 'market_prices',p.id::text,p.variety_id::text,ARRAY[to_jsonb(p)->>'domain_id',to_jsonb(m)->>'domain_id']
  FROM public.market_prices p LEFT JOIN public.markets m ON m.id=p.market_id
 UNION ALL
 SELECT 'station_settlement_lines',l.id::text,l.variety_id::text,ARRAY[to_jsonb(l)->>'domain_id',to_jsonb(s)->>'domain_id',f.domain_id::text,to_jsonb(m)->>'domain_id']
  FROM public.station_settlement_lines l LEFT JOIN public.station_settlements s ON s.id=l.settlement_id
  LEFT JOIN public.farms f ON f.id=l.farm_id LEFT JOIN public.markets m ON m.id=l.market_id
 UNION ALL
 SELECT 'clients',b.id::text,x.value,ARRAY[to_jsonb(b)->>'domain_id',to_jsonb(m)->>'domain_id']
  FROM public.clients b LEFT JOIN public.markets m ON m.id=b.market_id CROSS JOIN LATERAL
  jsonb_array_elements_text(CASE WHEN jsonb_typeof(to_jsonb(b)->'preferred_variety_ids')='array' THEN to_jsonb(b)->'preferred_variety_ids' ELSE '[]'::jsonb END) x
 UNION ALL
 SELECT 'cultural_consumptions',k.movement_id::text,x.value->>'variety_id',ARRAY[k.domain_id::text,c.domain_id::text,f.domain_id::text]
  FROM public.cultural_consumptions k CROSS JOIN LATERAL jsonb_array_elements(k.allocations) x
  LEFT JOIN public.campaigns c ON c.id::text=x.value->>'campaign_id'
  LEFT JOIN public.greenhouses g ON g.id::text=x.value->>'greenhouse_id' LEFT JOIN public.farms f ON f.id=g.farm_id
 UNION ALL
 SELECT 'cultural_programs',p.id::text,x.value->>'variety_id',ARRAY[p.domain_id::text,c.domain_id::text,f.domain_id::text]
  FROM public.cultural_programs p CROSS JOIN LATERAL jsonb_array_elements(p.targets) x
  LEFT JOIN public.campaigns c ON c.id::text=x.value->>'campaign_id'
  LEFT JOIN public.greenhouses g ON g.id::text=x.value->>'greenhouse_id' LEFT JOIN public.farms f ON f.id=g.farm_id
)
SELECT reference_table,record_key,variety_id,
 ARRAY(SELECT DISTINCT owner FROM unnest(candidates) owner WHERE owner IS NOT NULL AND owner<>'' ORDER BY owner) owners
FROM raw WHERE variety_id IS NOT NULL AND variety_id<>'';
ALTER TABLE public.client_reference_usage_work ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_reference_usage_work FROM PUBLIC,anon,authenticated,service_role;
DO $usage_check$
BEGIN
 IF EXISTS(SELECT 1 FROM public.client_reference_usage_work WHERE cardinality(owners)<>1)
  OR EXISTS(SELECT 1 FROM public.client_reference_usage_work u WHERE NOT EXISTS(
   SELECT 1 FROM public.client_reference_migration_plan p WHERE p.reference_table='varieties'
    AND p.source_id::text=u.variety_id AND p.domain_id::text=u.owners[1])) THEN
  RAISE EXCEPTION 'Lien historique sans propriétaire unique ou non prévu : arrêt sans changement';
 END IF;
END $usage_check$;

-- Store affected business rows privately for verification/manual recovery.
CREATE TABLE public.client_reference_cutover_snapshot (
 reference_table text NOT NULL, record_key text NOT NULL, before_row jsonb NOT NULL,
 after_row jsonb, captured_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(reference_table,record_key)
);
ALTER TABLE public.client_reference_cutover_snapshot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_reference_cutover_snapshot FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.client_reference_cutover_snapshot TO service_role;
DO $capture$
DECLARE t text; key_column text;
BEGIN
 FOREACH t IN ARRAY ARRAY['campaign_plantings','harvest_lots','cost_entries','market_prices','sales_order_lines',
  'station_settlement_lines','station_settlements','clients','cultural_consumptions','cultural_programs','initialization_drafts'] LOOP
  key_column:=CASE t WHEN 'cultural_consumptions' THEN 'movement_id' WHEN 'initialization_drafts' THEN 'domain_id' ELSE 'id' END;
  EXECUTE format('INSERT INTO public.client_reference_cutover_snapshot(reference_table,record_key,before_row) SELECT %L,%I::text,to_jsonb(r) FROM public.%I r',t,key_column,t);
 END LOOP;
END $capture$;

ALTER TABLE public.varieties DROP CONSTRAINT varieties_code_key;
ALTER TABLE public.crops DROP CONSTRAINT crops_code_key;
ALTER TABLE public.seed_suppliers DROP CONSTRAINT seed_suppliers_code_key;
ALTER TABLE public.crop_variety_catalog DROP CONSTRAINT crop_variety_catalog_crop_code_name_key;

DO $copy$
DECLARE p record; patch jsonb; crop_destination uuid;
BEGIN
 FOR p IN SELECT m.*,s.before_row FROM public.client_reference_migration_plan m
  JOIN public.client_reference_source_snapshot s USING(reference_table,source_id)
  ORDER BY CASE m.reference_table WHEN 'crops' THEN 1 WHEN 'crop_variety_catalog' THEN 2 ELSE 3 END,m.source_id,m.domain_id LOOP
  patch:=jsonb_build_object('id',p.destination_id,'domain_id',p.domain_id);
  IF p.reference_table IN ('crops','varieties') THEN patch:=patch||jsonb_build_object('is_active',p.target_active); END IF;
  IF p.reference_table='varieties' THEN
   SELECT destination_id INTO STRICT crop_destination FROM public.client_reference_migration_plan
    WHERE reference_table='crops' AND source_id=p.target_crop_source_id AND domain_id=p.domain_id;
   patch:=patch||jsonb_build_object('crop_id',crop_destination);
  END IF;
  IF p.source_id=p.destination_id THEN
   IF p.reference_table='varieties' THEN
    UPDATE public.varieties SET domain_id=p.domain_id,is_active=p.target_active,crop_id=crop_destination WHERE id=p.source_id;
   ELSIF p.reference_table='crops' THEN
    UPDATE public.crops SET domain_id=p.domain_id,is_active=p.target_active WHERE id=p.source_id;
   ELSE
    UPDATE public.crop_variety_catalog SET domain_id=p.domain_id WHERE id=p.source_id;
   END IF;
  ELSE
   EXECUTE format('INSERT INTO public.%I SELECT (jsonb_populate_record(NULL::public.%I,$1)).*',p.reference_table,p.reference_table)
    USING p.before_row||patch;
  END IF;
 END LOOP;
END $copy$;

ALTER TABLE public.market_prices ADD COLUMN domain_id uuid REFERENCES public.domains(id) ON DELETE RESTRICT;
ALTER TABLE public.sales_order_lines ADD COLUMN domain_id uuid REFERENCES public.domains(id) ON DELETE RESTRICT;
ALTER TABLE public.station_settlement_lines ADD COLUMN domain_id uuid REFERENCES public.domains(id) ON DELETE RESTRICT;
ALTER TABLE public.station_settlements ADD COLUMN domain_id uuid REFERENCES public.domains(id) ON DELETE RESTRICT;
DO $settlement_owners$
BEGIN
 IF EXISTS(SELECT 1 FROM public.station_settlement_lines l JOIN public.client_reference_usage_work u
  ON u.reference_table='station_settlement_lines' AND u.record_key=l.id::text
  GROUP BY l.settlement_id HAVING count(DISTINCT u.owners[1])<>1) THEN
  RAISE EXCEPTION 'Bordereau partagé entre clients : séparation manuelle requise, aucune migration conservée';
 END IF;
 UPDATE public.station_settlements s SET domain_id=x.owner::uuid FROM (
  SELECT l.settlement_id,min(u.owners[1]) owner FROM public.station_settlement_lines l
  JOIN public.client_reference_usage_work u ON u.reference_table='station_settlement_lines' AND u.record_key=l.id::text
  GROUP BY l.settlement_id) x WHERE s.id=x.settlement_id;
 -- Empty legacy headers remain unowned, quarantined from tenant writes.
END $settlement_owners$;
-- Only these two named triggers are suspended under exclusive locks; rollback
-- also rolls back their DDL state. Never disable ALL/USER or replication checks.
ALTER TABLE public.cost_entries DISABLE TRIGGER trg_guard_generated_consumption_cost;
ALTER TABLE public.station_settlement_lines DISABLE TRIGGER trg_sl_recompute_totals;
DO $remap$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['campaign_plantings','harvest_lots','cost_entries','market_prices','sales_order_lines','station_settlement_lines'] LOOP
  EXECUTE format('UPDATE public.%I r SET variety_id=p.destination_id,domain_id=p.domain_id FROM public.client_reference_usage_work u JOIN public.client_reference_migration_plan p ON p.reference_table=''varieties'' AND p.source_id::text=u.variety_id AND p.domain_id::text=u.owners[1] WHERE u.reference_table=%L AND r.id::text=u.record_key AND (r.variety_id IS DISTINCT FROM p.destination_id OR r.domain_id IS DISTINCT FROM p.domain_id)',t,t);
 END LOOP;
END $remap$;
ALTER TABLE public.cost_entries ENABLE TRIGGER trg_guard_generated_consumption_cost;
ALTER TABLE public.station_settlement_lines ENABLE TRIGGER trg_sl_recompute_totals;

UPDATE public.cultural_consumptions k SET allocations=(
 SELECT jsonb_agg(CASE WHEN nullif(a.value->>'variety_id','') IS NULL THEN a.value ELSE
  jsonb_set(a.value,'{variety_id}',to_jsonb(p.destination_id::text)) END ORDER BY a.ordinality)
 FROM jsonb_array_elements(k.allocations) WITH ORDINALITY a(value,ordinality)
 LEFT JOIN public.client_reference_migration_plan p ON p.reference_table='varieties'
  AND p.source_id::text=a.value->>'variety_id' AND p.domain_id=k.domain_id)
 WHERE EXISTS(SELECT 1 FROM public.client_reference_usage_work u JOIN public.client_reference_migration_plan p
  ON p.reference_table='varieties' AND p.source_id::text=u.variety_id AND p.domain_id::text=u.owners[1]
  WHERE u.reference_table='cultural_consumptions' AND u.record_key=k.movement_id::text AND p.source_id<>p.destination_id);

UPDATE public.cultural_programs k SET targets=(
 SELECT jsonb_agg(CASE WHEN nullif(a.value->>'variety_id','') IS NULL THEN a.value ELSE
  jsonb_set(a.value,'{variety_id}',to_jsonb(p.destination_id::text)) END ORDER BY a.ordinality)
 FROM jsonb_array_elements(k.targets) WITH ORDINALITY a(value,ordinality)
 LEFT JOIN public.client_reference_migration_plan p ON p.reference_table='varieties'
  AND p.source_id::text=a.value->>'variety_id' AND p.domain_id=k.domain_id)
 WHERE EXISTS(SELECT 1 FROM public.client_reference_usage_work u JOIN public.client_reference_migration_plan p
  ON p.reference_table='varieties' AND p.source_id::text=u.variety_id AND p.domain_id::text=u.owners[1]
  WHERE u.reference_table='cultural_programs' AND u.record_key=k.id::text AND p.source_id<>p.destination_id);

-- No commercial preferences have an authoritative tenant in the reviewed
-- schema. If present the preflight above aborts; never infer a tenant from an ID.
DO $drafts$
DECLARE r record; entry record; p uuid; new_rows jsonb; content jsonb;
BEGIN
 FOR r IN SELECT * FROM public.initialization_drafts LOOP
  content:=r.payload; new_rows:='[]'::jsonb;
  FOR entry IN SELECT value FROM jsonb_array_elements(coalesce(r.payload->'rows'->'varieties','[]'::jsonb)) LOOP
   IF nullif(entry.value->>'existing_id','') IS NOT NULL THEN
    SELECT destination_id INTO p FROM public.client_reference_migration_plan WHERE reference_table='varieties'
     AND source_id::text=entry.value->>'existing_id' AND domain_id=r.domain_id;
    IF p IS NULL THEN RAISE EXCEPTION 'Variété liée du brouillon hors client : résolution manuelle requise'; END IF;
    entry.value:=jsonb_set(entry.value,'{existing_id}',to_jsonb(p::text));
   END IF;
   new_rows:=new_rows||jsonb_build_array(entry.value);
  END LOOP;
  IF content->'rows' ? 'varieties' THEN content:=jsonb_set(content,'{rows,varieties}',new_rows); END IF;
  IF content IS DISTINCT FROM r.payload THEN
   content:=jsonb_set(content,'{reviewed}','[]'::jsonb);
   UPDATE public.initialization_drafts SET payload=content,revision=revision+1,updated_at=now() WHERE domain_id=r.domain_id;
  END IF;
 END LOOP;
END $drafts$;

CREATE UNIQUE INDEX varieties_client_code ON public.varieties(domain_id,upper(trim(code)));
CREATE UNIQUE INDEX crops_client_code ON public.crops(domain_id,upper(trim(code)));
CREATE UNIQUE INDEX seed_suppliers_client_code ON public.seed_suppliers(domain_id,upper(trim(code)));
CREATE UNIQUE INDEX catalogue_client_name ON public.crop_variety_catalog(domain_id,crop_code,lower(trim(name)));
ALTER TABLE public.varieties ADD CONSTRAINT varieties_id_client_key UNIQUE(id,domain_id);
ALTER TABLE public.crops ADD CONSTRAINT crops_id_client_key UNIQUE(id,domain_id),ADD CONSTRAINT crops_code_client_key UNIQUE(code,domain_id);
ALTER TABLE public.seed_suppliers ADD CONSTRAINT suppliers_id_client_key UNIQUE(id,domain_id);
ALTER TABLE public.station_settlements ADD CONSTRAINT settlement_id_client_key UNIQUE(id,domain_id);
ALTER TABLE public.station_settlement_lines ADD CONSTRAINT settlement_line_parent_client_fk FOREIGN KEY(settlement_id,domain_id) REFERENCES public.station_settlements(id,domain_id);
DROP INDEX IF EXISTS public.uq_settlement_period;
DROP INDEX IF EXISTS public.uq_settlement_period_type;
DROP INDEX IF EXISTS public.uq_settlement_period_market;
CREATE UNIQUE INDEX settlement_client_period_market ON public.station_settlements(domain_id,period_start,period_end,coalesce(market_id,'00000000-0000-0000-0000-000000000000'::uuid));
ALTER TABLE public.varieties ADD CONSTRAINT varieties_crop_client_fk FOREIGN KEY(crop_id,domain_id) REFERENCES public.crops(id,domain_id),
 ADD CONSTRAINT varieties_supplier_client_fk FOREIGN KEY(supplier_id,domain_id) REFERENCES public.seed_suppliers(id,domain_id);
ALTER TABLE public.crop_variety_catalog ADD CONSTRAINT catalogue_crop_client_fk FOREIGN KEY(crop_code,domain_id) REFERENCES public.crops(code,domain_id);
DO $tenant_keys$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['crops','varieties','seed_suppliers','crop_variety_catalog','market_prices','sales_order_lines','station_settlement_lines'] LOOP
  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN domain_id SET NOT NULL',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['campaign_plantings','harvest_lots','cost_entries','market_prices','sales_order_lines','station_settlement_lines'] LOOP
  EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY(variety_id,domain_id) REFERENCES public.varieties(id,domain_id)',t,t||'_variety_client_fk');
 END LOOP;
END $tenant_keys$;

-- RLS also protects direct API reads and writes, without trusting UI selection.
-- Remove all old policies; permissive policies otherwise combine with OR.
DO $tenant_policies$
DECLARE t text; p record;
BEGIN
 FOREACH t IN ARRAY ARRAY['crops','varieties','seed_suppliers','crop_variety_catalog','market_prices','sales_order_lines','station_settlement_lines'] LOOP
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);
  END LOOP;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon',t);
  EXECUTE format('REVOKE TRUNCATE,REFERENCES,TRIGGER ON public.%I FROM authenticated',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active) AND EXISTS(SELECT 1 FROM public.domains WHERE id=domain_id AND is_active) AND (public.is_platform_admin(auth.uid()) OR public.is_domain_member(domain_id,auth.uid())))',t||'_client_read',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active) AND EXISTS(SELECT 1 FROM public.domains WHERE id=domain_id AND is_active) AND public.is_domain_admin(domain_id,auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active) AND EXISTS(SELECT 1 FROM public.domains WHERE id=domain_id AND is_active) AND public.is_domain_admin(domain_id,auth.uid()))',t||'_client_write',t);
 END LOOP;
END $tenant_policies$;

CREATE FUNCTION public.guard_client_reference_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE parent_domain uuid;
BEGIN
 IF TG_LEVEL='STATEMENT' THEN
  IF auth.role() IN ('authenticated','anon') THEN RAISE EXCEPTION 'Réinitialisation globale interdite' USING ERRCODE='42501'; END IF;
  RETURN NULL;
 END IF;
 IF TG_OP='UPDATE' AND (OLD.domain_id IS DISTINCT FROM NEW.domain_id OR OLD.id IS DISTINCT FROM NEW.id) THEN
  RAISE EXCEPTION 'Identifiant et propriétaire immuables' USING ERRCODE='42501';
 END IF;
 IF TG_OP<>'DELETE' AND TG_TABLE_NAME='sales_order_lines' THEN
  SELECT c.domain_id INTO parent_domain FROM public.sales_orders o JOIN public.campaigns c ON c.id=o.campaign_id WHERE o.id=NEW.order_id;
  IF parent_domain IS NULL OR parent_domain IS DISTINCT FROM NEW.domain_id THEN
   RAISE EXCEPTION 'Commande sans campagne du client : rapprochement requis' USING ERRCODE='42501';
  END IF;
  IF NEW.greenhouse_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.greenhouses g JOIN public.farms f ON f.id=g.farm_id WHERE g.id=NEW.greenhouse_id AND f.domain_id=NEW.domain_id) THEN
   RAISE EXCEPTION 'Serre de vente hors client' USING ERRCODE='42501';
  END IF;
 END IF;
 IF TG_OP<>'DELETE' AND TG_TABLE_NAME='station_settlement_lines' THEN
  IF NOT EXISTS(SELECT 1 FROM public.station_settlements WHERE id=NEW.settlement_id AND domain_id=NEW.domain_id) THEN
   RAISE EXCEPTION 'Bordereau parent hors client' USING ERRCODE='42501';
  END IF;
  IF NEW.farm_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.farms WHERE id=NEW.farm_id AND domain_id=NEW.domain_id) THEN
   RAISE EXCEPTION 'Ferme de bordereau hors client' USING ERRCODE='42501';
  END IF;
 END IF;
 IF auth.role() IN ('authenticated','anon') AND (auth.uid() IS NULL
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
  OR NOT EXISTS(SELECT 1 FROM public.domains WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.domain_id ELSE NEW.domain_id END AND is_active)
  OR NOT coalesce(CASE WHEN TG_TABLE_NAME='station_settlement_lines' THEN
   public.has_domain_permission(CASE WHEN TG_OP='DELETE' THEN OLD.domain_id ELSE NEW.domain_id END,auth.uid(),'recoltes','edit')
   ELSE public.is_domain_admin(CASE WHEN TG_OP='DELETE' THEN OLD.domain_id ELSE NEW.domain_id END,auth.uid()) END,false)) THEN
  RAISE EXCEPTION 'Modification non autorisée pour ce client' USING ERRCODE='42501';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.guard_client_reference_owner() FROM PUBLIC,anon,authenticated;
DO $reference_triggers$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['crops','varieties','seed_suppliers','crop_variety_catalog'] LOOP
  EXECUTE format('DROP TRIGGER %I ON public.%I',t||'_shared_write_guard',t);
  EXECUTE format('DROP TRIGGER %I ON public.%I',t||'_shared_truncate_guard',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['crops','varieties','seed_suppliers','crop_variety_catalog','market_prices','sales_order_lines','station_settlement_lines'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_client_reference_owner()',t||'_client_owner_guard',t);
  EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_client_reference_owner()',t||'_client_truncate_guard',t);
 END LOOP;
END $reference_triggers$;

CREATE FUNCTION public.guard_client_settlement_header() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE d uuid;
BEGIN
 d:=CASE WHEN TG_OP='DELETE' THEN OLD.domain_id ELSE NEW.domain_id END;
 IF auth.role() IN ('authenticated','anon') THEN
  IF TG_OP='UPDATE' AND (OLD.domain_id IS DISTINCT FROM NEW.domain_id OR OLD.id IS DISTINCT FROM NEW.id) THEN
   RAISE EXCEPTION 'Propriétaire du bordereau immuable' USING ERRCODE='42501';
  END IF;
  IF d IS NULL OR auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
   OR NOT EXISTS(SELECT 1 FROM public.domains WHERE id=d AND is_active)
   OR NOT coalesce(public.has_domain_permission(d,auth.uid(),'recoltes','edit'),false) THEN
   RAISE EXCEPTION 'Bordereau non attribué ou non autorisé pour ce client' USING ERRCODE='42501';
  END IF;
 END IF;
 IF TG_OP='INSERT' AND d IS NOT NULL THEN
  NEW.code:=left(NEW.code,31)||'-'||left(replace(d::text,'-',''),8);
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.guard_client_settlement_header() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zzz_client_settlement_header BEFORE INSERT OR UPDATE OR DELETE ON public.station_settlements FOR EACH ROW EXECUTE FUNCTION public.guard_client_settlement_header();
DO $header_policies$
DECLARE p record;
BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='station_settlements' LOOP
  EXECUTE format('DROP POLICY %I ON public.station_settlements',p.policyname);
 END LOOP;
END $header_policies$;
ALTER TABLE public.station_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.station_settlements FROM PUBLIC,anon;
REVOKE TRUNCATE,REFERENCES,TRIGGER ON public.station_settlements FROM authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.station_settlements TO authenticated;
CREATE POLICY settlement_client_read ON public.station_settlements FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
 AND (public.is_platform_admin(auth.uid()) OR public.is_domain_member(domain_id,auth.uid())));
CREATE POLICY settlement_client_write ON public.station_settlements FOR ALL TO authenticated
 USING (domain_id IS NOT NULL AND public.has_domain_permission(domain_id,auth.uid(),'recoltes','edit'))
 WITH CHECK (domain_id IS NOT NULL AND public.has_domain_permission(domain_id,auth.uid(),'recoltes','edit'));

-- Check JSON references even for SECURITY DEFINER callers. Commercial preference
-- arrays remain read-only until the commercial client itself has tenant ownership.
CREATE FUNCTION public.guard_client_reference_json() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE entry jsonb; items jsonb; owner uuid;
BEGIN
 IF TG_TABLE_NAME='clients' THEN
  items:=coalesce(to_jsonb(NEW)->'preferred_variety_ids','[]'::jsonb);
  IF jsonb_typeof(items)='null' THEN items:='[]'::jsonb; END IF;
  IF jsonb_typeof(items)<>'array' OR jsonb_array_length(items)>0 THEN
   RAISE EXCEPTION 'Préférences variétés indisponibles avant isolation des clients commerciaux';
  END IF;
  RETURN NEW;
 END IF;
 owner:=NEW.domain_id;
 IF TG_TABLE_NAME='cultural_consumptions' THEN
  items:=NEW.allocations;
 ELSIF TG_TABLE_NAME='cultural_programs' THEN
  items:=NEW.targets;
 ELSE
  items:=coalesce(NEW.payload->'rows'->'varieties','[]'::jsonb);
 END IF;
 IF jsonb_typeof(items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Liste de références invalide'; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(items) LOOP
  IF TG_TABLE_NAME IN ('cultural_consumptions','cultural_programs') THEN
   IF (nullif(entry->>'campaign_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.campaigns WHERE id::text=entry->>'campaign_id' AND domain_id=owner))
    OR (nullif(entry->>'planting_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.campaign_plantings WHERE id::text=entry->>'planting_id' AND domain_id=owner))
    OR (nullif(entry->>'greenhouse_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.greenhouses g JOIN public.farms f ON f.id=g.farm_id WHERE g.id::text=entry->>'greenhouse_id' AND f.domain_id=owner)) THEN
    RAISE EXCEPTION 'Allocation liée à une campagne ou serre hors client' USING ERRCODE='42501';
   END IF;
  END IF;
  IF nullif(entry->>CASE WHEN TG_TABLE_NAME IN ('cultural_consumptions','cultural_programs') THEN 'variety_id' ELSE 'existing_id' END,'') IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.varieties v WHERE v.id::text=entry->>CASE WHEN TG_TABLE_NAME IN ('cultural_consumptions','cultural_programs') THEN 'variety_id' ELSE 'existing_id' END AND v.domain_id=owner) THEN
   RAISE EXCEPTION 'Référence JSON hors client' USING ERRCODE='42501';
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_client_reference_json() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER client_variety_preferences_guard BEFORE INSERT OR UPDATE OF preferred_variety_ids ON public.clients FOR EACH ROW EXECUTE FUNCTION public.guard_client_reference_json();
CREATE TRIGGER cultural_variety_json_guard BEFORE INSERT OR UPDATE ON public.cultural_consumptions FOR EACH ROW EXECUTE FUNCTION public.guard_client_reference_json();
CREATE TRIGGER cultural_program_variety_guard BEFORE INSERT OR UPDATE ON public.cultural_programs FOR EACH ROW EXECUTE FUNCTION public.guard_client_reference_json();
CREATE TRIGGER draft_variety_json_guard BEFORE INSERT OR UPDATE ON public.initialization_drafts FOR EACH ROW EXECUTE FUNCTION public.guard_client_reference_json();

ALTER VIEW public.v_planting_forecasts SET (security_invoker=true);
ALTER VIEW public.v_production_summary SET (security_invoker=true);

DO $postconditions$
DECLARE t text; key_column text;
BEGIN
 IF (SELECT count(*) FROM public.crops)<>45 OR (SELECT count(*) FROM public.crop_variety_catalog)<>69
  OR (SELECT count(*) FROM public.varieties)<>12 OR EXISTS(SELECT 1 FROM public.seed_suppliers)
  OR (SELECT count(*) FROM public.crops WHERE is_active)<>24
  OR (SELECT count(*) FROM public.crops WHERE NOT is_active)<>21
  OR EXISTS(SELECT 1 FROM public.varieties WHERE NOT is_active) THEN
  RAISE EXCEPTION 'Résultats différents de la confirmation';
 END IF;
 IF EXISTS(SELECT 1 FROM public.station_settlements s JOIN public.client_reference_cutover_snapshot b
  ON b.reference_table='station_settlements' AND b.record_key=s.id::text WHERE (to_jsonb(s)-'domain_id') IS DISTINCT FROM (b.before_row-'domain_id')) THEN
  RAISE EXCEPTION 'Un bordereau a changé : annulation complète';
 END IF;
 FOREACH t IN ARRAY ARRAY['campaign_plantings','harvest_lots','cost_entries','market_prices','sales_order_lines','station_settlement_lines'] LOOP
  EXECUTE format('UPDATE public.client_reference_cutover_snapshot b SET after_row=to_jsonb(r) FROM public.%I r WHERE b.reference_table=%L AND b.record_key=r.id::text',t,t);
  IF EXISTS(SELECT 1 FROM public.client_reference_cutover_snapshot WHERE reference_table=t
   AND (after_row IS NULL OR (before_row-'variety_id'-'domain_id') IS DISTINCT FROM (after_row-'variety_id'-'domain_id'))) THEN
   RAISE EXCEPTION 'Modification métier inattendue sur % : annulation',t;
  END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['station_settlements','clients','cultural_consumptions','cultural_programs','initialization_drafts'] LOOP
  key_column:=CASE t WHEN 'cultural_consumptions' THEN 'movement_id' WHEN 'initialization_drafts' THEN 'domain_id' ELSE 'id' END;
  EXECUTE format('UPDATE public.client_reference_cutover_snapshot b SET after_row=to_jsonb(r) FROM public.%I r WHERE b.reference_table=%L AND b.record_key=r.%I::text',t,t,key_column);
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.client_reference_cutover_snapshot WHERE reference_table='cultural_consumptions'
  AND (before_row-'allocations') IS DISTINCT FROM (after_row-'allocations')) THEN
  RAISE EXCEPTION 'Consommation modifiée hors références : annulation';
 END IF;
 IF EXISTS(SELECT 1 FROM public.client_reference_cutover_snapshot WHERE reference_table='cultural_programs'
  AND (before_row-'targets') IS DISTINCT FROM (after_row-'targets')) THEN
  RAISE EXCEPTION 'Programme modifié hors références : annulation';
 END IF;
END $postconditions$;

-- UI readiness is a separate server acknowledgement, not an authorization
-- switch. RLS, ownership triggers and composite FKs remain authoritative.
CREATE FUNCTION public.client_reference_isolation_ready(p_domain uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT auth.uid() IS NOT NULL
  AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
  AND EXISTS(SELECT 1 FROM public.domains WHERE id=p_domain AND is_active)
  AND (public.is_platform_admin(auth.uid()) OR public.is_domain_member(p_domain,auth.uid()))
  AND EXISTS(SELECT 1 FROM public.client_reference_migration_plan WHERE domain_id=p_domain AND approved)
  AND NOT EXISTS(SELECT 1 FROM public.client_reference_cutover_snapshot WHERE after_row IS NULL)
  AND (SELECT count(*) FROM pg_constraint WHERE conname IN
   ('campaign_plantings_variety_client_fk','harvest_lots_variety_client_fk','cost_entries_variety_client_fk',
    'market_prices_variety_client_fk','sales_order_lines_variety_client_fk','station_settlement_lines_variety_client_fk')
   AND convalidated AND connamespace='public'::regnamespace)=6;
$$;
REVOKE ALL ON FUNCTION public.client_reference_isolation_ready(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.client_reference_isolation_ready(uuid) TO authenticated;

-- Replace settlement lines atomically; legacy delete-then-insert API calls must
-- fail BEFORE deletion, including an old deployed client without domain_id.
CREATE FUNCTION public.replace_client_settlement_lines(p_domain uuid,p_settlement uuid,p_lines jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE line jsonb; status text; qty numeric; price numeric; variety uuid; farm uuid; market uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
  OR NOT EXISTS(SELECT 1 FROM public.domains WHERE id=p_domain AND is_active)
  OR NOT coalesce(public.has_domain_permission(p_domain,auth.uid(),'recoltes','edit'),false) THEN
  RAISE EXCEPTION 'Modification de bordereau non autorisée pour ce client' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines)>1000 OR octet_length(p_lines::text)>2000000 THEN
  RAISE EXCEPTION 'Liste de lignes invalide';
 END IF;
 SELECT s.status INTO status FROM public.station_settlements s WHERE id=p_settlement AND domain_id=p_domain FOR UPDATE;
 IF NOT FOUND OR status<>'brouillon' THEN RAISE EXCEPTION 'Bordereau absent ou déjà validé'; END IF;
 IF EXISTS(SELECT 1 FROM public.station_settlement_lines WHERE settlement_id=p_settlement AND domain_id<>p_domain) THEN
  RAISE EXCEPTION 'Bordereau partagé entre clients : séparation requise avant modification';
 END IF;
 -- Validate every submitted row before the first delete. SQL exceptions still
 -- roll back the entire replacement if any later insert or trigger fails.
 FOR line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF jsonb_typeof(line)<>'object' THEN RAISE EXCEPTION 'Ligne invalide'; END IF;
  variety:=(line->>'variety_id')::uuid; farm:=nullif(line->>'farm_id','')::uuid; market:=(line->>'market_id')::uuid;
  qty:=(line->>'qty_kg')::numeric; price:=(line->>'price_per_kg')::numeric;
  IF qty IS NULL OR price IS NULL OR qty<0 OR price<0 OR qty::text IN ('NaN','Infinity','-Infinity') OR price::text IN ('NaN','Infinity','-Infinity') THEN
   RAISE EXCEPTION 'Quantité et prix valides requis';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.varieties WHERE id=variety AND domain_id=p_domain)
   OR (farm IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.farms WHERE id=farm AND domain_id=p_domain))
   OR NOT EXISTS(SELECT 1 FROM public.markets WHERE id=market) THEN
   RAISE EXCEPTION 'Référence de bordereau invalide ou hors client' USING ERRCODE='42501';
  END IF;
 END LOOP;
 DELETE FROM public.station_settlement_lines WHERE settlement_id=p_settlement AND domain_id=p_domain;
 INSERT INTO public.station_settlement_lines(domain_id,settlement_id,farm_id,market_id,variety_id,qty_kg,price_per_kg,notes)
  SELECT p_domain,p_settlement,nullif(l->>'farm_id','')::uuid,(l->>'market_id')::uuid,(l->>'variety_id')::uuid,
   (l->>'qty_kg')::numeric,(l->>'price_per_kg')::numeric,l->>'notes'
  FROM jsonb_array_elements(p_lines) l WHERE (l->>'qty_kg')::numeric>0;
END $$;
REVOKE ALL ON FUNCTION public.replace_client_settlement_lines(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.replace_client_settlement_lines(uuid,uuid,jsonb) TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.station_settlement_lines FROM authenticated;
DROP TABLE public.client_reference_usage_work;
DROP TABLE public.client_reference_live_before;
NOTIFY pgrst,'reload schema';

$itrix_ddl_v3$;
 EXECUTE $itrix_checks_v3$
-- READ ONLY. Run after the cutover (or inside its rehearsal transaction).
-- This checks database structure and remapping, NOT every authenticated workflow.
WITH counts AS (
 SELECT d.code AS client,
  (SELECT count(*) FROM public.crops WHERE domain_id=d.id) AS crops,
  (SELECT count(*) FROM public.crops WHERE domain_id=d.id AND is_active) AS active_crops,
  (SELECT count(*) FROM public.crops WHERE domain_id=d.id AND NOT is_active) AS inactive_crops,
  (SELECT count(*) FROM public.crop_variety_catalog WHERE domain_id=d.id) AS suggestions,
  (SELECT count(*) FROM public.varieties WHERE domain_id=d.id) AS varieties
 FROM public.domains d WHERE d.id IN ('5f4db5a9-195b-45ce-bccf-c5ac7e61dc81',
  '8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79','f3a70e55-3adc-4cd2-9fcc-f4a8abe4f217')
), edges AS (
 SELECT 'campaign_plantings'::text AS source,p.variety_id,p.domain_id FROM public.campaign_plantings p UNION ALL
 SELECT 'cost_entries',p.variety_id,p.domain_id FROM public.cost_entries p UNION ALL
 SELECT 'harvest_lots',p.variety_id,p.domain_id FROM public.harvest_lots p UNION ALL
 SELECT 'market_prices',p.variety_id,p.domain_id FROM public.market_prices p UNION ALL
 SELECT 'sales_order_lines',p.variety_id,p.domain_id FROM public.sales_order_lines p UNION ALL
 SELECT 'station_settlement_lines',p.variety_id,p.domain_id FROM public.station_settlement_lines p
), json_edges AS (
 SELECT 'cultural_consumptions'::text AS source,k.domain_id,x.value->>'variety_id' AS variety_id
 FROM public.cultural_consumptions k CROSS JOIN LATERAL jsonb_array_elements(k.allocations) x UNION ALL
 SELECT 'cultural_programs',d.domain_id,x.value->>'variety_id'
 FROM public.cultural_programs d CROSS JOIN LATERAL jsonb_array_elements(d.targets) x UNION ALL
 SELECT 'initialization_drafts',d.domain_id,x.value->>'existing_id'
 FROM public.initialization_drafts d CROSS JOIN LATERAL jsonb_array_elements(coalesce(d.payload->'rows'->'varieties','[]'::jsonb)) x
)
SELECT jsonb_build_object(
 'clients',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY client) FROM counts c),'[]'::jsonb),
 'unowned_references',(SELECT count(*) FROM (
  SELECT domain_id FROM public.crops UNION ALL SELECT domain_id FROM public.varieties UNION ALL
  SELECT domain_id FROM public.crop_variety_catalog UNION ALL SELECT domain_id FROM public.seed_suppliers) r WHERE domain_id IS NULL),
 'foreign_relational_edges',(SELECT count(*) FROM edges e LEFT JOIN public.varieties v ON v.id=e.variety_id
  WHERE e.variety_id IS NOT NULL AND (v.id IS NULL OR v.domain_id IS DISTINCT FROM e.domain_id)),
 'foreign_json_edges',(SELECT count(*) FROM json_edges e LEFT JOIN public.varieties v ON v.id::text=e.variety_id
  WHERE nullif(e.variety_id,'') IS NOT NULL AND (v.id IS NULL OR v.domain_id IS DISTINCT FROM e.domain_id)),
 'foreign_crop_edges',(SELECT count(*) FROM public.varieties v JOIN public.crops c ON c.id=v.crop_id WHERE c.domain_id IS DISTINCT FROM v.domain_id),
 'foreign_supplier_edges',(SELECT count(*) FROM public.varieties v JOIN public.seed_suppliers s ON s.id=v.supplier_id WHERE s.domain_id IS DISTINCT FROM v.domain_id),
 'business_rows_changed_outside_reference_ids',(SELECT count(*) FROM public.client_reference_cutover_snapshot
  WHERE reference_table IN ('campaign_plantings','cost_entries','harvest_lots','market_prices','sales_order_lines','station_settlement_lines')
   AND (before_row-'variety_id'-'domain_id') IS DISTINCT FROM (after_row-'variety_id'-'domain_id')),
 'settlements_changed',(SELECT count(*) FROM public.client_reference_cutover_snapshot WHERE reference_table='station_settlements' AND (before_row-'domain_id') IS DISTINCT FROM (after_row-'domain_id')),
 'legacy_empty_settlements_quarantined',(SELECT count(*) FROM public.station_settlements WHERE domain_id IS NULL),
 'rls_tables',coalesce((SELECT jsonb_agg(jsonb_build_object('table',relname,'enabled',relrowsecurity) ORDER BY relname)
  FROM pg_class WHERE oid IN ('public.crops'::regclass,'public.varieties'::regclass,'public.seed_suppliers'::regclass,
   'public.crop_variety_catalog'::regclass,'public.market_prices'::regclass,'public.sales_order_lines'::regclass,'public.station_settlement_lines'::regclass)),'[]'::jsonb),
 'validated_variety_client_keys',(SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND convalidated
  AND conname IN ('campaign_plantings_variety_client_fk','cost_entries_variety_client_fk','harvest_lots_variety_client_fk',
   'market_prices_variety_client_fk','sales_order_lines_variety_client_fk','station_settlement_lines_variety_client_fk')),
 'views',coalesce((SELECT jsonb_agg(jsonb_build_object('name',relname,'options',reloptions) ORDER BY relname)
  FROM pg_class WHERE oid IN ('public.v_planting_forecasts'::regclass,'public.v_production_summary'::regclass)),'[]'::jsonb)
) AS isolation_check;
$itrix_checks_v3$ INTO report;
 IF (report->>'unowned_references')::integer<>0
  OR (report->>'foreign_relational_edges')::integer<>0
  OR (report->>'foreign_json_edges')::integer<>0
  OR (report->>'business_rows_changed_outside_reference_ids')::integer<>0
  OR (report->>'settlements_changed')::integer<>0 THEN
  RAISE EXCEPTION 'Contrôle final refusé : %',report;
 END IF;
 RAISE NOTICE 'ITRIX installation contrôlée : %',report;
END;
$itrix_install_v3$;
COMMIT;

-- Display the result after the successful installation.
-- READ ONLY. Run after the cutover (or inside its rehearsal transaction).
-- This checks database structure and remapping, NOT every authenticated workflow.
WITH counts AS (
 SELECT d.code AS client,
  (SELECT count(*) FROM public.crops WHERE domain_id=d.id) AS crops,
  (SELECT count(*) FROM public.crops WHERE domain_id=d.id AND is_active) AS active_crops,
  (SELECT count(*) FROM public.crops WHERE domain_id=d.id AND NOT is_active) AS inactive_crops,
  (SELECT count(*) FROM public.crop_variety_catalog WHERE domain_id=d.id) AS suggestions,
  (SELECT count(*) FROM public.varieties WHERE domain_id=d.id) AS varieties
 FROM public.domains d WHERE d.id IN ('5f4db5a9-195b-45ce-bccf-c5ac7e61dc81',
  '8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79','f3a70e55-3adc-4cd2-9fcc-f4a8abe4f217')
), edges AS (
 SELECT 'campaign_plantings'::text AS source,p.variety_id,p.domain_id FROM public.campaign_plantings p UNION ALL
 SELECT 'cost_entries',p.variety_id,p.domain_id FROM public.cost_entries p UNION ALL
 SELECT 'harvest_lots',p.variety_id,p.domain_id FROM public.harvest_lots p UNION ALL
 SELECT 'market_prices',p.variety_id,p.domain_id FROM public.market_prices p UNION ALL
 SELECT 'sales_order_lines',p.variety_id,p.domain_id FROM public.sales_order_lines p UNION ALL
 SELECT 'station_settlement_lines',p.variety_id,p.domain_id FROM public.station_settlement_lines p
), json_edges AS (
 SELECT 'cultural_consumptions'::text AS source,k.domain_id,x.value->>'variety_id' AS variety_id
 FROM public.cultural_consumptions k CROSS JOIN LATERAL jsonb_array_elements(k.allocations) x UNION ALL
 SELECT 'cultural_programs',d.domain_id,x.value->>'variety_id'
 FROM public.cultural_programs d CROSS JOIN LATERAL jsonb_array_elements(d.targets) x UNION ALL
 SELECT 'initialization_drafts',d.domain_id,x.value->>'existing_id'
 FROM public.initialization_drafts d CROSS JOIN LATERAL jsonb_array_elements(coalesce(d.payload->'rows'->'varieties','[]'::jsonb)) x
)
SELECT jsonb_build_object(
 'clients',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY client) FROM counts c),'[]'::jsonb),
 'unowned_references',(SELECT count(*) FROM (
  SELECT domain_id FROM public.crops UNION ALL SELECT domain_id FROM public.varieties UNION ALL
  SELECT domain_id FROM public.crop_variety_catalog UNION ALL SELECT domain_id FROM public.seed_suppliers) r WHERE domain_id IS NULL),
 'foreign_relational_edges',(SELECT count(*) FROM edges e LEFT JOIN public.varieties v ON v.id=e.variety_id
  WHERE e.variety_id IS NOT NULL AND (v.id IS NULL OR v.domain_id IS DISTINCT FROM e.domain_id)),
 'foreign_json_edges',(SELECT count(*) FROM json_edges e LEFT JOIN public.varieties v ON v.id::text=e.variety_id
  WHERE nullif(e.variety_id,'') IS NOT NULL AND (v.id IS NULL OR v.domain_id IS DISTINCT FROM e.domain_id)),
 'foreign_crop_edges',(SELECT count(*) FROM public.varieties v JOIN public.crops c ON c.id=v.crop_id WHERE c.domain_id IS DISTINCT FROM v.domain_id),
 'foreign_supplier_edges',(SELECT count(*) FROM public.varieties v JOIN public.seed_suppliers s ON s.id=v.supplier_id WHERE s.domain_id IS DISTINCT FROM v.domain_id),
 'business_rows_changed_outside_reference_ids',(SELECT count(*) FROM public.client_reference_cutover_snapshot
  WHERE reference_table IN ('campaign_plantings','cost_entries','harvest_lots','market_prices','sales_order_lines','station_settlement_lines')
   AND (before_row-'variety_id'-'domain_id') IS DISTINCT FROM (after_row-'variety_id'-'domain_id')),
 'settlements_changed',(SELECT count(*) FROM public.client_reference_cutover_snapshot WHERE reference_table='station_settlements' AND (before_row-'domain_id') IS DISTINCT FROM (after_row-'domain_id')),
 'legacy_empty_settlements_quarantined',(SELECT count(*) FROM public.station_settlements WHERE domain_id IS NULL),
 'rls_tables',coalesce((SELECT jsonb_agg(jsonb_build_object('table',relname,'enabled',relrowsecurity) ORDER BY relname)
  FROM pg_class WHERE oid IN ('public.crops'::regclass,'public.varieties'::regclass,'public.seed_suppliers'::regclass,
   'public.crop_variety_catalog'::regclass,'public.market_prices'::regclass,'public.sales_order_lines'::regclass,'public.station_settlement_lines'::regclass)),'[]'::jsonb),
 'validated_variety_client_keys',(SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND convalidated
  AND conname IN ('campaign_plantings_variety_client_fk','cost_entries_variety_client_fk','harvest_lots_variety_client_fk',
   'market_prices_variety_client_fk','sales_order_lines_variety_client_fk','station_settlement_lines_variety_client_fk')),
 'views',coalesce((SELECT jsonb_agg(jsonb_build_object('name',relname,'options',reloptions) ORDER BY relname)
  FROM pg_class WHERE oid IN ('public.v_planting_forecasts'::regclass,'public.v_production_summary'::regclass)),'[]'::jsonb)
) AS isolation_check;
