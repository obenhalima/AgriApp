-- Pass target_code, campaign_code, actor_email, snapshot_hex and harvest_start with psql -v.
-- Pass an empty harvest_start to keep the current planting windows.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';
SELECT set_config('itrix.harvest_import.target', :'target_code', true),
       set_config('itrix.harvest_import.campaign', :'campaign_code', true),
       set_config('itrix.harvest_import.actor', :'actor_email', true),
       set_config('itrix.harvest_import.window_start', :'harvest_start', true),
       set_config('itrix.harvest_import.snapshot', :'snapshot_hex', true);

CREATE TEMP TABLE harvest_snapshot_result (result jsonb) ON COMMIT DROP;

DO $import$
DECLARE
  client_id uuid;
  target_campaign_id uuid;
  actor_id uuid;
  snapshot jsonb := convert_from(decode(current_setting('itrix.harvest_import.snapshot'), 'hex'), 'UTF8')::jsonb;
  payload jsonb;
  window_start date := nullif(current_setting('itrix.harvest_import.window_start'), '')::date;
  adjusted integer;
  expected integer;
BEGIN
  SELECT d.id,c.id INTO STRICT client_id,target_campaign_id
  FROM public.domains d JOIN public.campaigns c ON c.domain_id=d.id
  WHERE d.code=current_setting('itrix.harvest_import.target') AND d.is_active
    AND c.code=current_setting('itrix.harvest_import.campaign');
  SELECT p.id INTO STRICT actor_id FROM public.profiles p JOIN auth.users u ON u.id=p.id
  WHERE lower(u.email)=lower(current_setting('itrix.harvest_import.actor'))
    AND u.email_confirmed_at IS NOT NULL AND p.is_active AND p.is_platform_admin;
  PERFORM set_config('request.jwt.claim.sub',actor_id::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  IF jsonb_typeof(snapshot) IS DISTINCT FROM 'array' OR jsonb_array_length(snapshot)=0 THEN
    RAISE EXCEPTION 'Liste de récoltes requise';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(snapshot) x WHERE x->>'compatible' IS DISTINCT FROM 'true') THEN
    RAISE EXCEPTION 'Le dossier contient des champs de récolte que l’import historique ne reprend pas';
  END IF;

  WITH scoped_plantings AS (
    SELECT p.id,f.code AS farm,g.code AS greenhouse,v.code AS variety,v.commercial_name AS variety_name
    FROM public.campaign_plantings p
    JOIN public.campaigns c ON c.id=p.campaign_id AND c.domain_id=client_id
    JOIN public.greenhouses g ON g.id=p.greenhouse_id AND g.farm_id=c.farm_id
    JOIN public.farms f ON f.id=g.farm_id AND f.domain_id=client_id
    JOIN public.varieties v ON v.id=p.variety_id AND v.domain_id=client_id
    WHERE p.campaign_id=target_campaign_id AND p.domain_id=client_id
  )
  SELECT jsonb_agg(
    (src - ARRAY['farm','greenhouse','variety','variety_name','compatible']) ||
    jsonb_build_object('planting_id',p.id) ORDER BY src->>'ref'
  ) INTO payload
  FROM jsonb_array_elements(snapshot) src
  JOIN scoped_plantings p ON p.farm=src->>'farm' AND p.greenhouse=src->>'greenhouse'
    AND p.variety=src->>'variety' AND p.variety_name=src->>'variety_name';

  IF payload IS NULL OR jsonb_array_length(payload)<>jsonb_array_length(snapshot) THEN
    RAISE EXCEPTION 'Une plantation cible est absente ou ambiguë';
  END IF;

  IF window_start IS NOT NULL THEN
    SELECT count(DISTINCT x->>'planting_id') INTO expected FROM jsonb_array_elements(payload) x;
    UPDATE public.campaign_plantings p
      SET first_harvest_date=window_start, harvest_start_date=window_start, updated_at=now()
    WHERE p.domain_id=client_id AND p.campaign_id=target_campaign_id
      AND p.id IN (SELECT (x->>'planting_id')::uuid FROM jsonb_array_elements(payload) x)
      AND (p.planting_date IS NULL OR p.planting_date<=window_start)
      AND (p.first_harvest_date IS NULL OR p.first_harvest_date>=window_start)
      AND (p.harvest_start_date IS NULL OR p.harvest_start_date>=window_start);
    GET DIAGNOSTICS adjusted=ROW_COUNT;
    IF adjusted<>expected THEN RAISE EXCEPTION 'Les fenêtres de récolte ont changé depuis la validation'; END IF;
  END IF;
  INSERT INTO harvest_snapshot_result VALUES (public.import_historical_harvests(client_id,payload));
END;
$import$;

SELECT result FROM harvest_snapshot_result;
COMMIT;
