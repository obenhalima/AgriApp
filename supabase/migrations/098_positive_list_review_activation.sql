-- Migration 098 — Contrôle, comparaison et activation des listes positives
BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_positive_list_key(p_value TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT regexp_replace(
    translate(lower(coalesce(trim(p_value),'')),'àáâäãåçèéêëìíîïñòóôöõùúûüýÿœæ','aaaaaaceeeeiiiinooooouuuuyyoea'),
    '[^a-z0-9]+','','g'
  )
$$;

CREATE OR REPLACE FUNCTION public.activate_phyto_positive_list(p_list_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  v_list public.phyto_positive_lists%ROWTYPE;
  v_previous UUID;
  v_pending INTEGER;
  v_unlinked INTEGER;
BEGIN
  SELECT * INTO v_list FROM public.phyto_positive_lists WHERE id=p_list_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Liste positive introuvable'; END IF;
  IF NOT public.has_domain_permission(v_list.domain_id,auth.uid(),'agronomie','edit') THEN
    RAISE EXCEPTION 'Permission insuffisante';
  END IF;
  IF v_list.status IN ('remplacee','rejetee') THEN
    RAISE EXCEPTION 'Cette version ne peut plus être activée';
  END IF;

  SELECT count(*) INTO v_pending FROM public.phyto_positive_list_entries
   WHERE list_id=p_list_id AND review_status='a_controler';
  IF v_pending>0 THEN RAISE EXCEPTION '% ligne(s) restent à contrôler',v_pending; END IF;

  SELECT count(*) INTO v_unlinked FROM public.phyto_positive_list_entries
   WHERE list_id=p_list_id AND review_status='valide' AND (product_id IS NULL OR target_id IS NULL);
  IF v_unlinked>0 THEN RAISE EXCEPTION '% ligne(s) validée(s) ne sont pas reliées à un produit et une cible',v_unlinked; END IF;

  SELECT id INTO v_previous FROM public.phyto_positive_lists
   WHERE domain_id=v_list.domain_id AND status='active' AND id<>p_list_id FOR UPDATE;

  UPDATE public.phyto_positive_list_entries n
     SET comparison_status=CASE
       WHEN v_previous IS NULL THEN 'nouveau'
       WHEN EXISTS (
         SELECT 1 FROM public.phyto_positive_list_entries o
          WHERE o.list_id=v_previous AND o.review_status='valide'
            AND public.normalize_positive_list_key(o.commercial_name)=public.normalize_positive_list_key(n.commercial_name)
            AND public.normalize_positive_list_key(o.target_label)=public.normalize_positive_list_key(n.target_label)
            AND coalesce(o.active_substances,'')=coalesce(n.active_substances,'')
            AND coalesce(o.phi_days,-1)=coalesce(n.phi_days,-1)
            AND coalesce(o.dose_text,'')=coalesce(n.dose_text,'')
            AND coalesce(o.treatment_mode,'')=coalesce(n.treatment_mode,'')
            AND coalesce(o.eu_uk_mrl_text,'')=coalesce(n.eu_uk_mrl_text,'')
            AND coalesce(o.swiss_mrl_text,'')=coalesce(n.swiss_mrl_text,'')
       ) THEN 'identique'
       WHEN EXISTS (
         SELECT 1 FROM public.phyto_positive_list_entries o
          WHERE o.list_id=v_previous AND o.review_status='valide'
            AND public.normalize_positive_list_key(o.commercial_name)=public.normalize_positive_list_key(n.commercial_name)
            AND public.normalize_positive_list_key(o.target_label)=public.normalize_positive_list_key(n.target_label)
       ) THEN 'modifie'
       ELSE 'nouveau' END
   WHERE n.list_id=p_list_id;

  UPDATE public.phyto_positive_lists SET status='remplacee' WHERE id=v_previous;
  UPDATE public.phyto_positive_lists
     SET status='active',activated_by=auth.uid(),activated_at=now()
   WHERE id=p_list_id;

  RETURN jsonb_build_object('activated_list_id',p_list_id,'replaced_list_id',v_previous);
END;
$$;

REVOKE ALL ON FUNCTION public.activate_phyto_positive_list(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_phyto_positive_list(UUID) TO authenticated;

COMMIT;
