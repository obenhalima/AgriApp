-- PLAN ONLY. Do not execute without approval of the entire migration package.
-- Requires 150, 151 and 152 in that order. No business rows are changed here.
-- User approved 2026-10-13: copy all 15 crops and 23 suggestions to the three
-- named clients, preserve crop active flags, copy all four varieties as active.
BEGIN;
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
COMMIT;
