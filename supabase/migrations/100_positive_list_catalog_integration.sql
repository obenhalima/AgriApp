-- Migration 100 — Intégration automatique du catalogue depuis une liste positive
BEGIN;

CREATE OR REPLACE FUNCTION public.validate_positive_list_globally(p_list_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  v_list public.phyto_positive_lists%ROWTYPE;
  e public.phyto_positive_list_entries%ROWTYPE;
  v_product UUID; v_target UUID; v_use UUID;
  v_products_created INTEGER:=0; v_products_linked INTEGER:=0;
  v_targets_created INTEGER:=0; v_uses_created INTEGER:=0; v_uses_pending INTEGER:=0; v_rows_validated INTEGER:=0;
  v_family TEXT; v_unit TEXT; v_dose_min NUMERIC; v_dose_max NUMERIC;
BEGIN
  SELECT * INTO v_list FROM public.phyto_positive_lists WHERE id=p_list_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Liste positive introuvable'; END IF;
  IF v_list.status NOT IN ('brouillon','a_controler') THEN RAISE EXCEPTION 'Seule une liste en cours de contrôle peut être validée globalement'; END IF;
  IF NOT public.has_domain_permission(v_list.domain_id,auth.uid(),'agronomie','edit') THEN RAISE EXCEPTION 'Permission insuffisante'; END IF;

  FOR e IN SELECT * FROM public.phyto_positive_list_entries WHERE list_id=p_list_id AND review_status='a_controler' ORDER BY source_page,source_row,id FOR UPDATE LOOP
    v_target:=NULL; v_product:=NULL; v_use:=NULL; v_dose_min:=NULL; v_dose_max:=NULL; v_unit:=NULL;

    SELECT id INTO v_target FROM public.phyto_targets
     WHERE public.normalize_positive_list_key(canonical_name)=public.normalize_positive_list_key(e.target_label)
        OR EXISTS(SELECT 1 FROM unnest(aliases) a WHERE public.normalize_positive_list_key(a)=public.normalize_positive_list_key(e.target_label))
     ORDER BY created_at LIMIT 1;
    IF v_target IS NULL THEN
      INSERT INTO public.phyto_targets(canonical_name,category)
      VALUES(e.target_label,'autre') RETURNING id INTO v_target;
      v_targets_created:=v_targets_created+1;
    END IF;

    SELECT id INTO v_product FROM public.plant_protection_products
     WHERE domain_id=v_list.domain_id
       AND public.normalize_positive_list_key(commercial_name)=public.normalize_positive_list_key(e.commercial_name)
     ORDER BY created_at LIMIT 1;
    IF v_product IS NULL THEN
      v_family:=CASE
        WHEN lower(coalesce(e.section,'')) LIKE '%insect%' THEN 'insecticide'
        WHEN lower(coalesce(e.section,'')) LIKE '%fongi%' THEN 'fongicide'
        WHEN lower(coalesce(e.section,'')) LIKE '%nemat%' OR lower(coalesce(e.section,'')) LIKE '%némat%' THEN 'nematicide'
        WHEN lower(coalesce(e.section,'')) LIKE '%acari%' THEN 'acaricide'
        WHEN lower(coalesce(e.section,'')) LIKE '%herbi%' THEN 'herbicide'
        ELSE 'autre' END;
      INSERT INTO public.plant_protection_products(
        domain_id,commercial_name,authorization_number,authorization_status,supplier_name,
        active_substances,product_family,resistance_group,max_applications_per_campaign,
        default_phi_days,notes,is_active,safety_data_verified,created_by
      ) VALUES(
        v_list.domain_id,e.commercial_name,
        'IMPORT-LP-'||left(p_list_id::TEXT,8)||'-'||left(md5(public.normalize_positive_list_key(e.commercial_name)),12),
        'suspendu',NULLIF(e.supplier_name,''),coalesce(NULLIF(e.active_substances,''),'À compléter'),
        v_family,NULLIF(e.resistance_group,''),e.max_repetitions,e.phi_days,
        'Créé automatiquement depuis la liste positive '||v_list.version||'. Autorisation et sécurité ONSSA à vérifier avant utilisation.',
        TRUE,FALSE,auth.uid()
      ) RETURNING id INTO v_product;
      v_products_created:=v_products_created+1;
    ELSE
      v_products_linked:=v_products_linked+1;
    END IF;

    SELECT id INTO v_use FROM public.product_authorized_uses
     WHERE product_id=v_product AND upper(crop_name)='TOMATE'
       AND public.normalize_positive_list_key(target_name)=public.normalize_positive_list_key(e.target_label)
     ORDER BY is_active DESC,created_at LIMIT 1;

    IF v_use IS NULL THEN
      SELECT min(replace(m[1],',','.')::NUMERIC),max(replace(m[1],',','.')::NUMERIC)
        INTO v_dose_min,v_dose_max
      FROM regexp_matches(coalesce(e.dose_text,''),'([0-9]+(?:[.,][0-9]+)?)','g') m;
      v_unit:=CASE
        WHEN lower(e.dose_text) ~ '(ml|cc).*(100\s*l|hl)' THEN 'ml_100l'
        WHEN lower(e.dose_text) ~ 'g.*(100\s*l|hl)' THEN 'g_100l'
        WHEN lower(e.dose_text) ~ 'kg\s*/?\s*ha' THEN 'kg_ha'
        WHEN lower(e.dose_text) ~ 'ml\s*/?\s*ha' THEN 'ml_ha'
        WHEN lower(e.dose_text) ~ 'g\s*/?\s*ha' THEN 'g_ha'
        WHEN lower(e.dose_text) ~ 'l\s*/?\s*ha' THEN 'l_ha'
        ELSE NULL END;
      IF v_dose_max IS NOT NULL AND v_dose_max>0 AND v_unit IS NOT NULL THEN
        INSERT INTO public.product_authorized_uses(
          domain_id,product_id,crop_name,target_name,dose_type,dose_min,dose_max,dose_unit,
          phi_days,rei_hours,max_applications,treatment_mode,notes,is_active
        ) VALUES(
          v_list.domain_id,v_product,'Tomate',e.target_label,
          CASE WHEN v_dose_min IS DISTINCT FROM v_dose_max THEN 'range' ELSE 'single' END,
          CASE WHEN v_dose_min IS DISTINCT FROM v_dose_max THEN v_dose_min ELSE NULL END,
          v_dose_max,v_unit,coalesce(e.phi_days,0),NULL,e.max_repetitions,NULLIF(e.treatment_mode,''),
          'Usage importé de la liste positive '||v_list.version||' — à vérifier avec l’autorisation ONSSA.',FALSE
        ) RETURNING id INTO v_use;
        v_uses_created:=v_uses_created+1;
      ELSE
        v_uses_pending:=v_uses_pending+1;
      END IF;
    END IF;

    UPDATE public.phyto_positive_list_entries
       SET target_id=v_target,product_id=v_product,authorized_use_id=v_use,review_status='valide'
     WHERE id=e.id;
    v_rows_validated:=v_rows_validated+1;
  END LOOP;

  RETURN jsonb_build_object(
    'rows_validated',v_rows_validated,'products_created',v_products_created,
    'products_linked',v_products_linked,'targets_created',v_targets_created,
    'uses_created',v_uses_created,'uses_pending',v_uses_pending
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_positive_list_globally(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_positive_list_globally(UUID) TO authenticated;

COMMIT;
