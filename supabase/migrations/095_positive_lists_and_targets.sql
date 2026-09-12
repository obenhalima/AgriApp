-- Migration 095 — Listes positives versionnées et référentiel des cibles
BEGIN;

CREATE TABLE IF NOT EXISTS public.phyto_targets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_name VARCHAR(160) NOT NULL,
  category VARCHAR(30) NOT NULL DEFAULT 'autre' CHECK(category IN ('ravageur','maladie','acarien','nematode','adventice','autre')),
  aliases TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(canonical_name)
);

CREATE TABLE IF NOT EXISTS public.phyto_positive_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  document_code VARCHAR(80),
  version VARCHAR(40) NOT NULL,
  document_date DATE,
  validated_at DATE,
  validated_by_label TEXT,
  source_file_name TEXT NOT NULL,
  source_file_path TEXT,
  source_sha256 VARCHAR(64),
  status VARCHAR(20) NOT NULL DEFAULT 'brouillon' CHECK(status IN ('brouillon','a_controler','active','remplacee','rejetee')),
  imported_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_by UUID REFERENCES public.profiles(id),
  activated_at TIMESTAMPTZ,
  UNIQUE(domain_id,version)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_phyto_one_active_positive_list
  ON public.phyto_positive_lists(domain_id) WHERE status='active';

CREATE TABLE IF NOT EXISTS public.phyto_positive_list_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_id UUID NOT NULL REFERENCES public.phyto_positive_lists(id) ON DELETE CASCADE,
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  source_page INTEGER,
  source_row INTEGER,
  section VARCHAR(40),
  target_id UUID REFERENCES public.phyto_targets(id),
  target_label TEXT NOT NULL,
  product_id UUID REFERENCES public.plant_protection_products(id),
  authorized_use_id UUID REFERENCES public.product_authorized_uses(id),
  commercial_name TEXT NOT NULL,
  active_substances TEXT,
  risk_class VARCHAR(10),
  phi_days INTEGER,
  dose_text TEXT,
  treatment_mode TEXT,
  min_interval_text TEXT,
  supplier_name TEXT,
  eu_uk_mrl_text TEXT,
  swiss_mrl_text TEXT,
  max_repetitions INTEGER,
  resistance_group TEXT,
  comparison_status VARCHAR(20) NOT NULL DEFAULT 'nouveau' CHECK(comparison_status IN ('nouveau','identique','modifie','retire')),
  review_status VARCHAR(20) NOT NULL DEFAULT 'a_controler' CHECK(review_status IN ('a_controler','valide','rejete')),
  raw_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_positive_entries_list ON public.phyto_positive_list_entries(list_id,target_label,commercial_name);
CREATE INDEX IF NOT EXISTS idx_positive_entries_product ON public.phyto_positive_list_entries(domain_id,product_id);

ALTER TABLE public.phyto_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phyto_positive_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phyto_positive_list_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS phyto_targets_read ON public.phyto_targets;
CREATE POLICY phyto_targets_read ON public.phyto_targets FOR SELECT TO authenticated USING(TRUE);
DROP POLICY IF EXISTS positive_lists_domain ON public.phyto_positive_lists;
CREATE POLICY positive_lists_domain ON public.phyto_positive_lists FOR ALL TO authenticated
USING(public.has_domain_permission(domain_id,auth.uid(),'agronomie','view'))
WITH CHECK(public.has_domain_permission(domain_id,auth.uid(),'agronomie','edit'));
DROP POLICY IF EXISTS positive_entries_domain ON public.phyto_positive_list_entries;
CREATE POLICY positive_entries_domain ON public.phyto_positive_list_entries FOR ALL TO authenticated
USING(public.has_domain_permission(domain_id,auth.uid(),'agronomie','view'))
WITH CHECK(public.has_domain_permission(domain_id,auth.uid(),'agronomie','edit'));

INSERT INTO public.phyto_targets(canonical_name,category,aliases) VALUES
 ('Tuta absoluta','ravageur',ARRAY['Mineuse','Mineuse de la tomate']),
 ('Mouche blanche','ravageur',ARRAY['Aleurode','Aleurodes']),
 ('Thrips','ravageur',ARRAY[]::TEXT[]),('Puceron','ravageur',ARRAY['Pucerons']),
 ('Acariens','acarien',ARRAY['Acariose']),('Oïdium','maladie',ARRAY['Oidum']),
 ('Botrytis','maladie',ARRAY['Pourriture grise']),('Mildiou','maladie',ARRAY[]::TEXT[]),
 ('Alternariose','maladie',ARRAY[]::TEXT[]),('Cladosporiose','maladie',ARRAY[]::TEXT[]),
 ('Fusariose','maladie',ARRAY[]::TEXT[]),('Nématodes','nematode',ARRAY['Nématode','Champignon sol'])
ON CONFLICT(canonical_name) DO UPDATE SET aliases=EXCLUDED.aliases,category=EXCLUDED.category;

COMMIT;
