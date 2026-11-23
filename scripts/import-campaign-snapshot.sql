-- Supply target_code and snapshot_hex with psql -v on the confirmed target.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';
SELECT set_config('itrix.campaign_import.target', :'target_code', true),
       set_config('itrix.campaign_import.snapshot', :'snapshot_hex', true);
LOCK TABLE public.farms, public.greenhouses, public.varieties, public.crops IN SHARE MODE;
LOCK TABLE public.campaigns, public.campaign_plantings IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE campaign_import_result (
  campaign_code text, farm_code text, greenhouse_code text, variety_code text, planted_area numeric
) ON COMMIT DROP;

DO $import$
DECLARE
  src jsonb := convert_from(decode(current_setting('itrix.campaign_import.snapshot'), 'hex'), 'UTF8')::jsonb;
  target_id uuid;
  farm public.farms%ROWTYPE;
  greenhouse public.greenhouses%ROWTYPE;
  variety public.varieties%ROWTYPE;
  campaign public.campaigns%ROWTYPE;
  planting public.campaign_plantings%ROWTYPE;
  expected_campaign public.campaigns%ROWTYPE;
  expected_planting public.campaign_plantings%ROWTYPE;
  entry jsonb;
  planting_key jsonb;
  seen_keys jsonb := '[]';
  campaign_data jsonb;
  planting_data jsonb;
  campaign_excluded text[] := ARRAY['id','domain_id','farm_id','created_by','created_at','updated_at'];
  planting_excluded text[] := ARRAY['id','domain_id','campaign_id','greenhouse_id','variety_id','created_at','updated_at'];
BEGIN
  SELECT id INTO STRICT target_id FROM public.domains
    WHERE code = current_setting('itrix.campaign_import.target') AND is_active FOR KEY SHARE;
  IF jsonb_typeof(src->'campaigns') IS DISTINCT FROM 'array'
     OR jsonb_array_length(src->'campaigns') <> 1
     OR jsonb_typeof(src->'plantings') IS DISTINCT FROM 'array'
     OR jsonb_array_length(src->'plantings') = 0 THEN
    RAISE EXCEPTION 'Le dossier doit contenir une campagne et ses plantations';
  END IF;
  campaign_data := src->'campaigns'->0;
  IF campaign_data->>'farm_scope_ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'La ferme source ne correspond pas à la campagne';
  END IF;
  SELECT * INTO STRICT farm FROM public.farms f
    WHERE f.domain_id=target_id AND upper(trim(f.code))=upper(trim(campaign_data->>'farm_code')) AND f.is_active;
  expected_campaign := jsonb_populate_record(NULL::public.campaigns,campaign_data);
  SELECT * INTO campaign FROM public.campaigns c
    WHERE c.domain_id=target_id AND upper(trim(c.code))=upper(trim(expected_campaign.code));
  IF FOUND THEN
    IF campaign.farm_id <> farm.id OR (to_jsonb(campaign)-campaign_excluded)
       IS DISTINCT FROM (to_jsonb(expected_campaign)-campaign_excluded) THEN
      RAISE EXCEPTION 'Conflit sur la campagne %', expected_campaign.code;
    END IF;
  ELSE
    INSERT INTO public.campaigns (
      domain_id,farm_id,code,name,status,preparation_start,planting_start,harvest_start,harvest_end,campaign_end,
      budget_total,budget_seeds,budget_fertilizers,budget_pesticides,budget_labor,budget_packaging,budget_energy,
      budget_irrigation,budget_transport,budget_other,production_target_kg,revenue_target,notes
    ) VALUES (
      target_id,farm.id,expected_campaign.code,expected_campaign.name,expected_campaign.status,
      expected_campaign.preparation_start,expected_campaign.planting_start,expected_campaign.harvest_start,
      expected_campaign.harvest_end,expected_campaign.campaign_end,expected_campaign.budget_total,
      expected_campaign.budget_seeds,expected_campaign.budget_fertilizers,expected_campaign.budget_pesticides,
      expected_campaign.budget_labor,expected_campaign.budget_packaging,expected_campaign.budget_energy,
      expected_campaign.budget_irrigation,expected_campaign.budget_transport,expected_campaign.budget_other,
      expected_campaign.production_target_kg,expected_campaign.revenue_target,expected_campaign.notes
    ) RETURNING * INTO campaign;
  END IF;

  FOR entry IN SELECT value FROM jsonb_array_elements(src->'plantings') LOOP
    planting_data := entry;
    IF planting_data->>'campaign_code' IS DISTINCT FROM campaign_data->>'code'
       OR planting_data->>'farm_code' IS DISTINCT FROM campaign_data->>'farm_code'
       OR planting_data->>'scope_ok' IS DISTINCT FROM 'true'
       OR planting_data->>'campaign_farm_ok' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Plantation hors périmètre de la campagne';
    END IF;
    SELECT * INTO STRICT greenhouse FROM public.greenhouses g
      WHERE g.farm_id=farm.id AND upper(trim(g.code))=upper(trim(planting_data->>'greenhouse_code'))
        AND g.status='active';
    SELECT v.* INTO STRICT variety FROM public.varieties v JOIN public.crops c ON c.id=v.crop_id
      WHERE v.domain_id=target_id AND c.domain_id=target_id AND v.is_active
        AND upper(trim(v.code))=upper(trim(planting_data->>'variety_code'))
        AND lower(trim(v.commercial_name))=lower(trim(planting_data->>'variety_name'))
        AND lower(trim(c.code))=lower(trim(planting_data->>'crop_code'));
    planting_key := jsonb_build_array(greenhouse.id,variety.id);
    IF seen_keys @> jsonb_build_array(planting_key) THEN RAISE EXCEPTION 'Plantation en double dans la source'; END IF;
    seen_keys := seen_keys || jsonb_build_array(planting_key);
    expected_planting := jsonb_populate_record(NULL::public.campaign_plantings,planting_data);
    IF expected_planting.planted_area IS NULL OR expected_planting.planted_area <= 0
       OR expected_planting.planted_area > greenhouse.exploitable_area THEN
      RAISE EXCEPTION 'Surface incohérente pour %/%',farm.code,greenhouse.code;
    END IF;
    SELECT * INTO planting FROM public.campaign_plantings p
      WHERE p.campaign_id=campaign.id AND p.greenhouse_id=greenhouse.id AND p.variety_id=variety.id;
    IF FOUND THEN
      IF planting.domain_id <> target_id OR (to_jsonb(planting)-planting_excluded)
         IS DISTINCT FROM (to_jsonb(expected_planting)-planting_excluded) THEN
        RAISE EXCEPTION 'Conflit sur la plantation %/%',greenhouse.code,variety.code;
      END IF;
    ELSE
      INSERT INTO public.campaign_plantings (
        domain_id,campaign_id,greenhouse_id,variety_id,planted_area,plant_count,actual_density,planting_date,
        first_harvest_date,last_harvest_date,target_yield_per_m2,target_total_production,estimated_cost,status,notes,
        harvest_start_date,harvest_end_date,export_share_pct,price_per_kg_export,price_per_kg_local,linear_meters
      ) VALUES (
        target_id,campaign.id,greenhouse.id,variety.id,expected_planting.planted_area,expected_planting.plant_count,
        expected_planting.actual_density,expected_planting.planting_date,expected_planting.first_harvest_date,
        expected_planting.last_harvest_date,expected_planting.target_yield_per_m2,expected_planting.target_total_production,
        expected_planting.estimated_cost,expected_planting.status,expected_planting.notes,expected_planting.harvest_start_date,
        expected_planting.harvest_end_date,expected_planting.export_share_pct,expected_planting.price_per_kg_export,
        expected_planting.price_per_kg_local,expected_planting.linear_meters
      ) RETURNING * INTO planting;
    END IF;
    INSERT INTO campaign_import_result VALUES (campaign.code,farm.code,greenhouse.code,variety.code,planting.planted_area);
  END LOOP;
END;
$import$;

SELECT * FROM campaign_import_result ORDER BY greenhouse_code,variety_code;
COMMIT;
