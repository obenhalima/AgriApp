-- 106G : unité automatique issue des doses, jamais du nom commercial.
BEGIN;
CREATE OR REPLACE FUNCTION public.phyto_unit_from_dose(p_dose TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE
 WHEN normalize_phyto_dose_unit(p_dose) IN ('ml_100l','ml_ha','l_ha','l_1000m2') THEN 'l'
 WHEN normalize_phyto_dose_unit(p_dose) IN ('g_100l','g_ha','kg_ha','kg_1000m2') THEN 'kg'
 WHEN normalize_phyto_dose_unit(p_dose)='unite_ha' THEN 'unite'
 ELSE (
  SELECT CASE WHEN count(DISTINCT family)=1 THEN min(family) END
  FROM (
   SELECT CASE WHEN lower(m[1]) IN ('kg','g') THEN 'kg'
     WHEN lower(m[1]) IN ('ml','cc','l') THEN 'l' ELSE 'unite' END AS family
   FROM regexp_matches(lower(COALESCE(p_dose,'')),
    '\m(kg|g|ml|cc|l|unite|unité|unités)\s*/\s*(ha|hl|100\s*l|1000\s*m[²2])\M','g') AS m
  ) matches
 ) END
$$;

-- Tests de déduction exécutés avant toute mise à jour d'article.
DO $unit_tests$
BEGIN
 IF public.phyto_unit_from_dose('kg_ha') IS DISTINCT FROM 'kg'
 OR public.phyto_unit_from_dose('0,5 kg/ha') IS DISTINCT FROM 'kg'
 OR public.phyto_unit_from_dose('100 ml/100 L') IS DISTINCT FROM 'l'
 OR public.phyto_unit_from_dose('2 L/ha') IS DISTINCT FROM 'l'
 OR public.phyto_unit_from_dose('500 unités/ha') IS DISTINCT FROM 'unite'
 OR public.phyto_unit_from_dose('') IS NOT NULL
 OR public.phyto_unit_from_dose('JACKPOT 50 g/l EC') IS NOT NULL
 OR public.phyto_unit_from_dose('1 kg/ha ou 1 l/ha') IS NOT NULL
 THEN RAISE EXCEPTION 'Échec des tests de déduction des unités : aucune réparation appliquée'; END IF;
END $unit_tests$;

CREATE OR REPLACE FUNCTION public.infer_phyto_stock_unit(p_product UUID,p_domain UUID,p_list UUID)
RETURNS TEXT LANGUAGE sql STABLE SET search_path=public AS $$
 WITH candidates AS (
  SELECT phyto_unit_from_dose(e.dose_text) AS unit
  FROM phyto_positive_list_entries e WHERE e.domain_id=p_domain AND e.product_id=p_product
   AND e.list_id=p_list AND e.review_status='valide' AND e.station_approved
  UNION ALL
  SELECT phyto_unit_from_dose(u.dose_unit)
  FROM product_authorized_uses u WHERE u.domain_id=p_domain AND u.product_id=p_product
   AND (u.is_active OR EXISTS(SELECT 1 FROM phyto_positive_list_entries e
    WHERE e.domain_id=p_domain AND e.list_id=p_list AND e.product_id=p_product
    AND e.authorized_use_id=u.id AND e.review_status='valide' AND e.station_approved))
 )
 SELECT CASE WHEN count(DISTINCT unit)=1 THEN min(unit) END FROM candidates
$$;

CREATE OR REPLACE FUNCTION public.get_positive_list_stock_units(p_list UUID)
RETURNS TABLE(product_id UUID,unit TEXT) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d UUID;
BEGIN
 SELECT domain_id INTO d FROM phyto_positive_lists WHERE id=p_list;
 IF d IS NULL OR NOT COALESCE(has_domain_permission(d,auth.uid(),'stocks','create'),FALSE)
 THEN RAISE EXCEPTION 'Préparation non autorisée pour ce client'; END IF;
 RETURN QUERY SELECT DISTINCT e.product_id,infer_phyto_stock_unit(e.product_id,d,p_list)
 FROM phyto_positive_list_entries e WHERE e.list_id=p_list AND e.domain_id=d
 AND e.review_status='valide' AND e.station_approved AND e.product_id IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.get_positive_list_stock_units(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_positive_list_stock_units(UUID) TO authenticated;

-- Autorise une liaison catalogue issue d'une dose explicite de la liste validée.
-- Ne modifie ni les usages autorisés ni leur vérification réglementaire.
CREATE OR REPLACE FUNCTION public.guard_stock_phyto_product()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p plant_protection_products%ROWTYPE; inferred TEXT;
BEGIN
 IF NEW.plant_protection_product_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO p FROM plant_protection_products WHERE id=NEW.plant_protection_product_id FOR UPDATE;
 IF NOT FOUND OR p.domain_id IS DISTINCT FROM NEW.domain_id OR NOT p.is_active OR NEW.category<>'phytosanitaires'
 THEN RAISE EXCEPTION 'Produit hors client, inactif ou catégorie incompatible'; END IF;
 inferred:=infer_phyto_stock_unit(p.id,NEW.domain_id,NEW.source_positive_list_id);
 IF NOT (
   inferred IS NOT NULL AND phyto_stock_unit_compatible(NEW.unit,inferred||'_ha')
 ) AND NOT EXISTS(SELECT 1 FROM product_authorized_uses u WHERE u.product_id=p.id AND u.domain_id=NEW.domain_id
   AND phyto_stock_unit_compatible(NEW.unit,u.dose_unit)
   AND (u.is_active OR EXISTS(SELECT 1 FROM phyto_positive_list_entries e WHERE e.product_id=p.id AND e.domain_id=NEW.domain_id AND e.review_status='valide' AND e.station_approved AND e.authorized_use_id=u.id)))
 THEN RAISE EXCEPTION '% : unité incompatible ou dose source absente',p.commercial_name; END IF;
 IF EXISTS(SELECT 1 FROM stock_items s WHERE s.domain_id=NEW.domain_id AND s.plant_protection_product_id=p.id AND s.id IS DISTINCT FROM NEW.id AND s.is_active)
 THEN RAISE EXCEPTION 'Ce produit possède déjà un article actif'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.prepare_positive_list_stock(p_list UUID,p_rows JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d UUID; r JSONB; p plant_protection_products%ROWTYPE; item UUID; item_unit TEXT; supplier UUID; cost NUMERIC; n INTEGER:=0; linked INTEGER:=0; inferred TEXT; existing_row stock_items%ROWTYPE;
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
  inferred:=infer_phyto_stock_unit(p.id,d,p_list);
  IF inferred IS NULL THEN RAISE EXCEPTION '% : unité de dose absente ou contradictoire dans les sources, compléter la liste avant préparation',p.commercial_name; END IF;
  supplier:=NULLIF(btrim(r->>'supplier_id'),'')::UUID;
  IF supplier IS NOT NULL AND NOT EXISTS(SELECT 1 FROM suppliers WHERE id=supplier AND domain_id=d AND is_active)
  THEN RAISE EXCEPTION '% : fournisseur hors client ou inactif',p.commercial_name; END IF;
  cost:=NULLIF(btrim(r->>'unit_cost'),'')::NUMERIC;
  IF cost<0 OR cost::TEXT IN ('NaN','Infinity','-Infinity')
  THEN RAISE EXCEPTION '% : unité ou prix invalide',p.commercial_name; END IF;
  SELECT id,unit INTO item,item_unit FROM stock_items WHERE domain_id=d AND plant_protection_product_id=p.id AND is_active;
  IF item IS NULL THEN
   -- Réutiliser aussi l'article ancien créé sans lien : pas de doublon.
   SELECT * INTO existing_row FROM stock_items WHERE domain_id=d AND is_active
    AND plant_protection_product_id IS NULL AND category='phytosanitaires'
    AND code='PHY-'||left(replace(p.id::TEXT,'-',''),24) FOR UPDATE;
   IF FOUND THEN
    IF NOT phyto_stock_unit_compatible(existing_row.unit,inferred||'_ha') THEN
     -- Aucune réinterprétation de quantités/coûts ou de références historiques.
     IF COALESCE(existing_row.current_qty,0)<>0 OR COALESCE(existing_row.min_qty,0)<>0 OR COALESCE(existing_row.unit_cost,0)<>0
      OR EXISTS(SELECT 1 FROM warehouse_stocks WHERE stock_item_id=existing_row.id AND (current_qty<>0 OR min_qty<>0))
      OR EXISTS(SELECT 1 FROM stock_movements WHERE stock_item_id=existing_row.id)
      OR EXISTS(SELECT 1 FROM treatment_request_products WHERE stock_item_id=existing_row.id)
      OR EXISTS(SELECT 1 FROM stock_exit_requests WHERE stock_item_id=existing_row.id)
      OR EXISTS(SELECT 1 FROM stock_transfers WHERE stock_item_id=existing_row.id)
     THEN RAISE EXCEPTION '% : correction d’unité nécessitant une revue des quantités, coûts ou références existantes',p.commercial_name; END IF;
     UPDATE stock_items SET unit=inferred WHERE id=existing_row.id;
    END IF;
    UPDATE stock_items SET plant_protection_product_id=p.id,source_positive_list_id=p_list WHERE id=existing_row.id;
    linked:=linked+1;
    CONTINUE;
   END IF;
   INSERT INTO stock_items(domain_id,plant_protection_product_id,code,name,category,unit,supplier_id,packaging,supplier_reference,source_positive_list_id,current_qty,min_qty,unit_cost,is_active)
   VALUES(d,p.id,'PHY-'||left(replace(p.id::TEXT,'-',''),24),p.commercial_name,'phytosanitaires',inferred,supplier,NULLIF(btrim(r->>'packaging'),''),NULLIF(btrim(r->>'supplier_reference'),''),p_list,0,0,cost,TRUE)
   RETURNING id INTO item;
   n:=n+1;
  ELSE
   IF NOT phyto_stock_unit_compatible(item_unit,inferred||'_ha') THEN RAISE EXCEPTION '% : article lié incompatible, revue de l’historique requise',p.commercial_name; END IF;
   linked:=linked+1;
  END IF;
  -- Aucune écriture dans warehouse_stocks ni stock_movements.
  -- Les affectations et quantités existantes sont conservées.
 END LOOP;
 RETURN jsonb_build_object('created',n,'existing',linked);
END $$;
REVOKE ALL ON FUNCTION public.prepare_positive_list_stock(UUID,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_positive_list_stock(UUID,JSONB) TO authenticated;

-- Régularisation des articles générés du client communiqué. Aucun nouvel article.
DO $repair$
DECLARE r RECORD; inferred TEXT; n INTEGER:=0;
BEGIN
 FOR r IN
 SELECT s.*,p.id AS phyto_id FROM stock_items s JOIN plant_protection_products p
 ON p.domain_id=s.domain_id AND s.code='PHY-'||left(replace(p.id::TEXT,'-',''),24)
 WHERE s.domain_id='8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79'::UUID
 AND s.is_active AND p.is_active AND s.category='phytosanitaires'
 AND s.plant_protection_product_id IS NULL
 AND EXISTS(SELECT 1 FROM phyto_positive_list_entries e WHERE e.list_id=s.source_positive_list_id
 AND e.domain_id=s.domain_id AND e.product_id=p.id AND e.review_status='valide' AND e.station_approved)
 ORDER BY s.id FOR UPDATE OF s
 LOOP
  inferred:=infer_phyto_stock_unit(r.phyto_id,r.domain_id,r.source_positive_list_id);
  IF inferred IS NULL THEN RAISE NOTICE '% : unité absente ou contradictoire',r.name; CONTINUE; END IF;
  IF NOT phyto_stock_unit_compatible(r.unit,inferred||'_ha') AND (
    COALESCE(r.current_qty,0)<>0 OR COALESCE(r.min_qty,0)<>0 OR COALESCE(r.unit_cost,0)<>0
    OR EXISTS(SELECT 1 FROM warehouse_stocks WHERE stock_item_id=r.id AND (current_qty<>0 OR min_qty<>0))
    OR EXISTS(SELECT 1 FROM stock_movements WHERE stock_item_id=r.id)
    OR EXISTS(SELECT 1 FROM treatment_request_products WHERE stock_item_id=r.id)
    OR EXISTS(SELECT 1 FROM stock_exit_requests WHERE stock_item_id=r.id)
    OR EXISTS(SELECT 1 FROM stock_transfers WHERE stock_item_id=r.id)
  ) THEN RAISE NOTICE '% : unité à corriger avec revue historique',r.name; CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM stock_items WHERE domain_id=r.domain_id AND plant_protection_product_id=r.phyto_id AND is_active)
  THEN RAISE NOTICE '% : autre article déjà lié',r.name; CONTINUE; END IF;
  UPDATE stock_items SET unit=CASE WHEN phyto_stock_unit_compatible(r.unit,inferred||'_ha') THEN r.unit ELSE inferred END,
    plant_protection_product_id=r.phyto_id WHERE id=r.id;
  n:=n+1;
 END LOOP;
 RAISE NOTICE '% article(s) régularisé(s)',n;
END $repair$;
COMMIT;

SELECT s.id AS stock_item_id,p.commercial_name,s.unit AS unite_stock,
 infer_phyto_stock_unit(p.id,s.domain_id,s.source_positive_list_id) AS unite_deduite,
 s.plant_protection_product_id IS NOT NULL AS lie,
 CASE WHEN s.plant_protection_product_id IS NOT NULL THEN 'Lié'
 WHEN infer_phyto_stock_unit(p.id,s.domain_id,s.source_positive_list_id) IS NULL
 THEN 'Dose absente ou contradictoire : compléter la liste'
 ELSE 'Revue historique ou article déjà lié nécessaire' END AS resultat
FROM stock_items s JOIN plant_protection_products p ON p.domain_id=s.domain_id
 AND s.code='PHY-'||left(replace(p.id::TEXT,'-',''),24)
WHERE s.domain_id='8281fd13-d59d-4ca2-9da8-1f2b6e1c2a79'::UUID AND s.is_active
 AND s.source_positive_list_id IS NOT NULL ORDER BY p.commercial_name;
