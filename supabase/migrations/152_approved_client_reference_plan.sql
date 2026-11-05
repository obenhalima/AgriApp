-- PLAN ONLY, NOT CUTOVER. Requires reviewed 150/151 first.
-- No production execution authorized. Does not change crops, varieties or history.
-- User-approved: CHRY active STALSON/BEN; MARQ active BEN and linked to Tomate;
-- DURASOL/SAIKO STAR active BEN501. Three independent Tomate destination rows.
BEGIN;

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

COMMIT;
