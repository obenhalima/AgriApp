-- Migration 097 — Conformité ONSSA + marchés et stratégie LMR
BEGIN;

CREATE TABLE IF NOT EXISTS public.phyto_compliance_settings (
  domain_id UUID PRIMARY KEY REFERENCES public.domains(id) ON DELETE CASCADE,
  mrl_strategy VARCHAR(30) NOT NULL DEFAULT 'strictest' CHECK(mrl_strategy IN ('strictest','by_destination','internal_stricter')),
  internal_safety_factor NUMERIC(5,4) NOT NULL DEFAULT 1 CHECK(internal_safety_factor>0 AND internal_safety_factor<=1),
  updated_by UUID REFERENCES public.profiles(id),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.phyto_market_requirements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  code VARCHAR(60) NOT NULL,name VARCHAR(160) NOT NULL,
  requirement_type VARCHAR(30) NOT NULL CHECK(requirement_type IN ('legal_market','customer','certification')),
  positive_list_id UUID REFERENCES public.phyto_positive_lists(id) ON DELETE SET NULL,
  requires_prior_approval BOOLEAN NOT NULL DEFAULT FALSE,is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(domain_id,code)
);

CREATE TABLE IF NOT EXISTS public.phyto_mrl_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES public.phyto_market_requirements(id) ON DELETE CASCADE,
  active_substance VARCHAR(200) NOT NULL,crop_name VARCHAR(120) NOT NULL DEFAULT 'Tomate',
  limit_mg_kg NUMERIC(14,6) NOT NULL CHECK(limit_mg_kg>=0),is_limit_of_quantification BOOLEAN NOT NULL DEFAULT FALSE,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,valid_to DATE,source_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(valid_to IS NULL OR valid_to>=valid_from),UNIQUE(requirement_id,active_substance,crop_name,valid_from)
);

ALTER TABLE public.phyto_compliance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phyto_market_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phyto_mrl_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS phyto_compliance_settings_domain ON public.phyto_compliance_settings;
CREATE POLICY phyto_compliance_settings_domain ON public.phyto_compliance_settings FOR ALL TO authenticated USING(public.has_domain_permission(domain_id,auth.uid(),'agronomie','view')) WITH CHECK(public.has_domain_permission(domain_id,auth.uid(),'agronomie','edit'));
DROP POLICY IF EXISTS phyto_market_requirements_domain ON public.phyto_market_requirements;
CREATE POLICY phyto_market_requirements_domain ON public.phyto_market_requirements FOR ALL TO authenticated USING(public.has_domain_permission(domain_id,auth.uid(),'agronomie','view')) WITH CHECK(public.has_domain_permission(domain_id,auth.uid(),'agronomie','edit'));
DROP POLICY IF EXISTS phyto_mrl_limits_domain ON public.phyto_mrl_limits;
CREATE POLICY phyto_mrl_limits_domain ON public.phyto_mrl_limits FOR ALL TO authenticated USING(public.has_domain_permission(domain_id,auth.uid(),'agronomie','view')) WITH CHECK(public.has_domain_permission(domain_id,auth.uid(),'agronomie','edit'));

CREATE OR REPLACE FUNCTION public.get_effective_phyto_mrl(p_domain UUID,p_substance TEXT,p_crop TEXT DEFAULT 'Tomate',p_requirement_ids UUID[] DEFAULT NULL)
RETURNS TABLE(effective_limit_mg_kg NUMERIC,limiting_requirement TEXT,source_count INTEGER,strategy TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH cfg AS (SELECT COALESCE((SELECT mrl_strategy FROM phyto_compliance_settings WHERE domain_id=p_domain),'strictest') s,COALESCE((SELECT internal_safety_factor FROM phyto_compliance_settings WHERE domain_id=p_domain),1) f),
 applicable AS (SELECT l.limit_mg_kg,r.name FROM phyto_mrl_limits l JOIN phyto_market_requirements r ON r.id=l.requirement_id WHERE l.domain_id=p_domain AND r.is_active AND lower(l.active_substance)=lower(p_substance) AND lower(l.crop_name)=lower(p_crop) AND l.valid_from<=CURRENT_DATE AND (l.valid_to IS NULL OR l.valid_to>=CURRENT_DATE) AND (p_requirement_ids IS NULL OR l.requirement_id=ANY(p_requirement_ids))),
 minimum AS (SELECT min(limit_mg_kg) value,(array_agg(name ORDER BY limit_mg_kg,name))[1] limiter,count(*)::INTEGER n FROM applicable)
 SELECT CASE WHEN cfg.s='internal_stricter' THEN minimum.value*cfg.f ELSE minimum.value END,minimum.limiter,minimum.n,cfg.s FROM minimum CROSS JOIN cfg
$$;
REVOKE ALL ON FUNCTION public.get_effective_phyto_mrl(UUID,TEXT,TEXT,UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_effective_phyto_mrl(UUID,TEXT,TEXT,UUID[]) TO authenticated;

INSERT INTO public.phyto_compliance_settings(domain_id)
SELECT id FROM public.domains ON CONFLICT(domain_id) DO NOTHING;
COMMIT;
