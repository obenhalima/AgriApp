-- Supply target_code and snapshot_hex with psql -v.
-- The caller must use the intended destination project connection.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

SELECT set_config('itrix.infrastructure.target', :'target_code', true),
       set_config('itrix.infrastructure.snapshot', :'snapshot_hex', true);
LOCK TABLE public.farms, public.greenhouses IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE infrastructure_import_result (
  farms_created integer, farms_reused integer, greenhouses_created integer,
  greenhouses_reused integer, total_m2 numeric, exploitable_m2 numeric
) ON COMMIT DROP;

DO $import$
DECLARE
  src jsonb := convert_from(decode(current_setting('itrix.infrastructure.snapshot'), 'hex'), 'UTF8')::jsonb;
  destination uuid;
  current_farm uuid;
  source_farm record;
  source_greenhouse record;
  f public.farms%ROWTYPE;
  h public.greenhouses%ROWTYPE;
  farms_created integer := 0;
  farms_reused integer := 0;
  greenhouses_created integer := 0;
  greenhouses_reused integer := 0;
  total_m2 numeric := 0;
  exploitable_m2 numeric := 0;
  existing jsonb;
BEGIN
  SELECT id INTO STRICT destination FROM public.domains
  WHERE code = current_setting('itrix.infrastructure.target') AND is_active FOR KEY SHARE;
  IF jsonb_typeof(src->'farms') IS DISTINCT FROM 'array'
     OR jsonb_typeof(src->'greenhouses') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Dossier de reprise incomplet';
  END IF;
  CREATE TEMP TABLE infrastructure_import_farm_map (source_code text PRIMARY KEY, farm_id uuid NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE infrastructure_import_greenhouse_keys (farm_id uuid NOT NULL, source_code text NOT NULL, PRIMARY KEY (farm_id, source_code)) ON COMMIT DROP;

  FOR source_farm IN SELECT * FROM jsonb_to_recordset(src->'farms') AS s(
    code text, name text, city text, country text, area numeric, active boolean, manager_link boolean, attributes jsonb)
  LOOP
    IF coalesce(btrim(source_farm.code), '') = '' OR coalesce(btrim(source_farm.name), '') = ''
       OR source_farm.manager_link IS DISTINCT FROM false OR source_farm.area < 0 THEN
      RAISE EXCEPTION 'Ferme invalide ou responsable à rapprocher (%)', source_farm.code;
    END IF;
    SELECT * INTO f FROM public.farms
    WHERE domain_id = destination AND upper(btrim(code)) = upper(btrim(source_farm.code));
    IF FOUND THEN
      existing := jsonb_build_object('address', f.address, 'region', f.region,
        'gps_lat', f.gps_lat, 'gps_lng', f.gps_lng, 'notes', f.notes);
      IF ROW(f.name::text,f.city::text,f.country::text,f.total_area,f.is_active,existing)
         IS DISTINCT FROM ROW(source_farm.name,source_farm.city,source_farm.country,source_farm.area,source_farm.active,source_farm.attributes)
      THEN RAISE EXCEPTION 'Conflit sur la ferme %', source_farm.code; END IF;
      farms_reused := farms_reused + 1;
    ELSE
      INSERT INTO public.farms(domain_id,code,name,city,country,total_area,is_active,address,region,gps_lat,gps_lng,notes)
      VALUES(destination,source_farm.code,source_farm.name,source_farm.city,source_farm.country,source_farm.area,source_farm.active,
        source_farm.attributes->>'address',source_farm.attributes->>'region',
        (source_farm.attributes->>'gps_lat')::numeric,(source_farm.attributes->>'gps_lng')::numeric,source_farm.attributes->>'notes')
      RETURNING * INTO f;
      farms_created := farms_created + 1;
    END IF;
    INSERT INTO infrastructure_import_farm_map VALUES (upper(btrim(source_farm.code)), f.id);
  END LOOP;

  FOR source_greenhouse IN SELECT * FROM jsonb_to_recordset(src->'greenhouses') AS s(
    farm_code text, code text, name text, type text, status text, total numeric, usable numeric, zone_link boolean, attributes jsonb)
  LOOP
    IF coalesce(btrim(source_greenhouse.code), '') = '' OR coalesce(btrim(source_greenhouse.name), '') = ''
       OR source_greenhouse.zone_link IS DISTINCT FROM false OR source_greenhouse.total IS NULL
       OR source_greenhouse.usable IS NULL OR source_greenhouse.total <= 0
       OR source_greenhouse.usable < 0 OR source_greenhouse.usable > source_greenhouse.total THEN
      RAISE EXCEPTION 'Serre invalide ou zone à rapprocher (%)', source_greenhouse.code;
    END IF;
    SELECT farm_id INTO STRICT current_farm FROM infrastructure_import_farm_map
    WHERE source_code = upper(btrim(source_greenhouse.farm_code));
    INSERT INTO infrastructure_import_greenhouse_keys VALUES (current_farm, upper(btrim(source_greenhouse.code)));
    SELECT * INTO h FROM public.greenhouses
    WHERE farm_id = current_farm AND upper(btrim(code)) = upper(btrim(source_greenhouse.code));
    IF FOUND THEN
      existing := jsonb_build_object('length',h.length,'width',h.width,'height',h.height,
        'commissioning_date',h.commissioning_date,'last_renovation_date',h.last_renovation_date,
        'irrigation_type',h.irrigation_type,'heating_system',h.heating_system,'climate_control',h.climate_control,'notes',h.notes);
      IF ROW(h.name::text,h.type::text,h.status::text,h.total_area,h.exploitable_area,existing)
         IS DISTINCT FROM ROW(source_greenhouse.name,source_greenhouse.type,source_greenhouse.status,
           source_greenhouse.total,source_greenhouse.usable,source_greenhouse.attributes)
      THEN RAISE EXCEPTION 'Conflit sur la serre %/%',source_greenhouse.farm_code,source_greenhouse.code; END IF;
      greenhouses_reused := greenhouses_reused + 1;
    ELSE
      INSERT INTO public.greenhouses(farm_id,code,name,type,status,total_area,exploitable_area,length,width,height,
        commissioning_date,last_renovation_date,irrigation_type,heating_system,climate_control,notes)
      VALUES(current_farm,source_greenhouse.code,source_greenhouse.name,source_greenhouse.type,source_greenhouse.status,
        source_greenhouse.total,source_greenhouse.usable,(source_greenhouse.attributes->>'length')::numeric,
        (source_greenhouse.attributes->>'width')::numeric,(source_greenhouse.attributes->>'height')::numeric,
        (source_greenhouse.attributes->>'commissioning_date')::date,(source_greenhouse.attributes->>'last_renovation_date')::date,
        source_greenhouse.attributes->>'irrigation_type',source_greenhouse.attributes->>'heating_system',
        (source_greenhouse.attributes->>'climate_control')::boolean,source_greenhouse.attributes->>'notes')
      RETURNING * INTO h;
      greenhouses_created := greenhouses_created + 1;
    END IF;
    total_m2 := total_m2 + h.total_area;
    exploitable_m2 := exploitable_m2 + h.exploitable_area;
  END LOOP;
  INSERT INTO infrastructure_import_result VALUES (
    farms_created, farms_reused, greenhouses_created, greenhouses_reused, total_m2, exploitable_m2);
END;
$import$;

SELECT * FROM infrastructure_import_result;
COMMIT;
