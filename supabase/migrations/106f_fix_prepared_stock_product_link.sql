-- 106F : enregistrer le lien catalogue phyto et réparer les articles générés sans lien.
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
   INSERT INTO stock_items(domain_id,plant_protection_product_id,code,name,category,unit,supplier_id,packaging,supplier_reference,source_positive_list_id,current_qty,min_qty,unit_cost,is_active)
   VALUES(d,p.id,'PHY-'||left(replace(p.id::TEXT,'-',''),24),p.commercial_name,'phytosanitaires',btrim(r->>'unit'),supplier,NULLIF(btrim(r->>'packaging'),''),NULLIF(btrim(r->>'supplier_reference'),''),p_list,0,0,cost,TRUE)
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
-- Réparation limitée aux codes générés par la préparation, avec liste source validée.
-- Ne jamais rapprocher sur le seul nom commercial ni remplacer un lien existant.
UPDATE public.stock_items s SET plant_protection_product_id=p.id
FROM public.plant_protection_products p
WHERE s.plant_protection_product_id IS NULL AND s.is_active
 AND s.domain_id=p.domain_id AND p.is_active AND s.category='phytosanitaires'
 AND s.code='PHY-'||left(replace(p.id::TEXT,'-',''),24)
 AND EXISTS(SELECT 1 FROM public.phyto_positive_list_entries e
   WHERE e.list_id=s.source_positive_list_id AND e.domain_id=s.domain_id
   AND e.product_id=p.id AND e.review_status='valide' AND e.station_approved)
 AND NOT EXISTS (
   SELECT 1
   FROM public.stock_items AS linked_stock
   WHERE linked_stock.domain_id = s.domain_id
     AND linked_stock.plant_protection_product_id = p.id
     AND linked_stock.is_active
 )
 -- Même condition que le garde-fou : les incompatibles restent non liés.
 AND EXISTS(SELECT 1 FROM public.product_authorized_uses u
   WHERE u.product_id=p.id AND u.domain_id=s.domain_id
   AND public.phyto_stock_unit_compatible(s.unit,u.dose_unit)
   AND (u.is_active OR EXISTS(SELECT 1 FROM public.phyto_positive_list_entries e
     WHERE e.product_id=p.id AND e.domain_id=s.domain_id
     AND e.review_status='valide' AND e.station_approved AND e.authorized_use_id=u.id)));
COMMIT;

-- Rapport des articles générés restant à régulariser : aucune modification.
SELECT s.id AS stock_item_id,s.domain_id,p.commercial_name,s.unit AS unite_stock,
 ARRAY(SELECT DISTINCT u.dose_unit FROM public.product_authorized_uses u
       WHERE u.product_id=p.id AND u.domain_id=s.domain_id) AS unites_dose_connues,
 'Lien non établi : contrôler unité, usage et éventuel article déjà lié' AS action_requise
FROM public.stock_items s JOIN public.plant_protection_products p
 ON p.domain_id=s.domain_id AND s.code='PHY-'||left(replace(p.id::TEXT,'-',''),24)
WHERE s.plant_protection_product_id IS NULL AND s.is_active
 AND s.category='phytosanitaires' AND s.source_positive_list_id IS NOT NULL
ORDER BY p.commercial_name;
