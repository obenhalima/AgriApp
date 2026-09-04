-- Lot 1 d'isolation multi-domaines : fermes et serres.
DO $$
DECLARE
  v_default_domain UUID;
BEGIN
  SELECT id INTO v_default_domain FROM public.domains WHERE upper(code) = 'DOM-BENHALIMA';
  IF v_default_domain IS NULL THEN
    RAISE EXCEPTION 'Domaine DOM-BENHALIMA introuvable';
  END IF;

  ALTER TABLE public.farms ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES public.domains(id) ON DELETE RESTRICT;
  UPDATE public.farms SET domain_id = v_default_domain WHERE domain_id IS NULL;
  ALTER TABLE public.farms ALTER COLUMN domain_id SET NOT NULL;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_farms_domain ON public.farms(domain_id);

-- Le code d'une ferme est unique à l'intérieur d'un client, pas sur toute la plateforme.
ALTER TABLE public.farms DROP CONSTRAINT IF EXISTS farms_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_farms_domain_code ON public.farms(domain_id, upper(code));

ALTER TABLE public.farms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.greenhouses ENABLE ROW LEVEL SECURITY;

-- Supprime les anciennes policies permissives créées par la migration 023.
-- Les policies PostgreSQL permissives se combinent avec OR : les conserver
-- annulerait complètement l'isolation par domaine.
DROP POLICY IF EXISTS auth_read_farms ON public.farms;
DROP POLICY IF EXISTS admin_write_farms ON public.farms;
DROP POLICY IF EXISTS auth_read_greenhouses ON public.greenhouses;
DROP POLICY IF EXISTS admin_write_greenhouses ON public.greenhouses;

DROP POLICY IF EXISTS farms_domain_select ON public.farms;
DROP POLICY IF EXISTS farms_domain_insert ON public.farms;
DROP POLICY IF EXISTS farms_domain_update ON public.farms;
DROP POLICY IF EXISTS farms_domain_delete ON public.farms;

CREATE POLICY farms_domain_select ON public.farms FOR SELECT TO authenticated
USING (public.has_domain_permission(domain_id, auth.uid(), 'fermes', 'view'));
CREATE POLICY farms_domain_insert ON public.farms FOR INSERT TO authenticated
WITH CHECK (public.has_domain_permission(domain_id, auth.uid(), 'fermes', 'create'));
CREATE POLICY farms_domain_update ON public.farms FOR UPDATE TO authenticated
USING (public.has_domain_permission(domain_id, auth.uid(), 'fermes', 'edit'))
WITH CHECK (public.has_domain_permission(domain_id, auth.uid(), 'fermes', 'edit'));
CREATE POLICY farms_domain_delete ON public.farms FOR DELETE TO authenticated
USING (public.has_domain_permission(domain_id, auth.uid(), 'fermes', 'delete'));

DROP POLICY IF EXISTS greenhouses_domain_select ON public.greenhouses;
DROP POLICY IF EXISTS greenhouses_domain_insert ON public.greenhouses;
DROP POLICY IF EXISTS greenhouses_domain_update ON public.greenhouses;
DROP POLICY IF EXISTS greenhouses_domain_delete ON public.greenhouses;

CREATE POLICY greenhouses_domain_select ON public.greenhouses FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.farms f
  WHERE f.id = greenhouses.farm_id
    AND public.has_domain_permission(f.domain_id, auth.uid(), 'serres', 'view')
));
CREATE POLICY greenhouses_domain_insert ON public.greenhouses FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.farms f
  WHERE f.id = greenhouses.farm_id
    AND public.has_domain_permission(f.domain_id, auth.uid(), 'serres', 'create')
));
CREATE POLICY greenhouses_domain_update ON public.greenhouses FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.farms f
  WHERE f.id = greenhouses.farm_id
    AND public.has_domain_permission(f.domain_id, auth.uid(), 'serres', 'edit')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.farms f
  WHERE f.id = greenhouses.farm_id
    AND public.has_domain_permission(f.domain_id, auth.uid(), 'serres', 'edit')
));
CREATE POLICY greenhouses_domain_delete ON public.greenhouses FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.farms f
  WHERE f.id = greenhouses.farm_id
    AND public.has_domain_permission(f.domain_id, auth.uid(), 'serres', 'delete')
));
