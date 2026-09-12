-- Valorisation CUMP par article/entrepôt ; imputation à la consommation.
BEGIN;
LOCK TABLE public.stock_items,public.stock_movements,public.warehouse_stocks IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE public.warehouse_stocks ADD COLUMN inventory_value NUMERIC(20,6), ADD COLUMN valuation_verified BOOLEAN NOT NULL DEFAULT false;
UPDATE public.warehouse_stocks w SET inventory_value=CASE WHEN w.current_qty=0 THEN 0 WHEN s.unit_cost>0 THEN w.current_qty*s.unit_cost END,
 valuation_verified=(w.current_qty=0) FROM public.stock_items s WHERE s.id=w.stock_item_id;
ALTER TABLE public.stock_movements ADD COLUMN valuation_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.treatment_applications ADD COLUMN actual_cost_areas JSONB;
ALTER TABLE public.cost_entries ADD COLUMN source_stock_movement_id UUID REFERENCES public.stock_movements(id),
 ADD COLUMN allocation_method TEXT, ADD COLUMN cost_quality TEXT;
CREATE UNIQUE INDEX uq_consumption_cost_serre ON public.cost_entries(source_stock_movement_id,campaign_id,greenhouse_id,variety_id) WHERE source_stock_movement_id IS NOT NULL;
CREATE TABLE public.inventory_consumption_reviews(
 movement_id UUID PRIMARY KEY REFERENCES public.stock_movements(id),domain_id UUID NOT NULL REFERENCES public.domains(id),
 campaign_planting_id UUID REFERENCES public.campaign_plantings(id),unit_cost NUMERIC NOT NULL CHECK(unit_cost>=0),reason TEXT NOT NULL,
 created_by UUID NOT NULL DEFAULT auth.uid(),created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_consumption_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY consumption_review_read ON public.inventory_consumption_reviews FOR SELECT TO authenticated USING(has_domain_permission(domain_id,auth.uid(),'couts','view'));
GRANT SELECT ON public.inventory_consumption_reviews TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.inventory_consumption_reviews FROM authenticated;
CREATE TABLE public.inventory_value_events(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),domain_id UUID NOT NULL REFERENCES public.domains(id),
 warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),stock_item_id UUID NOT NULL REFERENCES public.stock_items(id),
 movement_id UUID UNIQUE REFERENCES public.stock_movements(id),event_kind TEXT NOT NULL,
 quantity_after NUMERIC NOT NULL,value_after NUMERIC,verified BOOLEAN NOT NULL,
 reason TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),created_by UUID DEFAULT auth.uid()
);
INSERT INTO public.inventory_value_events(domain_id,warehouse_id,stock_item_id,event_kind,quantity_after,value_after,verified,reason)
SELECT domain_id,warehouse_id,stock_item_id,'opening',current_qty,inventory_value,valuation_verified,'Reprise du solde ; prix historique à confirmer' FROM public.warehouse_stocks;
ALTER TABLE public.inventory_value_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_events_read ON public.inventory_value_events FOR SELECT TO authenticated USING(public.has_domain_permission(domain_id,auth.uid(),'stocks','view') OR public.has_domain_permission(domain_id,auth.uid(),'couts','view'));
REVOKE ALL ON public.inventory_value_events FROM anon,authenticated;
GRANT SELECT ON public.inventory_value_events TO authenticated;

CREATE OR REPLACE FUNCTION public.post_warehouse_movement() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d UUID; delta NUMERIC; q NUMERIC; v NUMERIC; verified BOOLEAN; price NUMERIC; total NUMERIC; t stock_transfers%ROWTYPE;
BEGIN
 SELECT domain_id INTO d FROM stock_items WHERE id=NEW.stock_item_id FOR UPDATE;
 IF NEW.warehouse_id IS NULL THEN SELECT id INTO NEW.warehouse_id FROM warehouses WHERE domain_id=d AND is_default AND is_active; END IF;
 IF NOT EXISTS(SELECT 1 FROM warehouses WHERE id=NEW.warehouse_id AND domain_id=d AND is_active) THEN RAISE EXCEPTION 'Entrepôt actif du même client obligatoire'; END IF;
 IF NEW.quantity IS NULL OR NEW.quantity<=0 OR NEW.quantity::text IN ('NaN','Infinity','-Infinity') OR NEW.movement_type NOT IN ('entree','sortie','ajustement') THEN RAISE EXCEPTION 'Quantité positive et sens de mouvement requis'; END IF;
 NEW.domain_id:=d; NEW.created_by:=auth.uid();
 INSERT INTO warehouse_stocks(warehouse_id,stock_item_id,domain_id,inventory_value,valuation_verified) VALUES(NEW.warehouse_id,NEW.stock_item_id,d,0,true) ON CONFLICT DO NOTHING;
 SELECT current_qty,inventory_value,valuation_verified INTO q,v,verified FROM warehouse_stocks WHERE warehouse_id=NEW.warehouse_id AND stock_item_id=NEW.stock_item_id FOR UPDATE;
 delta:=CASE WHEN NEW.movement_type='sortie' THEN -NEW.quantity ELSE NEW.quantity END;
 IF q+delta<0 THEN RAISE EXCEPTION 'Stock insuffisant dans l’entrepôt'; END IF;
 IF NEW.movement_type='sortie' THEN
  price:=CASE WHEN q>0 THEN v/q END;
  total:=CASE WHEN NEW.quantity=q THEN v ELSE round(NEW.quantity*price,6) END;
  NEW.valuation_verified:=verified AND price IS NOT NULL;
 ELSE
  price:=NEW.unit_cost;
  IF NEW.transfer_id IS NOT NULL THEN
   SELECT * INTO t FROM stock_transfers WHERE id=NEW.transfer_id;
   SELECT m.unit_cost,m.total_cost,m.valuation_verified INTO price,total,NEW.valuation_verified FROM stock_movements m WHERE m.transfer_id=t.id AND m.movement_type='sortie';
   IF NOT FOUND THEN RAISE EXCEPTION 'Expédition du transfert introuvable'; END IF;
  ELSE
   IF price IS NOT NULL AND (price<0 OR price::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Coût unitaire invalide'; END IF;
   total:=round(price*NEW.quantity,6); NEW.valuation_verified:=price IS NOT NULL;
  END IF;
 END IF;
 NEW.unit_cost:=price; NEW.total_cost:=total;
 UPDATE warehouse_stocks SET current_qty=q+delta,
  inventory_value=CASE WHEN q+delta=0 THEN 0 WHEN delta<0 THEN v-total ELSE v+total END,
  valuation_verified=CASE WHEN q+delta=0 THEN true WHEN delta<0 THEN verified ELSE verified AND NEW.valuation_verified END,updated_at=now()
 WHERE warehouse_id=NEW.warehouse_id AND stock_item_id=NEW.stock_item_id;
 -- Ne pas réécrire le prix des anciennes sorties. Le CUMP réel est conservé par entrepôt.
 UPDATE stock_items SET current_qty=current_qty,updated_at=now() WHERE id=NEW.stock_item_id;
 RETURN NEW;
END $$;
-- Précision monétaire interne, sans modifier les colonnes générées des articles.
ALTER TABLE public.stock_movements ALTER COLUMN unit_cost TYPE NUMERIC(20,8), ALTER COLUMN total_cost TYPE NUMERIC(20,6);

CREATE FUNCTION public.log_inventory_value() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO inventory_value_events(domain_id,warehouse_id,stock_item_id,movement_id,event_kind,quantity_after,value_after,verified,reason)
 SELECT NEW.domain_id,NEW.warehouse_id,NEW.stock_item_id,NEW.id,
 CASE WHEN NEW.transfer_id IS NOT NULL THEN 'transfer' ELSE NEW.movement_type::text END,current_qty,inventory_value,valuation_verified,NEW.notes
 FROM warehouse_stocks WHERE warehouse_id=NEW.warehouse_id AND stock_item_id=NEW.stock_item_id;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_inventory_value_event AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.log_inventory_value();

CREATE FUNCTION public.confirm_inventory_value(p_warehouse UUID,p_item UUID,p_expected_qty NUMERIC,p_unit_cost NUMERIC,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w warehouse_stocks%ROWTYPE;
BEGIN
 PERFORM 1 FROM stock_items WHERE id=p_item FOR UPDATE;
 SELECT * INTO w FROM warehouse_stocks WHERE warehouse_id=p_warehouse AND stock_item_id=p_item FOR UPDATE;
 IF NOT FOUND OR NOT public.has_domain_permission(w.domain_id,auth.uid(),'couts','edit') THEN RAISE EXCEPTION 'Droit de modification des coûts requis'; END IF;
 IF p_expected_qty IS DISTINCT FROM w.current_qty THEN RAISE EXCEPTION 'Le stock a changé : actualisez avant de valoriser'; END IF;
 IF p_unit_cost IS NULL OR p_unit_cost<0 OR p_unit_cost::text IN ('NaN','Infinity','-Infinity') OR length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Prix positif ou nul et justificatif requis'; END IF;
 UPDATE warehouse_stocks SET inventory_value=round(current_qty*p_unit_cost,6),valuation_verified=true WHERE warehouse_id=p_warehouse AND stock_item_id=p_item;
 UPDATE stock_items SET current_qty=current_qty WHERE id=p_item;
 INSERT INTO inventory_value_events(domain_id,warehouse_id,stock_item_id,event_kind,quantity_after,value_after,verified,reason)
 VALUES(w.domain_id,p_warehouse,p_item,'valuation_correction',w.current_qty,round(w.current_qty*p_unit_cost,6),true,p_reason);
END $$;
REVOKE ALL ON FUNCTION public.confirm_inventory_value(UUID,UUID,NUMERIC,NUMERIC,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_inventory_value(UUID,UUID,NUMERIC,NUMERIC,TEXT) TO authenticated;

-- Sauvegarde des anciens coûts générés avant retrait de l'achat stocké des charges analytiques.
CREATE TABLE public.inventory_cost_migration_archive AS SELECT id,domain_id,to_jsonb(c) AS original_row,now() AS archived_at FROM public.cost_entries c WHERE source_po_id IS NOT NULL;
ALTER TABLE public.inventory_cost_migration_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY costing_archive_read ON public.inventory_cost_migration_archive FOR SELECT TO authenticated USING(public.has_domain_permission(domain_id,auth.uid(),'couts','view'));
REVOKE ALL ON public.inventory_cost_migration_archive FROM anon,authenticated;
GRANT SELECT ON public.inventory_cost_migration_archive TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_po_to_cost_entries(p_po_id UUID) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p purchase_orders%ROWTYPE; amount_received NUMERIC; cat UUID;
BEGIN
 SELECT * INTO p FROM purchase_orders WHERE id=p_po_id;
 IF NOT FOUND THEN RETURN 0; END IF;
 IF p.campaign_id IS NULL THEN
  SELECT campaign_id INTO p.campaign_id FROM cost_entries WHERE source_po_id=p_po_id ORDER BY entry_date LIMIT 1;
 END IF;
 DELETE FROM cost_entries WHERE source_po_id=p_po_id;
 IF p.status NOT IN ('partiellement_recu','recu','facture') OR p.campaign_id IS NULL THEN RETURN 0; END IF;
 -- Un article lié est stocké. Les intrants non liés restent à rapprocher, jamais passés implicitement en consommation.
 SELECT sum(received_qty*unit_price) INTO amount_received FROM purchase_order_lines
 WHERE po_id=p.id AND stock_item_id IS NULL AND lower(coalesce(p.cost_category,'')) IN ('services','transport','energie');
 IF coalesce(amount_received,0)<=0 THEN RETURN 0; END IF;
 SELECT id INTO cat FROM account_categories WHERE code=map_purchase_cat_to_account_code(p.cost_category) LIMIT 1;
 INSERT INTO cost_entries(campaign_id,greenhouse_id,account_category_id,cost_category,amount,entry_date,description,is_planned,source_po_id)
 VALUES(p.campaign_id,p.greenhouse_id,cat,lower(p.cost_category),amount_received,p.order_date,'Achat non stocké '||p.po_number,false,p.id);
 RETURN 1;
END $$;
REVOKE ALL ON FUNCTION public.sync_po_to_cost_entries(UUID) FROM PUBLIC,authenticated;
ALTER FUNCTION public.trg_po_sync_cost() SECURITY DEFINER;
ALTER FUNCTION public.trg_po_sync_cost() SET search_path=public;
ALTER FUNCTION public.trg_pol_sync_cost() SECURITY DEFINER;
ALTER FUNCTION public.trg_pol_sync_cost() SET search_path=public;

CREATE FUNCTION public.post_consumption_cost(p_movement UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m stock_movements%ROWTYPE; category TEXT; cat UUID; target RECORD; total_area NUMERIC; allocated NUMERIC:=0; part NUMERIC; n INTEGER:=0; cnt INTEGER; tr UUID; areas JSONB; review inventory_consumption_reviews%ROWTYPE;
BEGIN
 SELECT * INTO m FROM stock_movements WHERE id=p_movement;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO review FROM inventory_consumption_reviews WHERE movement_id=m.id;
 IF FOUND THEN
  m.unit_cost:=review.unit_cost; m.total_cost:=review.unit_cost*m.quantity; m.valuation_verified:=true;
  IF review.campaign_planting_id IS NOT NULL THEN SELECT campaign_id,greenhouse_id INTO m.campaign_id,m.greenhouse_id FROM campaign_plantings WHERE id=review.campaign_planting_id; END IF;
 END IF;
 IF m.movement_type<>'sortie' OR m.transfer_id IS NOT NULL OR m.total_cost IS NULL
    OR EXISTS(SELECT 1 FROM cost_entries WHERE source_stock_movement_id=m.id) THEN RETURN; END IF;
 SELECT s.category::text INTO category FROM stock_items s WHERE s.id=m.stock_item_id;
 SELECT id INTO cat FROM account_categories WHERE code=map_purchase_cat_to_account_code(category) LIMIT 1;
 SELECT a.treatment_request_id,a.actual_cost_areas INTO tr,areas FROM treatment_application_products ap JOIN treatment_applications a ON a.id=ap.application_id WHERE ap.stock_movement_id=m.id;
 IF tr IS NOT NULL THEN
  SELECT sum(coalesce((areas->>cp.id::text)::numeric,t.treated_area_m2,cp.planted_area)),count(*) INTO total_area,cnt FROM treatment_request_targets t JOIN campaign_plantings cp ON cp.id=t.campaign_planting_id WHERE t.treatment_request_id=tr AND coalesce((areas->>cp.id::text)::numeric,t.treated_area_m2,cp.planted_area)>0;
  IF coalesce(total_area,0)<=0 THEN RAISE EXCEPTION 'Surfaces des serres requises pour imputer le traitement'; END IF;
  FOR target IN SELECT cp.*,coalesce((areas->>cp.id::text)::numeric,t.treated_area_m2,cp.planted_area) AS weight FROM treatment_request_targets t JOIN campaign_plantings cp ON cp.id=t.campaign_planting_id WHERE t.treatment_request_id=tr AND coalesce((areas->>cp.id::text)::numeric,t.treated_area_m2,cp.planted_area)>0 ORDER BY cp.id LOOP
   n:=n+1; part:=CASE WHEN n=cnt THEN round(m.total_cost,2)-allocated ELSE round(m.total_cost*target.weight/total_area,2) END; allocated:=allocated+part;
   INSERT INTO cost_entries(domain_id,campaign_id,greenhouse_id,variety_id,account_category_id,cost_category,amount,entry_date,description,is_planned,source_stock_movement_id,allocation_method,cost_quality)
   VALUES(m.domain_id,target.campaign_id,target.greenhouse_id,target.variety_id,cat,category,part,m.movement_date,'Consommation traitement '||coalesce(m.reference,''),false,m.id,CASE WHEN areas IS NULL THEN 'surface_prescrite_estimee' ELSE 'surface_reelle_confirmee' END,CASE WHEN m.valuation_verified AND areas IS NOT NULL THEN 'verified' ELSE 'provisional' END);
  END LOOP;
 ELSIF m.campaign_id IS NOT NULL AND m.greenhouse_id IS NOT NULL THEN
  INSERT INTO cost_entries(domain_id,campaign_id,greenhouse_id,variety_id,account_category_id,cost_category,amount,entry_date,description,is_planned,source_stock_movement_id,allocation_method,cost_quality)
  VALUES(m.domain_id,m.campaign_id,m.greenhouse_id,(SELECT variety_id FROM campaign_plantings WHERE id=review.campaign_planting_id),cat,category,round(m.total_cost,2),m.movement_date,'Consommation stock '||coalesce(m.reference,''),false,m.id,'direct',CASE WHEN m.valuation_verified THEN 'verified' ELSE 'provisional' END);
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.post_consumption_cost(UUID) FROM PUBLIC,authenticated;
CREATE FUNCTION public.trigger_consumption_cost() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='stock_movements' THEN PERFORM post_consumption_cost(NEW.id);
 ELSIF TG_TABLE_NAME='inventory_consumption_reviews' THEN PERFORM post_consumption_cost(NEW.movement_id);
 ELSE PERFORM post_consumption_cost(NEW.stock_movement_id); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_consumption_cost AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.trigger_consumption_cost();
CREATE TRIGGER trg_treatment_consumption_cost AFTER INSERT ON public.treatment_application_products FOR EACH ROW EXECUTE FUNCTION public.trigger_consumption_cost();
CREATE TRIGGER trg_review_consumption_cost AFTER INSERT ON public.inventory_consumption_reviews FOR EACH ROW EXECUTE FUNCTION public.trigger_consumption_cost();
DO $$ DECLARE r RECORD; BEGIN
 FOR r IN SELECT id FROM purchase_orders LOOP PERFORM sync_po_to_cost_entries(r.id); END LOOP;
 FOR r IN SELECT id FROM stock_movements WHERE movement_type='sortie' AND total_cost>0 AND transfer_id IS NULL LOOP PERFORM post_consumption_cost(r.id); END LOOP;
END $$;
-- Coûts issus du stock : ne peuvent pas être modifiés par un formulaire de saisie manuelle.
CREATE FUNCTION public.guard_generated_consumption_cost() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') AND OLD.source_stock_movement_id IS NOT NULL THEN RAISE EXCEPTION 'Coût généré par un mouvement de stock : correction via mouvement dédié'; END IF;
 IF TG_OP IN ('INSERT','UPDATE') AND NEW.source_stock_movement_id IS NOT NULL AND pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Imputation automatique uniquement'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER trg_guard_generated_consumption_cost BEFORE INSERT OR UPDATE OR DELETE ON public.cost_entries FOR EACH ROW EXECUTE FUNCTION public.guard_generated_consumption_cost();
-- Reprise analytique : prix enregistrés uniquement ; détails conservés dans l'archive.
NOTIFY pgrst,'reload schema';
COMMIT;
