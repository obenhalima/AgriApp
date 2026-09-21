-- Complément si 136 a déjà été appliquée : borne des surfaces historiques.
BEGIN;
CREATE OR REPLACE FUNCTION public.confirm_historical_consumption_cost(p_id uuid,p_movement uuid,p_version text,p_unit_cost numeric,p_surfaces jsonb,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ctx jsonb; m stock_movements%ROWTYPE; old historical_cost_confirmations%ROWTYPE; payload jsonb; weights jsonb:='{}';
 line jsonb; area numeric; max_area numeric; snapshot jsonb;
BEGIN
 IF p_id IS NULL THEN RAISE EXCEPTION 'Identifiant de confirmation requis'; END IF;
 SELECT * INTO m FROM stock_movements WHERE id=p_movement FOR UPDATE;
 IF NOT FOUND OR NOT coalesce(is_domain_member(m.domain_id,auth.uid()),false)
 OR NOT coalesce(has_domain_permission(m.domain_id,auth.uid(),'couts','edit'),false)
 OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active) THEN RAISE EXCEPTION 'Confirmation non autorisée'; END IF;
 payload:=jsonb_build_object('version',p_version,'unit_cost',p_unit_cost,'surfaces',p_surfaces,'reason',btrim(p_reason));
 SELECT * INTO old FROM historical_cost_confirmations WHERE id=p_id;
 IF FOUND THEN
  IF old.movement_id=p_movement AND old.actor_id=auth.uid() AND old.input-'weights'=payload AND old.applied_at IS NOT NULL THEN RETURN; END IF;
  RAISE EXCEPTION 'Identifiant déjà utilisé pour une autre confirmation';
 END IF;
 IF p_unit_cost IS NULL OR p_unit_cost<0 OR p_unit_cost>1000000000 OR p_unit_cost::text IN ('NaN','Infinity','-Infinity')
 OR length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Prix valide et justificatif de 5 caractères minimum requis'; END IF;
 PERFORM 1 FROM cost_entries WHERE source_stock_movement_id=m.id ORDER BY id FOR UPDATE;
 ctx:=historical_cost_context(m.id);
 IF p_version IS DISTINCT FROM ctx->>'version' THEN RAISE EXCEPTION 'Les coûts ont changé. Fermez puis actualisez avant de confirmer.'; END IF;
 IF (ctx->>'needs_area')::boolean AND (jsonb_typeof(p_surfaces) IS DISTINCT FROM 'object' OR
 (SELECT count(*) FROM jsonb_object_keys(p_surfaces))<>jsonb_array_length(ctx->'lines')) THEN RAISE EXCEPTION 'Confirmez les surfaces de toutes les affectations'; END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(ctx->'lines') LOOP
  area:=CASE WHEN (ctx->>'needs_area')::boolean THEN (p_surfaces->>(line->>'id'))::numeric ELSE 1 END;
  IF area IS NULL OR area<=0 OR area>1000000000 OR area::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Surface réelle positive requise pour chaque affectation'; END IF;
  IF (ctx->>'needs_area')::boolean THEN
   SELECT sum(cp.planted_area) INTO max_area FROM cost_entries c JOIN campaign_plantings cp
   ON cp.domain_id=c.domain_id AND cp.campaign_id=c.campaign_id AND cp.greenhouse_id=c.greenhouse_id
   AND (c.variety_id IS NULL OR cp.variety_id=c.variety_id) WHERE c.id=(line->>'id')::uuid;
   IF max_area IS NULL OR area>max_area THEN RAISE EXCEPTION 'La surface confirmée dépasse la surface plantée de cette affectation'; END IF;
  END IF;
  weights:=weights||jsonb_build_object(line->>'id',area);
 END LOOP;
 SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) INTO snapshot FROM cost_entries c WHERE source_stock_movement_id=m.id;
 INSERT INTO historical_cost_confirmations(id,domain_id,movement_id,actor_id,input,before_lines)
 VALUES(p_id,m.domain_id,m.id,auth.uid(),payload||jsonb_build_object('weights',weights),snapshot);
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;

