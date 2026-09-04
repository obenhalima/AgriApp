-- Lot 3 d'isolation multi-domaines : budgets, coûts et compte d'exploitation.
ALTER TABLE public.budget_versions ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES public.domains(id) ON DELETE RESTRICT;
ALTER TABLE public.budget_lines ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES public.domains(id) ON DELETE RESTRICT;
ALTER TABLE public.cost_entries ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES public.domains(id) ON DELETE RESTRICT;

UPDATE public.budget_versions bv SET domain_id = c.domain_id FROM public.campaigns c WHERE c.id = bv.campaign_id AND bv.domain_id IS NULL;
UPDATE public.budget_lines bl SET domain_id = bv.domain_id FROM public.budget_versions bv WHERE bv.id = bl.version_id AND bl.domain_id IS NULL;
UPDATE public.cost_entries ce SET domain_id = c.domain_id FROM public.campaigns c WHERE c.id = ce.campaign_id AND ce.domain_id IS NULL;

ALTER TABLE public.budget_versions ALTER COLUMN domain_id SET NOT NULL;
ALTER TABLE public.budget_lines ALTER COLUMN domain_id SET NOT NULL;
ALTER TABLE public.cost_entries ALTER COLUMN domain_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_budget_versions_domain ON public.budget_versions(domain_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_domain ON public.budget_lines(domain_id);
CREATE INDEX IF NOT EXISTS idx_cost_entries_domain ON public.cost_entries(domain_id);

CREATE OR REPLACE FUNCTION public.sync_budget_version_domain() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  SELECT domain_id INTO NEW.domain_id FROM public.campaigns WHERE id=NEW.campaign_id;
  IF NEW.domain_id IS NULL THEN RAISE EXCEPTION 'Campagne introuvable'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sync_budget_line_domain() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_version UUID; v_farm UUID; v_greenhouse UUID;
BEGIN
  SELECT domain_id INTO v_version FROM public.budget_versions WHERE id=NEW.version_id;
  SELECT domain_id INTO v_farm FROM public.farms WHERE id=NEW.farm_id;
  IF NEW.greenhouse_id IS NOT NULL THEN
    SELECT f.domain_id INTO v_greenhouse FROM public.greenhouses g JOIN public.farms f ON f.id=g.farm_id WHERE g.id=NEW.greenhouse_id;
  ELSE v_greenhouse := v_farm; END IF;
  IF v_version IS NULL OR v_farm IS NULL OR v_version<>v_farm OR v_farm<>v_greenhouse THEN
    RAISE EXCEPTION 'Version, ferme et serre doivent appartenir au même domaine';
  END IF;
  NEW.domain_id := v_version;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sync_cost_entry_domain() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_campaign UUID; v_greenhouse UUID;
BEGIN
  SELECT domain_id INTO v_campaign FROM public.campaigns WHERE id=NEW.campaign_id;
  IF NEW.greenhouse_id IS NOT NULL THEN
    SELECT f.domain_id INTO v_greenhouse FROM public.greenhouses g JOIN public.farms f ON f.id=g.farm_id WHERE g.id=NEW.greenhouse_id;
    IF v_campaign<>v_greenhouse THEN RAISE EXCEPTION 'Campagne et serre doivent appartenir au même domaine'; END IF;
  END IF;
  IF v_campaign IS NULL THEN RAISE EXCEPTION 'Campagne introuvable'; END IF;
  NEW.domain_id := v_campaign;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_budget_version_domain ON public.budget_versions;
CREATE TRIGGER trg_budget_version_domain BEFORE INSERT OR UPDATE OF campaign_id,domain_id ON public.budget_versions FOR EACH ROW EXECUTE FUNCTION public.sync_budget_version_domain();
DROP TRIGGER IF EXISTS trg_budget_line_domain ON public.budget_lines;
CREATE TRIGGER trg_budget_line_domain BEFORE INSERT OR UPDATE OF version_id,farm_id,greenhouse_id,domain_id ON public.budget_lines FOR EACH ROW EXECUTE FUNCTION public.sync_budget_line_domain();
DROP TRIGGER IF EXISTS trg_cost_entry_domain ON public.cost_entries;
CREATE TRIGGER trg_cost_entry_domain BEFORE INSERT OR UPDATE OF campaign_id,greenhouse_id,domain_id ON public.cost_entries FOR EACH ROW EXECUTE FUNCTION public.sync_cost_entry_domain();

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['budget_versions','budget_lines','cost_entries'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','auth_read_'||t,t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','admin_write_'||t,t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',t||'_domain_select',t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()) OR public.is_domain_member(domain_id,auth.uid()))',t||'_domain_select',t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS bv_read ON public.budget_versions;
DROP POLICY IF EXISTS bv_write ON public.budget_versions;
DROP POLICY IF EXISTS bl_read ON public.budget_lines;
DROP POLICY IF EXISTS bl_write ON public.budget_lines;

CREATE POLICY budget_versions_domain_insert ON public.budget_versions FOR INSERT TO authenticated WITH CHECK (public.has_domain_permission(domain_id,auth.uid(),'budgets','create'));
CREATE POLICY budget_versions_domain_update ON public.budget_versions FOR UPDATE TO authenticated USING (public.has_domain_permission(domain_id,auth.uid(),'budgets','edit')) WITH CHECK (public.has_domain_permission(domain_id,auth.uid(),'budgets','edit'));
CREATE POLICY budget_versions_domain_delete ON public.budget_versions FOR DELETE TO authenticated USING (public.has_domain_permission(domain_id,auth.uid(),'budgets','delete'));
CREATE POLICY budget_lines_domain_insert ON public.budget_lines FOR INSERT TO authenticated WITH CHECK (public.has_domain_permission(domain_id,auth.uid(),'budgets','create'));
CREATE POLICY budget_lines_domain_update ON public.budget_lines FOR UPDATE TO authenticated USING (public.has_domain_permission(domain_id,auth.uid(),'budgets','edit')) WITH CHECK (public.has_domain_permission(domain_id,auth.uid(),'budgets','edit'));
CREATE POLICY budget_lines_domain_delete ON public.budget_lines FOR DELETE TO authenticated USING (public.has_domain_permission(domain_id,auth.uid(),'budgets','delete'));
CREATE POLICY cost_entries_domain_insert ON public.cost_entries FOR INSERT TO authenticated WITH CHECK (public.has_domain_permission(domain_id,auth.uid(),'couts','create'));
CREATE POLICY cost_entries_domain_update ON public.cost_entries FOR UPDATE TO authenticated USING (public.has_domain_permission(domain_id,auth.uid(),'couts','edit')) WITH CHECK (public.has_domain_permission(domain_id,auth.uid(),'couts','edit'));
CREATE POLICY cost_entries_domain_delete ON public.cost_entries FOR DELETE TO authenticated USING (public.has_domain_permission(domain_id,auth.uid(),'couts','delete'));

DO $$ BEGIN
  ALTER VIEW public.v_budget_by_farm_month SET (security_invoker=true);
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'Vue budget absente'; END $$;
