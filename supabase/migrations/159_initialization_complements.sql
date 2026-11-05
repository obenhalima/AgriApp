-- Enable independent complements for modules 1 and 2, without deleting prior integrations.
BEGIN;
ALTER TABLE public.initialization_operations ADD COLUMN is_current boolean NOT NULL DEFAULT true;
DROP INDEX public.initialization_one_active_module1;
CREATE UNIQUE INDEX initialization_one_active_module1 ON public.initialization_operations(domain_id,module)
 WHERE status='applied' AND is_current;

-- Update installed functions only: the local 158 file was altered, so do not replay it.
DO $patch$
DECLARE v_name text; v_before text; v_after text; v_module text;
BEGIN
 FOREACH v_name IN ARRAY ARRAY['apply_initialization_module1','apply_initialization_module2','initialization_module1_state','initialization_module2_state'] LOOP
  SELECT pg_get_functiondef(p.oid) INTO v_before FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname=v_name;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Fonction % absente : installer les modules 1 et 2 avant ce correctif',v_name; END IF;
  v_module:=CASE WHEN v_name LIKE '%module1%' THEN 'exploitation' ELSE 'plantations' END;
  v_after:=replace(v_before,'WHERE domain_id=p_domain AND status=''applied''',
    'WHERE domain_id=p_domain AND module='||quote_literal(v_module)||' AND status=''applied'' AND is_current');
  v_after:=replace(v_after,'WHERE domain_id=p_domain AND module='||quote_literal(v_module)||' AND status=''applied''',
    'WHERE domain_id=p_domain AND module='||quote_literal(v_module)||' AND status=''applied'' AND is_current');
  -- Avoid duplicating the predicate when adapting the older module 1 function.
  v_after:=replace(v_after,'AND is_current AND is_current','AND is_current');
  IF v_after=v_before OR position('AND is_current' IN v_after)=0 THEN
   RAISE EXCEPTION 'Version de % non reconnue : aucun changement appliqué',v_name;
  END IF;
  EXECUTE v_after;
 END LOOP;
END;
$patch$;

CREATE FUNCTION public.start_initialization_complement(p_domain uuid,p_module text,p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_op public.initialization_operations%ROWTYPE; v_payload jsonb; v_section text; v_rows jsonb;
 v_row jsonb; v_keys text[]; v_revision integer; v_table text;
BEGIN
 IF p_module IS NULL OR p_module NOT IN('exploitation','plantations') THEN RAISE EXCEPTION 'Module non autorisé'; END IF;
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
  OR NOT coalesce(public.is_domain_admin(p_domain,auth.uid()),false)
  OR NOT coalesce(public.client_reference_isolation_ready(p_domain),false)
  THEN RAISE EXCEPTION 'Administration du client et isolation validée requises' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_domain::text,141));
 SELECT * INTO v_op FROM public.initialization_operations
  WHERE domain_id=p_domain AND module=p_module AND status='applied' AND is_current FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Aucun module intégré à compléter : rechargez le dossier'; END IF;
 SELECT payload INTO v_payload FROM public.initialization_drafts
  WHERE domain_id=p_domain AND revision=p_revision FOR UPDATE;
 IF v_payload IS NULL THEN RAISE EXCEPTION 'Le dossier a changé : rechargez avant de compléter'; END IF;
 v_keys:=CASE p_module WHEN 'exploitation' THEN ARRAY['farms','greenhouses','varieties'] ELSE ARRAY['campaigns','plantings'] END;
 -- Keep previous integrated rows as owned read-only references, not new creations.
 FOREACH v_section IN ARRAY v_keys LOOP
  v_rows:='[]';
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_op.after_payload->'rows'->v_section) LOOP
   IF nullif(v_row->>'existing_id','') IS NULL THEN RAISE EXCEPTION 'Bilan sans lien : contrôle manuel requis'; END IF;
   IF p_module='exploitation' THEN
    v_row:=public.initialization_module1_projection(v_section,(v_row->>'existing_id')::uuid,p_domain);
   ELSE
    v_table:=CASE v_section WHEN 'campaigns' THEN 'campaigns' ELSE 'campaign_plantings' END;
    v_row:=public.initialization_module2_projection(v_table,(v_row->>'existing_id')::uuid,p_domain);
   END IF;
   v_rows:=v_rows||jsonb_build_array(v_row);
  END LOOP;
  v_payload:=jsonb_set(v_payload,ARRAY['rows',v_section],v_rows);
 END LOOP;
 v_payload:=jsonb_set(v_payload,'{reviewed}',coalesce((SELECT jsonb_agg(value)
  FROM jsonb_array_elements(v_payload->'reviewed') WHERE NOT ((value#>>'{}')=ANY(v_keys))),'[]'));
 v_payload:=jsonb_set(v_payload,'{skipped}',coalesce((SELECT jsonb_agg(value)
  FROM jsonb_array_elements(v_payload->'skipped') WHERE NOT ((value#>>'{}')=ANY(v_keys))),'[]'));
 v_revision:=public.save_initialization_draft(p_domain,p_revision,v_payload);
 UPDATE public.initialization_operations SET is_current=false WHERE id=v_op.id;
 RETURN jsonb_build_object('payload',v_payload,'revision',v_revision);
END;
$$;
REVOKE ALL ON FUNCTION public.start_initialization_complement(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_initialization_complement(uuid,text,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
