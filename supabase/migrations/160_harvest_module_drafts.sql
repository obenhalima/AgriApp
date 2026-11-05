-- Module 3 draft and receipt persistence. Does not import or alter existing harvests.
BEGIN;
CREATE TABLE public.harvest_module_drafts (
 domain_id uuid PRIMARY KEY REFERENCES public.domains(id),revision integer NOT NULL,
 input_data jsonb NOT NULL,import_rows jsonb NOT NULL,import_result jsonb,
 updated_by uuid NOT NULL REFERENCES public.profiles(id),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.harvest_module_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),domain_id uuid NOT NULL REFERENCES public.domains(id),
 revision integer NOT NULL,input_data jsonb NOT NULL,import_rows jsonb NOT NULL,result jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(domain_id,revision)
);
ALTER TABLE public.harvest_module_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.harvest_module_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.harvest_module_drafts,public.harvest_module_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.harvest_module_drafts,public.harvest_module_history TO authenticated;
CREATE POLICY harvest_module_draft_read ON public.harvest_module_drafts FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
 AND public.has_domain_permission(domain_id,auth.uid(),'recoltes','view'));
CREATE POLICY harvest_module_history_read ON public.harvest_module_history FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
 AND public.has_domain_permission(domain_id,auth.uid(),'recoltes','view'));

CREATE FUNCTION public.save_harvest_module_draft(p_domain uuid,p_revision integer,p_input jsonb,p_rows jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_revision integer;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
 OR NOT coalesce(public.has_domain_permission(p_domain,auth.uid(),'recoltes','create'),false)
 OR NOT EXISTS(SELECT 1 FROM public.domains WHERE id=p_domain AND is_active) THEN
  RAISE EXCEPTION 'Préparation non autorisée pour ce client' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
  OR octet_length(p_input::text)>2097152 OR octet_length(p_rows::text)>2097152 THEN RAISE EXCEPTION 'Brouillon invalide ou trop volumineux'; END IF;
 IF jsonb_array_length(p_rows)<1 OR jsonb_array_length(p_rows)>10000 THEN RAISE EXCEPTION 'Entre 1 et 10 000 récoltes requises'; END IF;
 IF jsonb_typeof(p_input->'Recoltes') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Liste des récoltes requise'; END IF;
 IF jsonb_array_length(p_input->'Recoltes')<>jsonb_array_length(p_rows) THEN RAISE EXCEPTION 'Synthèse et liste des récoltes incohérentes'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_input) e WHERE e.key NOT IN('Recoltes','Plateaux','Envois','Sources','Pesees','Tri','Prix'))
 OR EXISTS(SELECT 1 FROM jsonb_each(p_input) e WHERE jsonb_typeof(e.value)<>'array')
 OR EXISTS(SELECT 1 FROM jsonb_each(p_input) e WHERE e.key NOT IN('Recoltes','Plateaux') AND jsonb_array_length(e.value)>0)
 THEN RAISE EXCEPTION 'Ce module accepte uniquement récoltes et plateaux'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_domain::text,160));
 IF p_revision=0 THEN
  INSERT INTO public.harvest_module_drafts(domain_id,revision,input_data,import_rows,updated_by)
   VALUES(p_domain,1,p_input,p_rows,auth.uid()) ON CONFLICT DO NOTHING RETURNING revision INTO v_revision;
 ELSE
  UPDATE public.harvest_module_drafts SET revision=revision+1,input_data=p_input,import_rows=p_rows,
   import_result=NULL,updated_by=auth.uid(),updated_at=now()
   WHERE domain_id=p_domain AND revision=p_revision RETURNING revision INTO v_revision;
 END IF;
 IF v_revision IS NULL THEN RAISE EXCEPTION 'Le brouillon a changé : rechargez le module avant de réessayer'; END IF;
 RETURN v_revision;
END;
$$;

CREATE FUNCTION public.import_saved_harvest_module(p_domain uuid,p_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_draft public.harvest_module_drafts%ROWTYPE;v_result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
 OR NOT coalesce(public.has_domain_permission(p_domain,auth.uid(),'recoltes','create'),false)
 OR NOT EXISTS(SELECT 1 FROM public.domains WHERE id=p_domain AND is_active) THEN
  RAISE EXCEPTION 'Import non autorisé pour ce client' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_domain::text,160));
 SELECT * INTO v_draft FROM public.harvest_module_drafts WHERE domain_id=p_domain AND revision=p_revision FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Brouillon modifié ou absent : rechargez le module'; END IF;
 IF v_draft.import_result IS NOT NULL THEN RETURN v_draft.import_result; END IF;
 -- Existing API rechecks tenant ownership, permissions, dates, DAR and quantities.
 v_result:=public.import_historical_harvests(p_domain,v_draft.import_rows);
 INSERT INTO public.harvest_module_history(domain_id,revision,input_data,import_rows,result,created_by)
  VALUES(p_domain,p_revision,v_draft.input_data,v_draft.import_rows,v_result,auth.uid());
 UPDATE public.harvest_module_drafts SET import_result=v_result,updated_at=now(),updated_by=auth.uid() WHERE domain_id=p_domain;
 RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.save_harvest_module_draft(uuid,integer,jsonb,jsonb),public.import_saved_harvest_module(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_harvest_module_draft(uuid,integer,jsonb,jsonb),public.import_saved_harvest_module(uuid,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
