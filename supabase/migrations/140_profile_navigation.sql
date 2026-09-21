-- Configuration visuelle par société et rôle. Aucun droit métier modifié.
BEGIN;
CREATE TABLE public.profile_navigation (
 domain_id uuid NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
 role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
 config jsonb NOT NULL,
 updated_by uuid NOT NULL REFERENCES public.profiles(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(domain_id,role_id),
 CHECK(jsonb_typeof(config)='object')
);
ALTER TABLE public.profile_navigation ENABLE ROW LEVEL SECURITY;
CREATE POLICY profile_navigation_read ON public.profile_navigation FOR SELECT TO authenticated
 USING(public.is_domain_member(domain_id,auth.uid()) OR public.is_platform_admin(auth.uid()));
GRANT SELECT ON public.profile_navigation TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.profile_navigation FROM authenticated,anon;
CREATE FUNCTION public.save_profile_navigation(p_domain uuid,p_role uuid,p_config jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT COALESCE(is_domain_admin(p_domain,auth.uid()) OR is_platform_admin(auth.uid()),false)
 OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active)
 THEN RAISE EXCEPTION 'Administration du client requise'; END IF;
 IF p_config IS NULL OR jsonb_typeof(p_config)<>'object' OR octet_length(p_config::text)>30000
 OR jsonb_typeof(p_config->'hidden') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_config->'sections') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_config->'items') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_config->'expanded') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_config->'home') IS DISTINCT FROM 'string'
 THEN RAISE EXCEPTION 'Configuration de menu invalide'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_config) field
 CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN field.key IN ('hidden','sections','items','expanded') THEN field.value ELSE '[]'::jsonb END) entry
 WHERE jsonb_typeof(entry) IS DISTINCT FROM 'string')
 THEN RAISE EXCEPTION 'Les entrées du menu doivent être des chaînes'; END IF;
 INSERT INTO profile_navigation(domain_id,role_id,config,updated_by)
 VALUES(p_domain,p_role,p_config,auth.uid()) ON CONFLICT(domain_id,role_id)
 DO UPDATE SET config=EXCLUDED.config,updated_by=auth.uid(),updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.save_profile_navigation(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_profile_navigation(uuid,uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
