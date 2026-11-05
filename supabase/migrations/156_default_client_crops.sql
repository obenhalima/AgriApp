-- Install once after 155. No existing client is changed by installation.
-- Generic templates from migration 058, never copied from a client's data.
BEGIN;
CREATE TABLE public.default_crop_templates (
 code varchar(50) PRIMARY KEY, name varchar(100) NOT NULL, family varchar(80),
 icon varchar(20), color varchar(20), cycle_days_first_harvest integer,
 harvest_duration_days integer, default_unit varchar(30), brix_relevant boolean,
 default_markets jsonb NOT NULL, variety_segments jsonb NOT NULL,
 is_active boolean NOT NULL, order_idx integer NOT NULL
);
ALTER TABLE public.default_crop_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.default_crop_templates FROM PUBLIC,anon,authenticated;
INSERT INTO public.default_crop_templates (code, name, family, icon, color, cycle_days_first_harvest, harvest_duration_days, default_unit, brix_relevant, default_markets, variety_segments, is_active, order_idx) VALUES
  ('tomate',        'Tomate',          'Solanacées',     '🍅', '#ef4444', 75,  180, 'kg',        true,  '["export","local"]',      '["ronde","grappe","cerise","cocktail","allongee","beef","coeur_de_boeuf"]', true,  1),
  ('poivron',       'Poivron doux',    'Solanacées',     '🫑', '#22c55e', 85,  150, 'kg',        false, '["export","local"]',      '["california","lamuyo","conique"]',                                          true,  2),
  ('piment_fort',   'Piment fort',     'Solanacées',     '🌶️', '#dc2626', 80,  150, 'kg',        false, '["local","industrie"]',   '["fort_long","doux_long","rond"]',                                           false, 3),
  ('aubergine',     'Aubergine',       'Solanacées',     '🍆', '#7c3aed', 80,  150, 'kg',        false, '["local","export"]',      '["longue","ovale","globe","blanche"]',                                       true,  4),
  ('concombre',     'Concombre',       'Cucurbitacées',  '🥒', '#16a34a', 40,  90,  'piece',     false, '["export","local"]',      '["long_hollandais","beit_alpha","mini"]',                                    true,  5),
  ('courgette',     'Courgette',       'Cucurbitacées',  '🥒', '#84cc16', 45,  75,  'kg',        false, '["export","local"]',      '["verte","jaune","ronde"]',                                                  true,  6),
  ('melon',         'Melon',           'Cucurbitacées',  '🍈', '#f59e0b', 85,  45,  'piece',     true,  '["export","local"]',      '["charentais","galia","canari","piel_de_sapo"]',                             true,  7),
  ('pasteque',      'Pastèque',        'Cucurbitacées',  '🍉', '#ec4899', 85,  45,  'piece',     true,  '["local","export"]',      '["rouge_pepins","sans_pepins","mini"]',                                      true,  8),
  ('haricot_vert',  'Haricot vert',    'Fabacées',       '🫛', '#65a30d', 65,  90,  'kg',        false, '["export"]',              '["filet_extrafin","filet_fin","mangetout","beurre"]',                        true,  9),
  ('petits_pois',   'Petits pois',     'Fabacées',       '🫛', '#4d7c0f', 65,  45,  'kg',        false, '["local"]',               '["a_ecosser","mangetout"]',                                                  false, 10),
  ('fraise',        'Fraise',          'Rosacées',       '🍓', '#e11d48', 75,  150, 'barquette', true,  '["export"]',              '["frais","iqf_surgele"]',                                                    false, 11),
  ('framboise',     'Framboise',       'Rosacées',       '🫐', '#be123c', 90,  120, 'barquette', true,  '["export"]',              '["remontante","non_remontante"]',                                            false, 12),
  ('myrtille',      'Myrtille',        'Éricacées',      '🫐', '#4338ca', 730, 210, 'barquette', true,  '["export"]',              '["southern_highbush"]',                                                      false, 13),
  ('oignon',        'Oignon',          'Amaryllidacées', '🧅', '#a16207', 120, 30,  'kg',        false, '["local","export"]',      '["jaune","rouge","blanc"]',                                                  false, 14),
  ('pomme_de_terre','Pomme de terre',  'Solanacées',     '🥔', '#ca8a04', 100, 20,  'kg',        false, '["local","export"]',      '["primeur","conservation"]',                                                 false, 15)
ON CONFLICT (code) DO NOTHING;
CREATE TABLE public.client_reference_bootstrap (
 domain_id uuid PRIMARY KEY REFERENCES public.domains(id) ON DELETE CASCADE,
 template_version integer NOT NULL DEFAULT 1, initialized_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_reference_bootstrap ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_reference_bootstrap FROM PUBLIC,anon,authenticated;

-- Private helper: only trusted trigger / authorized RPC can invoke it.
CREATE FUNCTION public.seed_client_crops(p_domain uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE added integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_domain::text,156));
 IF NOT EXISTS(SELECT 1 FROM public.domains WHERE id=p_domain AND is_active) THEN
  RAISE EXCEPTION 'Client actif requis';
 END IF;
 INSERT INTO public.crops(id,domain_id,code,name,family,icon,color,cycle_days_first_harvest,
  harvest_duration_days,default_unit,brix_relevant,default_markets,variety_segments,is_active,order_idx)
 SELECT gen_random_uuid(),p_domain,t.code,t.name,t.family,t.icon,t.color,t.cycle_days_first_harvest,
  t.harvest_duration_days,t.default_unit,t.brix_relevant,t.default_markets,t.variety_segments,t.is_active,t.order_idx
 FROM public.default_crop_templates t
 WHERE NOT EXISTS(SELECT 1 FROM public.crops c WHERE c.domain_id=p_domain AND upper(trim(c.code))=upper(trim(t.code)))
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS added=ROW_COUNT;
 INSERT INTO public.client_reference_bootstrap(domain_id) VALUES(p_domain) ON CONFLICT DO NOTHING;
 RETURN added;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_client_crops(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.seed_new_client_crops() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.is_active THEN PERFORM public.seed_client_crops(NEW.id); END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_new_client_crops() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER domains_default_crops AFTER INSERT ON public.domains
 FOR EACH ROW EXECUTE FUNCTION public.seed_new_client_crops();

CREATE FUNCTION public.initialize_client_default_crops(p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE added integer;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
  OR NOT coalesce(public.is_domain_admin(p_domain,auth.uid()),false) THEN
  RAISE EXCEPTION 'Administration du client requise' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.domains WHERE id=p_domain AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Client actif introuvable'; END IF;
 added:=public.seed_client_crops(p_domain);
 RETURN jsonb_build_object('domain_id',p_domain,'created',added,
  'total',(SELECT count(*) FROM public.crops WHERE domain_id=p_domain),
  'active',(SELECT count(*) FROM public.crops WHERE domain_id=p_domain AND is_active));
END;
$$;

-- Used by both client-creation screens: insert + trigger run in one transaction.
CREATE FUNCTION public.create_client_with_defaults(p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE d public.domains%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
  OR NOT coalesce(public.is_platform_admin(auth.uid()),false) THEN
  RAISE EXCEPTION 'Administration plateforme requise' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object'
  OR btrim(coalesce(p_input->>'code',''))='' OR btrim(coalesce(p_input->>'name',''))='' THEN
  RAISE EXCEPTION 'Code et nom du client requis';
 END IF;
 SELECT * INTO d FROM jsonb_populate_record(NULL::public.domains,p_input);
 INSERT INTO public.domains(code,name,legal_name,address,city,region,country,currency,timezone,locale,logo_url,is_active)
 VALUES(upper(btrim(d.code)),btrim(d.name),d.legal_name,d.address,d.city,d.region,
  coalesce(nullif(d.country,''),'Maroc'),coalesce(nullif(d.currency,''),'MAD'),
  coalesce(nullif(d.timezone,''),'Africa/Casablanca'),coalesce(nullif(d.locale,''),'fr-MA'),d.logo_url,coalesce(d.is_active,true))
 RETURNING * INTO d;
 RETURN to_jsonb(d);
END;
$$;

-- Keep existing structural checks. New isolated clients need not appear in the historical cutover plan.
CREATE OR REPLACE FUNCTION public.client_reference_isolation_ready(p_domain uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT auth.uid() IS NOT NULL
  AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
  AND EXISTS(SELECT 1 FROM public.domains WHERE id=p_domain AND is_active)
  AND (public.is_platform_admin(auth.uid()) OR public.is_domain_member(p_domain,auth.uid()))
  AND (EXISTS(SELECT 1 FROM public.client_reference_migration_plan WHERE domain_id=p_domain AND approved)
   OR EXISTS(SELECT 1 FROM public.client_reference_bootstrap WHERE domain_id=p_domain))
  AND NOT EXISTS(SELECT 1 FROM public.client_reference_cutover_snapshot WHERE after_row IS NULL)
  AND (SELECT count(*) FROM pg_constraint WHERE conname IN
   ('campaign_plantings_variety_client_fk','harvest_lots_variety_client_fk','cost_entries_variety_client_fk',
    'market_prices_variety_client_fk','sales_order_lines_variety_client_fk','station_settlement_lines_variety_client_fk')
   AND convalidated AND connamespace='public'::regnamespace)=6
  AND (SELECT count(*) FROM pg_class WHERE oid IN
   ('public.crops'::regclass,'public.varieties'::regclass,'public.seed_suppliers'::regclass,'public.crop_variety_catalog'::regclass)
   AND relrowsecurity)=4;
$$;
REVOKE ALL ON FUNCTION public.initialize_client_default_crops(uuid),public.create_client_with_defaults(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.initialize_client_default_crops(uuid),public.create_client_with_defaults(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
