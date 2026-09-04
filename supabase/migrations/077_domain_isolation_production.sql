-- Lot 2 d'isolation multi-domaines : campagnes, plantations et récoltes.
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES public.domains(id) ON DELETE RESTRICT;
ALTER TABLE public.campaign_plantings ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES public.domains(id) ON DELETE RESTRICT;
ALTER TABLE public.harvests ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES public.domains(id) ON DELETE RESTRICT;
ALTER TABLE public.harvest_lots ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES public.domains(id) ON DELETE RESTRICT;

UPDATE public.campaigns c SET domain_id = f.domain_id FROM public.farms f WHERE f.id = c.farm_id AND c.domain_id IS NULL;
UPDATE public.campaign_plantings cp SET domain_id = c.domain_id FROM public.campaigns c WHERE c.id = cp.campaign_id AND cp.domain_id IS NULL;
UPDATE public.harvests h SET domain_id = cp.domain_id FROM public.campaign_plantings cp WHERE cp.id = h.campaign_planting_id AND h.domain_id IS NULL;
UPDATE public.harvest_lots hl SET domain_id = cp.domain_id FROM public.campaign_plantings cp WHERE cp.id = hl.campaign_planting_id AND hl.domain_id IS NULL;

ALTER TABLE public.campaigns ALTER COLUMN domain_id SET NOT NULL;
ALTER TABLE public.campaign_plantings ALTER COLUMN domain_id SET NOT NULL;
ALTER TABLE public.harvests ALTER COLUMN domain_id SET NOT NULL;
ALTER TABLE public.harvest_lots ALTER COLUMN domain_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_domain ON public.campaigns(domain_id);
CREATE INDEX IF NOT EXISTS idx_campaign_plantings_domain ON public.campaign_plantings(domain_id);
CREATE INDEX IF NOT EXISTS idx_harvests_domain ON public.harvests(domain_id);
CREATE INDEX IF NOT EXISTS idx_harvest_lots_domain ON public.harvest_lots(domain_id);

-- La vue doit respecter les RLS de ses tables sources.
DO $$ BEGIN
  ALTER VIEW public.v_planting_forecasts SET (security_invoker = true);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Vue v_planting_forecasts absente : contrôle ignoré';
END $$;

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaigns_domain_code ON public.campaigns(domain_id, upper(code));

CREATE OR REPLACE FUNCTION public.sync_campaign_domain() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_domain UUID;
BEGIN
  SELECT domain_id INTO v_domain FROM public.farms WHERE id = NEW.farm_id;
  IF v_domain IS NULL THEN RAISE EXCEPTION 'Ferme introuvable'; END IF;
  NEW.domain_id := v_domain;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_planting_domain() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_campaign_domain UUID; v_greenhouse_domain UUID;
BEGIN
  SELECT domain_id INTO v_campaign_domain FROM public.campaigns WHERE id = NEW.campaign_id;
  SELECT f.domain_id INTO v_greenhouse_domain FROM public.greenhouses g JOIN public.farms f ON f.id = g.farm_id WHERE g.id = NEW.greenhouse_id;
  IF v_campaign_domain IS NULL OR v_greenhouse_domain IS NULL OR v_campaign_domain <> v_greenhouse_domain THEN
    RAISE EXCEPTION 'La campagne et la serre doivent appartenir au même domaine';
  END IF;
  NEW.domain_id := v_campaign_domain;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_harvest_domain() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT domain_id INTO NEW.domain_id FROM public.campaign_plantings WHERE id = NEW.campaign_planting_id;
  IF NEW.domain_id IS NULL THEN RAISE EXCEPTION 'Plantation introuvable'; END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_harvest_lot_domain() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_planting_domain UUID; v_greenhouse_domain UUID;
BEGIN
  SELECT domain_id INTO v_planting_domain FROM public.campaign_plantings WHERE id = NEW.campaign_planting_id;
  SELECT f.domain_id INTO v_greenhouse_domain FROM public.greenhouses g JOIN public.farms f ON f.id = g.farm_id WHERE g.id = NEW.greenhouse_id;
  IF v_planting_domain IS NULL OR v_greenhouse_domain IS NULL OR v_planting_domain <> v_greenhouse_domain THEN
    RAISE EXCEPTION 'Le lot, la plantation et la serre doivent appartenir au même domaine';
  END IF;
  NEW.domain_id := v_planting_domain;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_campaign_domain ON public.campaigns;
CREATE TRIGGER trg_campaign_domain BEFORE INSERT OR UPDATE OF farm_id, domain_id ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.sync_campaign_domain();
DROP TRIGGER IF EXISTS trg_planting_domain ON public.campaign_plantings;
CREATE TRIGGER trg_planting_domain BEFORE INSERT OR UPDATE OF campaign_id, greenhouse_id, domain_id ON public.campaign_plantings FOR EACH ROW EXECUTE FUNCTION public.sync_planting_domain();
DROP TRIGGER IF EXISTS trg_harvest_domain ON public.harvests;
CREATE TRIGGER trg_harvest_domain BEFORE INSERT OR UPDATE OF campaign_planting_id, domain_id ON public.harvests FOR EACH ROW EXECUTE FUNCTION public.sync_harvest_domain();
DROP TRIGGER IF EXISTS trg_harvest_lot_domain ON public.harvest_lots;
CREATE TRIGGER trg_harvest_lot_domain BEFORE INSERT OR UPDATE OF campaign_planting_id, greenhouse_id, domain_id ON public.harvest_lots FOR EACH ROW EXECUTE FUNCTION public.sync_harvest_lot_domain();

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['campaigns','campaign_plantings','harvests','harvest_lots'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'auth_read_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'admin_write_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_domain_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_domain_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_domain_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_domain_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()) OR public.is_domain_member(domain_id, auth.uid()))', t || '_domain_select', t);
  END LOOP;
END $$;

CREATE POLICY campaigns_domain_insert ON public.campaigns FOR INSERT TO authenticated WITH CHECK (public.has_domain_permission(domain_id, auth.uid(), 'campagnes', 'create'));
CREATE POLICY campaigns_domain_update ON public.campaigns FOR UPDATE TO authenticated USING (public.has_domain_permission(domain_id, auth.uid(), 'campagnes', 'edit')) WITH CHECK (public.has_domain_permission(domain_id, auth.uid(), 'campagnes', 'edit'));
CREATE POLICY campaigns_domain_delete ON public.campaigns FOR DELETE TO authenticated USING (public.has_domain_permission(domain_id, auth.uid(), 'campagnes', 'delete'));
CREATE POLICY campaign_plantings_domain_insert ON public.campaign_plantings FOR INSERT TO authenticated WITH CHECK (public.has_domain_permission(domain_id, auth.uid(), 'production', 'create'));
CREATE POLICY campaign_plantings_domain_update ON public.campaign_plantings FOR UPDATE TO authenticated USING (public.has_domain_permission(domain_id, auth.uid(), 'production', 'edit')) WITH CHECK (public.has_domain_permission(domain_id, auth.uid(), 'production', 'edit'));
CREATE POLICY campaign_plantings_domain_delete ON public.campaign_plantings FOR DELETE TO authenticated USING (public.has_domain_permission(domain_id, auth.uid(), 'production', 'delete'));
CREATE POLICY harvests_domain_insert ON public.harvests FOR INSERT TO authenticated WITH CHECK (public.has_domain_permission(domain_id, auth.uid(), 'recoltes', 'create'));
CREATE POLICY harvests_domain_update ON public.harvests FOR UPDATE TO authenticated USING (public.has_domain_permission(domain_id, auth.uid(), 'recoltes', 'edit')) WITH CHECK (public.has_domain_permission(domain_id, auth.uid(), 'recoltes', 'edit'));
CREATE POLICY harvests_domain_delete ON public.harvests FOR DELETE TO authenticated USING (public.has_domain_permission(domain_id, auth.uid(), 'recoltes', 'delete'));
CREATE POLICY harvest_lots_domain_insert ON public.harvest_lots FOR INSERT TO authenticated WITH CHECK (public.has_domain_permission(domain_id, auth.uid(), 'recoltes', 'create'));
CREATE POLICY harvest_lots_domain_update ON public.harvest_lots FOR UPDATE TO authenticated USING (public.has_domain_permission(domain_id, auth.uid(), 'recoltes', 'edit')) WITH CHECK (public.has_domain_permission(domain_id, auth.uid(), 'recoltes', 'edit'));
CREATE POLICY harvest_lots_domain_delete ON public.harvest_lots FOR DELETE TO authenticated USING (public.has_domain_permission(domain_id, auth.uid(), 'recoltes', 'delete'));
