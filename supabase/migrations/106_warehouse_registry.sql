-- Migration 106A — Référentiel des entrepôts par client / société
BEGIN;

CREATE TABLE public.warehouses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  farm_id UUID REFERENCES public.farms(id) ON DELETE RESTRICT,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(160) NOT NULL,
  warehouse_type VARCHAR(30) NOT NULL DEFAULT 'central'
    CHECK(warehouse_type IN ('central','ferme','phytosanitaire','intrants','emballages','autre')),
  manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  address TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain_id,code)
);

CREATE UNIQUE INDEX uq_warehouse_default_domain
  ON public.warehouses(domain_id) WHERE is_default AND is_active;
CREATE INDEX idx_warehouses_domain_farm
  ON public.warehouses(domain_id,farm_id,is_active);

-- Chaque client existant reçoit un entrepôt central pour garantir la continuité.
INSERT INTO public.warehouses(domain_id,code,name,warehouse_type,is_default)
SELECT d.id,'PRINCIPAL','Entrepôt principal','central',TRUE
FROM public.domains d
WHERE NOT EXISTS(SELECT 1 FROM public.warehouses w WHERE w.domain_id=d.id);

CREATE OR REPLACE FUNCTION public.guard_warehouse_scope()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_farm_domain UUID;
BEGIN
  NEW.code:=upper(btrim(NEW.code));
  NEW.name:=btrim(NEW.name);
  IF NULLIF(NEW.code,'') IS NULL OR NULLIF(NEW.name,'') IS NULL THEN
    RAISE EXCEPTION 'Le code et le nom de l’entrepôt sont obligatoires';
  END IF;
  IF NEW.farm_id IS NOT NULL THEN
    SELECT domain_id INTO v_farm_domain FROM farms WHERE id=NEW.farm_id AND is_active;
    IF v_farm_domain IS DISTINCT FROM NEW.domain_id THEN
      RAISE EXCEPTION 'La ferme sélectionnée n’appartient pas au client actif';
    END IF;
  END IF;
  IF NEW.warehouse_type='ferme' AND NEW.farm_id IS NULL THEN
    RAISE EXCEPTION 'Un entrepôt de type ferme doit être rattaché à une ferme';
  END IF;
  IF NEW.is_default AND NOT NEW.is_active THEN
    RAISE EXCEPTION 'L’entrepôt principal doit rester actif';
  END IF;
  NEW.updated_at:=NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_warehouse_scope ON public.warehouses;
CREATE TRIGGER trg_guard_warehouse_scope
BEFORE INSERT OR UPDATE OF domain_id,farm_id,code,name,warehouse_type,is_default,is_active
ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.guard_warehouse_scope();

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY warehouses_read ON public.warehouses FOR SELECT TO authenticated
USING(public.is_platform_admin(auth.uid()) OR public.is_domain_member(domain_id,auth.uid()));
CREATE POLICY warehouses_insert ON public.warehouses FOR INSERT TO authenticated
WITH CHECK(public.has_domain_permission(domain_id,auth.uid(),'stocks','edit'));
CREATE POLICY warehouses_update ON public.warehouses FOR UPDATE TO authenticated
USING(public.has_domain_permission(domain_id,auth.uid(),'stocks','edit'))
WITH CHECK(public.has_domain_permission(domain_id,auth.uid(),'stocks','edit'));

COMMIT;
