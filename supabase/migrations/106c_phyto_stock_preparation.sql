-- 106C : après 106A et 106B. Création atomique des articles validés Station.
BEGIN;
ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS packaging TEXT,
 ADD COLUMN IF NOT EXISTS supplier_reference TEXT,
 ADD COLUMN IF NOT EXISTS source_positive_list_id UUID REFERENCES public.phyto_positive_lists(id);

-- Préparer le stock n'accorde aucune autorisation agronomique.
-- Une unité doit être compatible avec un usage connu, même provisoire.
CREATE OR REPLACE FUNCTION public.guard_stock_phyto_product()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p plant_protection_products%ROWTYPE;
BEGIN
 IF NEW.plant_protection_product_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO p FROM plant_protection_products WHERE id=NEW.plant_protection_product_id FOR UPDATE;
 IF NOT FOUND OR p.domain_id IS DISTINCT FROM NEW.domain_id OR NOT p.is_active OR NEW.category<>'phytosanitaires'
 THEN RAISE EXCEPTION 'Produit phytosanitaire hors client, inactif ou catégorie incompatible'; END IF;
 IF NOT EXISTS(SELECT 1 FROM product_authorized_uses u WHERE u.product_id=p.id AND u.domain_id=NEW.domain_id
   AND phyto_stock_unit_compatible(NEW.unit,u.dose_unit)
   AND (u.is_active OR EXISTS(SELECT 1 FROM phyto_positive_list_entries e WHERE e.product_id=p.id AND e.domain_id=NEW.domain_id AND e.review_status='valide' AND e.station_approved AND e.authorized_use_id=u.id)))
 THEN RAISE EXCEPTION '% : unité incompatible ou usage à compléter avant liaison au stock',p.commercial_name; END IF;
 IF EXISTS(SELECT 1 FROM stock_items s WHERE s.domain_id=NEW.domain_id AND s.plant_protection_product_id=p.id AND s.id IS DISTINCT FROM NEW.id AND s.is_active)
 THEN RAISE EXCEPTION 'Ce produit possède déjà un article actif'; END IF;
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_stock_phyto_product ON public.stock_items;
CREATE TRIGGER trg_guard_stock_phyto_product BEFORE INSERT OR UPDATE OF plant_protection_product_id,domain_id,category,unit
ON public.stock_items FOR EACH ROW EXECUTE FUNCTION public.guard_stock_phyto_product();

CREATE OR REPLACE FUNCTION public.prepare_positive_list_stock(p_list UUID,p_rows JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d UUID; r JSONB; p plant_protection_products%ROWTYPE; item UUID; item_unit TEXT; n INTEGER:=0; linked INTEGER:=0;
BEGIN
 SELECT domain_id INTO d FROM phyto_positive_lists WHERE id=p_list;
 IF d IS NULL OR NOT COALESCE(has_domain_permission(d,auth.uid(),'stocks','create'),FALSE)
 THEN RAISE EXCEPTION 'Création de stock non autorisée pour ce client'; END IF;
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)=0 OR jsonb_array_length(p_rows)>500
 THEN RAISE EXCEPTION 'Sélectionner entre 1 et 500 produits'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) ORDER BY value->>'product_id' LOOP
  SELECT * INTO p FROM plant_protection_products WHERE id=(r->>'product_id')::UUID AND domain_id=d AND is_active FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM phyto_positive_list_entries WHERE list_id=p_list AND domain_id=d AND product_id=p.id AND review_status='valide' AND station_approved)
  THEN RAISE EXCEPTION 'Produit absent des lignes validées de cette liste'; END IF;
  IF NOT EXISTS(SELECT 1 FROM warehouses WHERE id=(r->>'warehouse_id')::UUID AND domain_id=d AND is_active)
  THEN RAISE EXCEPTION '% : entrepôt du client obligatoire',p.commercial_name; END IF;
  IF NOT EXISTS(SELECT 1 FROM suppliers WHERE id=(r->>'supplier_id')::UUID AND domain_id=d AND is_active)
  THEN RAISE EXCEPTION '% : fournisseur du client obligatoire',p.commercial_name; END IF;
  IF NULLIF(btrim(r->>'unit'),'') IS NULL OR NULLIF(btrim(r->>'packaging'),'') IS NULL
     OR COALESCE((r->>'min_qty')::NUMERIC,-1)<0 OR COALESCE((r->>'unit_cost')::NUMERIC,0)<0
  THEN RAISE EXCEPTION '% : unité, conditionnement, seuil ou prix invalide',p.commercial_name; END IF;
  SELECT id,unit INTO item,item_unit FROM stock_items WHERE domain_id=d AND plant_protection_product_id=p.id AND is_active;
  IF item IS NULL THEN
   INSERT INTO stock_items(domain_id,code,name,category,unit,supplier_id,packaging,supplier_reference,source_positive_list_id,current_qty,min_qty,unit_cost,is_active)
   VALUES(d,'PHY-'||left(replace(p.id::TEXT,'-',''),24),p.commercial_name,'phytosanitaires',r->>'unit',(r->>'supplier_id')::UUID,r->>'packaging',NULLIF(r->>'supplier_reference',''),p_list,0,0,NULLIF(r->>'unit_cost','')::NUMERIC,TRUE)
   RETURNING id INTO item;
   n:=n+1;
  ELSE
   IF lower(item_unit)<>lower(r->>'unit') THEN RAISE EXCEPTION '% : conserver l’unité existante %',p.commercial_name,item_unit; END IF;
   linked:=linked+1;
  END IF;
  INSERT INTO warehouse_stocks(domain_id,warehouse_id,stock_item_id,current_qty,min_qty)
  VALUES(d,(r->>'warehouse_id')::UUID,item,0,(r->>'min_qty')::NUMERIC)
  ON CONFLICT(warehouse_id,stock_item_id) DO NOTHING;
 END LOOP;
 RETURN jsonb_build_object('created',n,'existing',linked);
END $$;
REVOKE ALL ON FUNCTION public.prepare_positive_list_stock(UUID,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_positive_list_stock(UUID,JSONB) TO authenticated;
COMMIT;
