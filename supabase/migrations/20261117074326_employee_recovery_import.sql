BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS normal_hourly_rate numeric(18,9),
  ADD COLUMN IF NOT EXISTS overtime_hourly_rate numeric(18,9),
  ADD COLUMN IF NOT EXISTS seniority_rate numeric(9,6),
  ADD COLUMN IF NOT EXISTS employee_import jsonb;
-- Preserve the decimal precision supplied by the workbook's daily equivalents.
ALTER TABLE public.workers ALTER COLUMN daily_rate TYPE numeric(18,9);
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.workers'::regclass AND conname='workers_recovery_rates') THEN
    ALTER TABLE public.workers ADD CONSTRAINT workers_recovery_rates CHECK (
      (normal_hourly_rate IS NULL OR normal_hourly_rate BETWEEN 0 AND 1000000) AND
      (overtime_hourly_rate IS NULL OR overtime_hourly_rate BETWEEN 0 AND 1000000) AND
      (seniority_rate IS NULL OR seniority_rate BETWEEN 0 AND 1));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS workers_recovery_source
  ON public.workers(farm_id, (employee_import->>'source_key'))
  WHERE employee_import IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_employee_recovery_edit()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.employee_import IS NOT NULL THEN
    IF NEW.employee_import IS DISTINCT FROM OLD.employee_import THEN
      RAISE EXCEPTION 'La provenance de l’import doit être conservée';
    END IF;
    IF coalesce(btrim(NEW.first_name),'') = '' OR coalesce(btrim(NEW.last_name),'') = '' THEN
      RAISE EXCEPTION 'Nom et prénom sont requis';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM farms WHERE id=NEW.farm_id
      AND domain_id=(OLD.employee_import->>'domain_id')::uuid) THEN
      RAISE EXCEPTION 'Ferme inaccessible pour ce client';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS employee_recovery_edit ON public.workers;
CREATE TRIGGER employee_recovery_edit BEFORE UPDATE ON public.workers
FOR EACH ROW EXECUTE FUNCTION public.guard_employee_recovery_edit();

-- Invoker preserves existing worker RLS for the selected client and farm.
CREATE OR REPLACE FUNCTION public.import_employee_recovery(
  p_domain uuid, p_farm uuid, p_filename text, p_rows jsonb, p_apply boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  item jsonb; source_record jsonb; source_key text; existing workers%ROWTYPE;
  report jsonb := '[]'; staged jsonb := '[]'; seen text[] := '{}';
  created_count integer := 0; skipped_count integer := 0; conflict_count integer := 0;
  result_status text; issue text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active)
    OR NOT coalesce(has_domain_permission(p_domain,auth.uid(),'rh_employes','create'),false) THEN
    RAISE EXCEPTION 'Import des employés non autorisé' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM domains WHERE id=p_domain AND is_active)
    OR NOT EXISTS(SELECT 1 FROM farms WHERE id=p_farm AND domain_id=p_domain AND is_active) THEN
    RAISE EXCEPTION 'Sélectionnez une ferme active du client sélectionné';
  END IF;
  IF p_filename IS NULL OR length(btrim(p_filename)) NOT BETWEEN 1 AND 255
    OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Fichier invalide'; END IF;
  IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 1000 OR octet_length(p_rows::text)>2000000 THEN
    RAISE EXCEPTION 'Le fichier doit contenir entre 1 et 1 000 employés';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('employee-recovery:'||p_domain::text||':'||p_farm::text,0));
  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF coalesce(length(btrim(item->>'source_name')),0) NOT BETWEEN 1 AND 100
      OR length(coalesce(item->>'source_number',''))>100 THEN RAISE EXCEPTION 'Identité source invalide'; END IF;
    source_key := lower(regexp_replace(btrim(item->>'source_name'),'\s+',' ','g'));
    IF source_key=ANY(seen) THEN RAISE EXCEPTION 'Nom présent plusieurs fois dans le fichier'; END IF;
    seen := array_append(seen,source_key);
    IF length(coalesce(item->>'payment_name',''))>255 OR length(coalesce(item->>'notes',''))>10000 THEN
      RAISE EXCEPTION 'Texte source trop long';
    END IF;
    IF item ? 'profile' AND jsonb_typeof(item->'profile')<>'object' THEN RAISE EXCEPTION 'Informations employé invalides'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(coalesce(item->'profile','{}')) field WHERE
      field.key NOT IN('first_name','last_name','cin','cnss_number','phone','email','start_date','date_birth')
      OR jsonb_typeof(field.value)<>'string' OR length(field.value #>> '{}')>CASE
        WHEN field.key IN('first_name','last_name') THEN 100
        WHEN field.key IN('cin','cnss_number') THEN 20 WHEN field.key='phone' THEN 50 ELSE 255 END) THEN
      RAISE EXCEPTION 'Informations employé invalides';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(coalesce(item->'profile','{}')) field WHERE
      field.key IN('start_date','date_birth') AND (field.value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$') THEN
      RAISE EXCEPTION 'Date source invalide';
    END IF;
    IF item->'is_active' IS DISTINCT FROM 'null'::jsonb AND item ? 'is_active'
      AND jsonb_typeof(item->'is_active')<>'boolean' THEN RAISE EXCEPTION 'Statut invalide'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(item) field WHERE field.key IN
      ('normal_hourly_rate','overtime_hourly_rate','daily_rate','seniority_rate')
      AND field.value<>'null'::jsonb AND jsonb_typeof(field.value)<>'number') THEN
      RAISE EXCEPTION 'Tarif source invalide';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(item) field WHERE field.key IN
      ('normal_hourly_rate','overtime_hourly_rate','daily_rate','seniority_rate')
      AND field.value<>'null'::jsonb AND ((field.value::text)::numeric<0
      OR (field.value::text)::numeric>CASE WHEN field.key='seniority_rate' THEN 1 ELSE 1000000 END)) THEN
      RAISE EXCEPTION 'Tarif source invalide';
    END IF;
    source_record := jsonb_build_object('source_number',item->'source_number','source_name',item->'source_name',
      'payment_name',item->'payment_name','normal_hourly_rate',item->'normal_hourly_rate',
      'overtime_hourly_rate',item->'overtime_hourly_rate','daily_rate',item->'daily_rate',
      'seniority_rate',item->'seniority_rate','is_active',item->'is_active','notes',item->'notes',
      'profile',coalesce(item->'profile','{}'));
    result_status := 'create'; issue := NULL;
    SELECT * INTO existing FROM workers WHERE farm_id=p_farm AND employee_import->>'source_key'=source_key;
    IF FOUND THEN
      IF existing.employee_import->'source_record'=source_record THEN result_status := 'skip';
      ELSE result_status := 'conflict'; issue := 'Source modifiée : fiche existante préservée'; END IF;
    ELSIF EXISTS(SELECT 1 FROM workers WHERE farm_id=p_farm AND (
      lower(regexp_replace(btrim(last_name||' '||first_name),'\s+',' ','g'))=source_key OR
      lower(regexp_replace(btrim(first_name||' '||last_name),'\s+',' ','g'))=source_key OR
      (nullif(item->'profile'->>'cin','') IS NOT NULL AND cin=item->'profile'->>'cin'))) THEN
      result_status := 'conflict'; issue := 'Employé déjà présent : rapprochement à vérifier';
    END IF;
    IF result_status='create' THEN
      created_count := created_count+1;
      staged := staged||jsonb_build_array(jsonb_build_object('source_key',source_key,'source_record',source_record,'row',item));
    ELSIF result_status='skip' THEN skipped_count := skipped_count+1;
    ELSE conflict_count := conflict_count+1; END IF;
    report := report||jsonb_build_array(jsonb_build_object('excel_row',item->'excel_row','source_name',item->'source_name','status',result_status,'issue',issue));
  END LOOP;
  IF p_apply AND conflict_count>0 THEN RAISE EXCEPTION 'Résolvez les rapprochements avant de valider cet import'; END IF;
  IF p_apply THEN
    FOR item IN SELECT value FROM jsonb_array_elements(staged) LOOP
      source_record := item->'source_record';
      INSERT INTO workers(first_name,last_name,farm_id,is_active,normal_hourly_rate,overtime_hourly_rate,
        daily_rate,seniority_rate,notes,category,contract_type,pay_frequency,base_salary,family_status,
        dependents,payment_method,cin,cnss_number,phone,email,start_date,date_birth,employee_import)
      VALUES(coalesce(source_record->'profile'->>'first_name',''),
        CASE WHEN source_record->'profile' ? 'first_name' OR source_record->'profile' ? 'last_name'
          THEN coalesce(source_record->'profile'->>'last_name','') ELSE source_record->>'source_name' END,
        p_farm,(source_record->>'is_active')::boolean,
        (source_record->>'normal_hourly_rate')::numeric,(source_record->>'overtime_hourly_rate')::numeric,
        (source_record->>'daily_rate')::numeric,(source_record->>'seniority_rate')::numeric,
        source_record->>'notes',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
        source_record->'profile'->>'cin',source_record->'profile'->>'cnss_number',
        source_record->'profile'->>'phone',source_record->'profile'->>'email',
        (source_record->'profile'->>'start_date')::date,(source_record->'profile'->>'date_birth')::date,
        jsonb_build_object('domain_id',p_domain,'source_key',item->>'source_key','source_record',source_record,
          'filename',btrim(p_filename),'sheet','Employés','excel_row',item->'row'->'excel_row',
          'imported_by',auth.uid(),'imported_at',now()));
    END LOOP;
  END IF;
  RETURN jsonb_build_object('created',created_count,'skipped',skipped_count,'conflicts',conflict_count,
    'applied',p_apply,'rows',report);
END $$;
REVOKE ALL ON FUNCTION public.import_employee_recovery(uuid,uuid,text,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_employee_recovery(uuid,uuid,text,jsonb,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
