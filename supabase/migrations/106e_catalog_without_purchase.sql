-- Correctif 106C : création catalogue sans achat ni affectation d'entrepôt.
BEGIN;
CREATE OR REPLACE FUNCTION public.prepare_positive_list_stock(p_list UUID,p_rows JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d UUID; r JSONB; p plant_protection_products%ROWTYPE; item UUID; item_unit TEXT; supplier UUID; cost NUMERIC; n INTEGER:=0; linked INTEGER:=0;
BEGIN
 SELECT domain_id INTO d FROM phyto_positive_lists WHERE id=p_list;
 IF d IS NULL OR NOT COALESCE(has_domain_permission(d,auth.uid(),'stocks','create'),FALSE)
 THEN RAISE EXCEPTION 'Création de stock non autorisée pour ce client'; END IF;
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)=0 OR jsonb_array_length(p_rows)>500
 THEN RAISE EXCEPTION 'Sélectionner entre 1 et 500 produits'; END IF;
 FOR r IN SELECT DISTINCT ON(value->>'product_id') value FROM jsonb_array_elements(p_rows) ORDER BY value->>'product_id' LOOP
  SELECT * INTO p FROM plant_protection_products WHERE id=(r->>'product_id')::UUID AND domain_id=d AND is_active FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM phyto_positive_list_entries WHERE list_id=p_list AND domain_id=d AND product_id=p.id AND review_status='valide' AND station_approved)
  THEN RAISE EXCEPTION 'Produit absent des lignes validées de cette liste'; END IF;
  supplier:=NULLIF(btrim(r->>'supplier_id'),'')::UUID;
  IF supplier IS NOT NULL AND NOT EXISTS(SELECT 1 FROM suppliers WHERE id=supplier AND domain_id=d AND is_active)
  THEN RAISE EXCEPTION '% : fournisseur hors client ou inactif',p.commercial_name; END IF;
  cost:=NULLIF(btrim(r->>'unit_cost'),'')::NUMERIC;
  IF NULLIF(btrim(r->>'unit'),'') IS NULL OR cost<0 OR cost::TEXT IN ('NaN','Infinity','-Infinity')
  THEN RAISE EXCEPTION '% : unité ou prix invalide',p.commercial_name; END IF;
  SELECT id,unit INTO item,item_unit FROM stock_items WHERE domain_id=d AND plant_protection_product_id=p.id AND is_active;
  IF item IS NULL THEN
   INSERT INTO stock_items(domain_id,code,name,category,unit,supplier_id,packaging,supplier_reference,source_positive_list_id,current_qty,min_qty,unit_cost,is_active)
   VALUES(d,'PHY-'||left(replace(p.id::TEXT,'-',''),24),p.commercial_name,'phytosanitaires',btrim(r->>'unit'),supplier,NULLIF(btrim(r->>'packaging'),''),NULLIF(btrim(r->>'supplier_reference'),''),p_list,0,0,cost,TRUE)
   RETURNING id INTO item;
   n:=n+1;
  ELSE
   IF lower(item_unit)<>lower(btrim(r->>'unit')) THEN RAISE EXCEPTION '% : conserver l’unité existante %',p.commercial_name,item_unit; END IF;
   linked:=linked+1;
  END IF;
  -- Aucune écriture dans warehouse_stocks ni stock_movements.
  -- Les affectations et quantités existantes sont conservées.
 END LOOP;
 RETURN jsonb_build_object('created',n,'existing',linked);
END $$;
REVOKE ALL ON FUNCTION public.prepare_positive_list_stock(UUID,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_positive_list_stock(UUID,JSONB) TO authenticated;
COMMIT;
