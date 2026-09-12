-- Lot 114 : plan schématique, sans modification des surfaces ni des cultures.
BEGIN;
CREATE TABLE IF NOT EXISTS public.farm_schematic_plans (
 farm_id UUID PRIMARY KEY REFERENCES public.farms(id) ON DELETE CASCADE,
 domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
 shapes JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(shapes)='array'),
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);
ALTER TABLE public.farm_schematic_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS farm_plan_read ON public.farm_schematic_plans;
CREATE POLICY farm_plan_read ON public.farm_schematic_plans FOR SELECT TO authenticated
 USING(public.has_domain_permission(domain_id,auth.uid(),'campagnes','view')
    OR public.has_domain_permission(domain_id,auth.uid(),'fermes','view'));
REVOKE ALL ON public.farm_schematic_plans FROM anon, authenticated;
GRANT SELECT ON public.farm_schematic_plans TO authenticated;

CREATE OR REPLACE FUNCTION public.save_farm_schematic_plan(p_farm UUID,p_revision INTEGER,p_shapes JSONB)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d UUID; current_revision INTEGER; item JSONB; gh UUID; ids UUID[] := '{}';
 x NUMERIC; y NUMERIC; w NUMERIC; h NUMERIC; r NUMERIC; half_w NUMERIC; half_h NUMERIC;
BEGIN
 SELECT domain_id INTO d FROM farms WHERE id=p_farm AND is_active FOR UPDATE;
 IF auth.uid() IS NULL OR d IS NULL OR NOT public.has_domain_permission(d,auth.uid(),'fermes','edit')
 THEN RAISE EXCEPTION 'Modification du plan non autorisée pour cette ferme'; END IF;
 -- Sérialise aussi la première sauvegarde et refuse les écrasements concurrents.
 SELECT revision INTO current_revision FROM farm_schematic_plans WHERE farm_id=p_farm;
 IF p_revision IS NULL OR p_revision IS DISTINCT FROM coalesce(current_revision,0)
 THEN RAISE EXCEPTION 'Le plan a été modifié ailleurs. Rechargez avant de recommencer.'; END IF;
 IF p_shapes IS NULL OR jsonb_typeof(p_shapes)<>'array' THEN RAISE EXCEPTION 'Plan invalide'; END IF;
 IF jsonb_array_length(p_shapes)>500 THEN RAISE EXCEPTION 'Maximum 500 serres par plan'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_shapes) LOOP
  IF jsonb_typeof(item)<>'object' OR NOT (item ?& ARRAY['greenhouse_id','x','y','width','height','rotation'])
  THEN RAISE EXCEPTION 'Forme incomplète'; END IF;
  gh := (item->>'greenhouse_id')::uuid;
  IF gh IS NULL OR gh=ANY(ids) OR NOT EXISTS(SELECT 1 FROM greenhouses WHERE id=gh AND farm_id=p_farm)
  THEN RAISE EXCEPTION 'Serre dupliquée ou étrangère à la ferme'; END IF;
  ids := array_append(ids,gh);
  IF EXISTS(SELECT 1 FROM unnest(ARRAY['x','y','width','height','rotation']) k WHERE jsonb_typeof(item->k) IS DISTINCT FROM 'number')
  THEN RAISE EXCEPTION 'Dimensions numériques requises'; END IF;
  x:=(item->>'x')::numeric; y:=(item->>'y')::numeric;
  w:=(item->>'width')::numeric; h:=(item->>'height')::numeric; r:=(item->>'rotation')::numeric;
  half_w:=CASE WHEN r IN (90,270) THEN h ELSE w END/2;
  half_h:=CASE WHEN r IN (90,270) THEN w ELSE h END/2;
  IF w NOT BETWEEN 60 AND 300 OR h NOT BETWEEN 40 AND 300 OR r NOT IN (0,90,180,270)
     OR x NOT BETWEEN half_w AND 1200-half_w OR y NOT BETWEEN half_h AND 800-half_h
  THEN RAISE EXCEPTION 'Dimensions ou position hors du plan'; END IF;
 END LOOP;
 INSERT INTO farm_schematic_plans(farm_id,domain_id,shapes,revision,updated_by)
 VALUES(p_farm,d,p_shapes,1,auth.uid())
 ON CONFLICT(farm_id) DO UPDATE SET shapes=excluded.shapes, revision=farm_schematic_plans.revision+1,
  updated_at=now(),updated_by=auth.uid();
 RETURN coalesce(current_revision,0)+1;
END $$;
REVOKE ALL ON FUNCTION public.save_farm_schematic_plan(UUID,INTEGER,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_farm_schematic_plan(UUID,INTEGER,JSONB) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
