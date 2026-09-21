-- Confirmation analytique historique. Ne modifie ni stock, ni CUMP, ni application agronomique.
-- À appliquer manuellement après revue sur la base partagée. Requiert 115 et 118.
BEGIN;
CREATE TABLE public.historical_cost_confirmations (
 id uuid PRIMARY KEY, domain_id uuid NOT NULL REFERENCES public.domains(id),
 movement_id uuid NOT NULL REFERENCES public.stock_movements(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now(),
 transaction_id bigint NOT NULL DEFAULT txid_current(), input jsonb NOT NULL,
 before_lines jsonb NOT NULL, after_lines jsonb, applied_at timestamptz
);
ALTER TABLE public.historical_cost_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.historical_cost_confirmations FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.historical_cost_context(p_movement uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m stock_movements%ROWTYPE; lines jsonb; snapshot jsonb; needs_area boolean;
BEGIN
 SELECT * INTO m FROM stock_movements WHERE id=p_movement;
 IF NOT FOUND OR NOT coalesce(is_domain_member(m.domain_id,auth.uid()),false)
 OR NOT coalesce(has_domain_permission(m.domain_id,auth.uid(),'couts','edit'),false)
 OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active) THEN RAISE EXCEPTION 'Confirmation non autorisée'; END IF;
 IF m.movement_type<>'sortie' OR m.transfer_id IS NOT NULL OR m.quantity<=0 THEN RAISE EXCEPTION 'Consommation de stock requise'; END IF;
 SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) INTO snapshot FROM cost_entries c WHERE c.source_stock_movement_id=m.id;
 IF snapshot IS NULL OR NOT EXISTS(SELECT 1 FROM cost_entries WHERE source_stock_movement_id=m.id AND cost_quality='provisional' AND NOT is_planned)
 THEN RAISE EXCEPTION 'Aucun coût provisoire à confirmer. Actualisez le rapport.'; END IF;
 IF EXISTS(SELECT 1 FROM cost_entries WHERE source_stock_movement_id=m.id AND (domain_id IS DISTINCT FROM m.domain_id OR is_planned OR greenhouse_id IS NULL))
 THEN RAISE EXCEPTION 'Affectation historique incohérente : revue manuelle nécessaire'; END IF;
 SELECT EXISTS(SELECT 1 FROM treatment_application_products WHERE stock_movement_id=m.id)
 OR (SELECT count(*)>1 FROM cost_entries WHERE source_stock_movement_id=m.id) INTO needs_area;
 SELECT jsonb_agg(jsonb_build_object('id',c.id,'greenhouse',g.name,'variety',v.commercial_name,'amount',c.amount,
 'surface',CASE WHEN needs_area THEN (
   SELECT sum(coalesce((a.actual_cost_areas->>cp.id::text)::numeric,t.treated_area_m2,cp.planted_area))
   FROM treatment_application_products ap JOIN treatment_applications a ON a.id=ap.application_id
   JOIN treatment_request_targets t ON t.treatment_request_id=a.treatment_request_id
   JOIN campaign_plantings cp ON cp.id=t.campaign_planting_id
   WHERE ap.stock_movement_id=m.id AND cp.greenhouse_id=c.greenhouse_id
   AND cp.variety_id IS NOT DISTINCT FROM c.variety_id AND cp.campaign_id=c.campaign_id
 ) ELSE NULL END) ORDER BY c.id) INTO lines
 FROM cost_entries c LEFT JOIN greenhouses g ON g.id=c.greenhouse_id LEFT JOIN varieties v ON v.id=c.variety_id
 WHERE c.source_stock_movement_id=m.id;
 RETURN jsonb_build_object('movement_id',m.id,'reference',m.reference,'date',m.movement_date,
 'product',(SELECT name FROM stock_items WHERE id=m.stock_item_id),'quantity',m.quantity,
 'unit',(SELECT unit FROM stock_items WHERE id=m.stock_item_id),
 'unit_cost',(SELECT sum(amount)/m.quantity FROM cost_entries WHERE source_stock_movement_id=m.id),
 'needs_area',needs_area,'lines',lines,'version',md5(snapshot::text));
END $$;
REVOKE ALL ON FUNCTION public.historical_cost_context(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.historical_cost_context(uuid) TO authenticated;

-- L'exception à l'immutabilité est limitée au trigger de l'audit, dans sa transaction.
CREATE OR REPLACE FUNCTION public.guard_generated_consumption_cost() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') AND OLD.source_stock_movement_id IS NOT NULL THEN
  IF TG_OP='UPDATE' AND pg_trigger_depth()>=2 AND EXISTS (
   SELECT 1 FROM public.historical_cost_confirmations h
   WHERE h.id::text=current_setting('app.historical_cost_confirmation',true)
   AND h.movement_id=OLD.source_stock_movement_id AND h.domain_id=OLD.domain_id
   AND h.actor_id=auth.uid() AND h.transaction_id=txid_current() AND h.applied_at IS NULL
  ) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Coût généré par un mouvement de stock : correction via confirmation historique dédiée';
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') AND NEW.source_stock_movement_id IS NOT NULL AND pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Imputation automatique uniquement'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE FUNCTION public.apply_historical_cost_confirmation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c record; total numeric; weight numeric; weight_sum numeric; part numeric; allocated numeric:=0;
 n integer:=0; cnt integer; previous text:=current_setting('app.historical_cost_confirmation',true);
BEGIN
 SELECT round(quantity*(NEW.input->>'unit_cost')::numeric,2) INTO total FROM stock_movements WHERE id=NEW.movement_id;
 SELECT count(*) INTO cnt FROM cost_entries WHERE source_stock_movement_id=NEW.movement_id;
 SELECT sum(value::numeric) INTO weight_sum FROM jsonb_each_text(NEW.input->'weights');
 PERFORM set_config('app.historical_cost_confirmation',NEW.id::text,true);
 FOR c IN SELECT * FROM cost_entries WHERE source_stock_movement_id=NEW.movement_id ORDER BY id LOOP
  n:=n+1; weight:=(NEW.input->'weights'->>c.id::text)::numeric;
  part:=CASE WHEN n=cnt THEN total-allocated ELSE least(total-allocated,round(total*weight/weight_sum,2)) END;
  allocated:=allocated+part;
  UPDATE cost_entries SET amount=part,cost_quality='verified',allocation_method='historique_confirme'
  WHERE id=c.id;
 END LOOP;
 UPDATE historical_cost_confirmations SET after_lines=(SELECT jsonb_agg(to_jsonb(ce) ORDER BY ce.id) FROM cost_entries ce WHERE source_stock_movement_id=NEW.movement_id),applied_at=now() WHERE id=NEW.id;
 PERFORM set_config('app.historical_cost_confirmation',coalesce(previous,''),true);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.apply_historical_cost_confirmation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER historical_cost_confirmation_apply AFTER INSERT ON public.historical_cost_confirmations
FOR EACH ROW EXECUTE FUNCTION public.apply_historical_cost_confirmation();

CREATE FUNCTION public.confirm_historical_consumption_cost(p_id uuid,p_movement uuid,p_version text,p_unit_cost numeric,p_surfaces jsonb,p_reason text) RETURNS void
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
REVOKE ALL ON FUNCTION public.confirm_historical_consumption_cost(uuid,uuid,text,numeric,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_historical_consumption_cost(uuid,uuid,text,numeric,jsonb,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
