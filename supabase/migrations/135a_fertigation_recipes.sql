-- Lot 135A : recettes et simulation UNIQUEMENT. Prérequis : 133 et stocks 106B.
-- Aucun mouvement, réservation, coût, validation d'application ou notification.
BEGIN;
INSERT INTO public.business_capabilities(code,name,process_code,is_sensitive,is_system)
VALUES('fertigation.recipe','Préparer les recettes de fertigation','fertigation',false,true) ON CONFLICT(code) DO NOTHING;
INSERT INTO public.function_capabilities(function_id,capability_id)
SELECT f.id,c.id FROM public.operational_functions f CROSS JOIN public.business_capabilities c
WHERE f.code='responsable_fertigation' AND c.code='fertigation.recipe' ON CONFLICT DO NOTHING;

CREATE TABLE public.fertigation_recipes(
 id uuid PRIMARY KEY,domain_id uuid NOT NULL REFERENCES public.domains(id),farm_id uuid NOT NULL REFERENCES public.farms(id),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 3 AND 160),notes text NOT NULL DEFAULT '',
 lines jsonb NOT NULL CHECK(jsonb_typeof(lines)='array' AND jsonb_array_length(lines) BETWEEN 1 AND 30),
 input jsonb NOT NULL,created_by uuid NOT NULL REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.fertigation_recipes(domain_id,farm_id,created_at);
ALTER TABLE public.fertigation_recipes ENABLE ROW LEVEL SECURITY;
-- RPC-only, including reads: authorization checks also exclude inactive profiles/farms.
REVOKE ALL ON public.fertigation_recipes FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.fertigation_lines(p_domain uuid,p_liters numeric,p_lines jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE line jsonb; item stock_items%ROWTYPE; result jsonb:='[]'; seen uuid[]:='{}';
 dose numeric; source text; target text; qty numeric;
BEGIN
 IF p_liters IS NULL OR NOT(p_liters>0 AND p_liters<=1e12) THEN RAISE EXCEPTION 'Volume final positif requis'; END IF;
 IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' THEN RAISE EXCEPTION 'Lignes engrais requises'; END IF;
 IF jsonb_array_length(p_lines) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Prévoir de 1 à 30 engrais'; END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  SELECT * INTO item FROM stock_items WHERE id=(line->>'stock_item_id')::uuid AND domain_id=p_domain
    AND is_active AND category::text='engrais' AND plant_protection_product_id IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Article engrais actif de la société requis (hors phytosanitaires)'; END IF;
  IF item.id=ANY(seen) THEN RAISE EXCEPTION 'Engrais en double dans la recette'; END IF;
  seen:=array_append(seen,item.id);
  dose:=(line->>'dose')::numeric; source:=line->>'dose_unit'; target:=lower(btrim(item.unit));
  IF dose IS NULL OR NOT(dose>0 AND dose<=1e12) THEN RAISE EXCEPTION 'Concentration positive requise'; END IF;
  IF source IS NULL OR NOT((source IN('kg_m3','g_m3') AND target IN('kg','g')) OR (source IN('l_m3','ml_m3') AND target IN('l','ml'))) THEN
   RAISE EXCEPTION 'Unité incompatible : % (stock %) / %',item.name,item.unit,source;
  END IF;
  qty:=round(p_liters/1000*dose*CASE WHEN source IN('kg_m3','l_m3') THEN 1000 ELSE 1 END/CASE WHEN target IN('kg','l') THEN 1000 ELSE 1 END,4);
  IF NOT(qty>0 AND qty<=1e10) THEN RAISE EXCEPTION 'Quantité trop faible ou trop élevée pour le stock'; END IF;
  result:=result||jsonb_build_array(jsonb_build_object('stock_item_id',item.id,'name',item.name,'stock_unit',item.unit,'dose',dose,'dose_unit',source,'quantity',qty));
 END LOOP;
 RETURN result;
END $$;

CREATE FUNCTION public.save_fertigation_recipe(p_id uuid,p_input jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d uuid:=(p_input->>'domain_id')::uuid; f uuid:=(p_input->>'farm_id')::uuid; old fertigation_recipes%ROWTYPE; checked jsonb;
BEGIN
 IF NOT irrigation_access(d,f,'fertigation.recipe') THEN RAISE EXCEPTION 'Habilitation recette fertigation requise sur cette ferme'; END IF;
 IF p_id IS NULL THEN RAISE EXCEPTION 'Identifiant de recette requis'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,135));
 SELECT * INTO old FROM fertigation_recipes WHERE id=p_id;
 IF FOUND THEN
  IF old.created_by=auth.uid() AND old.input=p_input THEN RETURN p_id; END IF;
  RAISE EXCEPTION 'Recette déjà enregistrée : créer une nouvelle recette pour la modifier';
 END IF;
 IF p_input->>'basis' IS DISTINCT FROM 'final_solution' THEN RAISE EXCEPTION 'Recette exprimée dans la solution finale uniquement, pas dans une cuve mère'; END IF;
 IF p_input->>'name' IS NULL OR length(btrim(p_input->>'name')) NOT BETWEEN 3 AND 160 OR length(coalesce(p_input->>'notes',''))>4000 THEN RAISE EXCEPTION 'Nom de 3 à 160 caractères et consignes de 4000 caractères maximum'; END IF;
 checked:=fertigation_lines(d,1000,p_input->'lines');
 INSERT INTO fertigation_recipes(id,domain_id,farm_id,name,notes,lines,input,created_by)
 VALUES(p_id,d,f,btrim(p_input->>'name'),coalesce(p_input->>'notes',''),checked,p_input,auth.uid());
 RETURN p_id;
END $$;

CREATE FUNCTION public.preview_fertigation_recipe(p_domain uuid,p_farm uuid,p_warehouse uuid,p_liters numeric,p_lines jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE checked jsonb; result jsonb:='[]'; line jsonb; available numeric;
BEGIN
 IF NOT irrigation_access(p_domain,p_farm) THEN RAISE EXCEPTION 'Accès agronomie requis sur cette ferme'; END IF;
 IF NOT EXISTS(SELECT 1 FROM warehouses WHERE id=p_warehouse AND domain_id=p_domain AND farm_id=p_farm AND is_active) THEN RAISE EXCEPTION 'Entrepôt actif de la ferme requis'; END IF;
 checked:=fertigation_lines(p_domain,p_liters,p_lines);
 FOR line IN SELECT value FROM jsonb_array_elements(checked) LOOP
  SELECT coalesce(sum(current_qty),0) INTO available FROM warehouse_stocks WHERE warehouse_id=p_warehouse AND domain_id=p_domain AND stock_item_id=(line->>'stock_item_id')::uuid;
  result:=result||jsonb_build_array(line||jsonb_build_object('available',available,'missing',greatest(0,(line->>'quantity')::numeric-available)));
 END LOOP;
 RETURN jsonb_build_object('liters',p_liters,'warehouse_id',p_warehouse,'calculated_at',clock_timestamp(),'lines',result);
END $$;

CREATE FUNCTION public.fertigation_workspace(p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT irrigation_access(p_domain,NULL) THEN RAISE EXCEPTION 'Accès agronomie requis'; END IF;
 RETURN jsonb_build_object(
 'farms',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'can_prepare',irrigation_access(p_domain,id,'fertigation.recipe')) ORDER BY name) FROM farms WHERE domain_id=p_domain AND is_active),'[]'),
 'warehouses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'farm_id',w.farm_id) ORDER BY w.name) FROM warehouses w JOIN farms f ON f.id=w.farm_id AND f.domain_id=w.domain_id AND f.is_active WHERE w.domain_id=p_domain AND w.is_active),'[]'),
 'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'unit',unit) ORDER BY name) FROM stock_items WHERE domain_id=p_domain AND is_active AND category::text='engrais' AND plant_protection_product_id IS NULL),'[]'),
 'recipes',coalesce((SELECT jsonb_agg(to_jsonb(r)-'input' ORDER BY r.created_at DESC) FROM fertigation_recipes r JOIN farms f ON f.id=r.farm_id AND f.domain_id=r.domain_id AND f.is_active WHERE r.domain_id=p_domain),'[]')
 );
END $$;
REVOKE ALL ON FUNCTION public.fertigation_lines(uuid,numeric,jsonb),public.save_fertigation_recipe(uuid,jsonb),public.preview_fertigation_recipe(uuid,uuid,uuid,numeric,jsonb),public.fertigation_workspace(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_fertigation_recipe(uuid,jsonb),public.preview_fertigation_recipe(uuid,uuid,uuid,numeric,jsonb),public.fertigation_workspace(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
