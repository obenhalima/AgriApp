-- Preparation workspace only. Apply on the shared POC only after approval.
-- No operational table is changed by this migration or its RPC.
BEGIN;
CREATE TABLE public.initialization_drafts (
 domain_id uuid PRIMARY KEY REFERENCES public.domains(id),
 payload jsonb NOT NULL,
 revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
 updated_by uuid NOT NULL REFERENCES public.profiles(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=2000000)
);
ALTER TABLE public.initialization_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY initialization_drafts_read ON public.initialization_drafts FOR SELECT TO authenticated
 USING ((public.is_domain_admin(domain_id,auth.uid()) OR public.is_platform_admin(auth.uid()))
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active));
GRANT SELECT ON public.initialization_drafts TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.initialization_drafts FROM authenticated, anon;
CREATE FUNCTION public.save_initialization_draft(p_domain uuid,p_revision integer,p_payload jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE next_revision integer;
BEGIN
 IF auth.uid() IS NULL OR NOT COALESCE(public.is_domain_admin(p_domain,auth.uid()) OR public.is_platform_admin(auth.uid()),false)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
 THEN RAISE EXCEPTION 'Administration du client requise'; END IF;
 IF p_revision IS NULL OR p_revision<0 OR p_payload IS NULL
 OR p_payload->>'schema' IS DISTINCT FROM '1'
 OR jsonb_typeof(p_payload->'rows') IS DISTINCT FROM 'object'
 OR jsonb_typeof(p_payload->'reviewed') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_payload->'skipped') IS DISTINCT FROM 'array'
 OR octet_length(p_payload::text)>2000000
 THEN RAISE EXCEPTION 'Brouillon invalide ou trop volumineux'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_payload->'rows') s WHERE jsonb_typeof(s.value)<>'array')
 THEN RAISE EXCEPTION 'Chaque section doit contenir une liste'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_payload->'rows') s WHERE jsonb_array_length(s.value)>1000)
 OR EXISTS(SELECT 1 FROM jsonb_each(p_payload->'rows') s CROSS JOIN LATERAL jsonb_array_elements(s.value) r WHERE jsonb_typeof(r)<>'object')
 THEN RAISE EXCEPTION 'Lignes invalides ou limite de 1000 lignes dépassée'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_payload->'rows') s
 CROSS JOIN LATERAL jsonb_array_elements(s.value) r
 CROSS JOIN LATERAL jsonb_each(r) c WHERE jsonb_typeof(c.value)<>'string' OR length(c.value #>> '{}')>2000)
 THEN RAISE EXCEPTION 'Les champs doivent être des textes de 2000 caractères maximum'; END IF;
 -- Serialize creation and edits for this domain, including a missing draft.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_domain::text,141));
 IF p_revision=0 THEN
   INSERT INTO public.initialization_drafts(domain_id,payload,updated_by)
   VALUES(p_domain,p_payload,auth.uid()) ON CONFLICT(domain_id) DO NOTHING
   RETURNING revision INTO next_revision;
 ELSE
   UPDATE public.initialization_drafts SET payload=p_payload,revision=revision+1,updated_by=auth.uid(),updated_at=now()
   WHERE domain_id=p_domain AND revision=p_revision RETURNING revision INTO next_revision;
 END IF;
 IF next_revision IS NULL THEN RAISE EXCEPTION 'Brouillon modifié ailleurs. Exportez votre saisie puis rechargez la page avant de réessayer.'; END IF;
 RETURN next_revision;
END $$;
REVOKE ALL ON FUNCTION public.save_initialization_draft(uuid,integer,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_initialization_draft(uuid,integer,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
