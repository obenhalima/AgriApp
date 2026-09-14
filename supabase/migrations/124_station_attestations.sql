BEGIN;
-- Les traitements utilisent un enum, tandis que les autres circuits utilisent du texte.
CREATE OR REPLACE FUNCTION public.mobile_result_notification() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE kind TEXT;
BEGIN
 IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status NOT IN ('approuvee','rejetee','annulee') THEN RETURN NEW; END IF;
 kind:=CASE TG_TABLE_NAME WHEN 'approval_requests' THEN 'approval' WHEN 'treatment_requests' THEN 'treatment' ELSE 'stock_exit' END;
 IF NEW.requested_by IS NOT NULL THEN
  PERFORM mobile_queue(NEW.requested_by,NEW.domain_id,kind,NEW.id,NEW.status::text,kind||':'||NEW.id||':'||NEW.status::text);
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.station_risk(p_value TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE upper(btrim(coalesce(p_value,'')))
 WHEN 'V' THEN 'green' WHEN 'VERT' THEN 'green' WHEN 'GREEN' THEN 'green' WHEN 'FAIBLE' THEN 'green'
 WHEN 'O' THEN 'yellow' WHEN 'J' THEN 'yellow' WHEN 'JAUNE' THEN 'yellow' WHEN 'YELLOW' THEN 'yellow' WHEN 'ORANGE' THEN 'yellow' WHEN 'MOYEN' THEN 'yellow'
 WHEN 'R' THEN 'red' WHEN 'R*' THEN 'red' WHEN 'ROUGE' THEN 'red' WHEN 'RED' THEN 'red'
 ELSE 'unknown' END;
$$;
ALTER TABLE public.phyto_positive_list_entries ADD COLUMN station_restriction_until DATE;

CREATE TABLE public.treatment_station_attestations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), request_id UUID NOT NULL REFERENCES public.treatment_requests(id),
 domain_id UUID NOT NULL REFERENCES public.domains(id), actor_id UUID NOT NULL REFERENCES public.profiles(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(), snapshot JSONB NOT NULL, fingerprint TEXT NOT NULL,
 confirmations JSONB NOT NULL
);
ALTER TABLE public.treatment_station_attestations ENABLE ROW LEVEL SECURITY;
CREATE POLICY station_attestation_read ON public.treatment_station_attestations FOR SELECT TO authenticated
 USING(is_domain_member(domain_id,auth.uid()) AND has_domain_permission(domain_id,auth.uid(),'agronomie','view'));
REVOKE ALL ON public.treatment_station_attestations FROM anon,authenticated;
GRANT SELECT ON public.treatment_station_attestations TO authenticated;

CREATE FUNCTION public.can_attest_treatment_station(p_request UUID,p_user UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM treatment_requests r WHERE r.id=p_request AND r.requested_by<>p_user
 AND is_domain_member(r.domain_id,p_user) AND is_domain_responsible(r.domain_id,p_user,'agronomie')
 AND EXISTS(SELECT 1 FROM profiles WHERE id=p_user AND is_active AND NOT coalesce(must_change_password,false))
 AND EXISTS(SELECT 1 FROM user_function_assignments a JOIN operational_functions f ON f.id=a.function_id
   WHERE a.user_id=p_user AND a.domain_id=r.domain_id AND a.is_active AND f.is_active AND f.code='responsable_exploitation'
   AND a.valid_from<=CURRENT_DATE AND (a.valid_until IS NULL OR a.valid_until>=CURRENT_DATE)
   AND (a.farm_id IS NULL OR a.farm_id=(SELECT farm_id FROM warehouses WHERE id=r.warehouse_id AND domain_id=r.domain_id))));
$$;
REVOKE ALL ON FUNCTION public.can_attest_treatment_station(UUID,UUID) FROM PUBLIC,anon,authenticated;

-- Instantané côté serveur : une couleur inconnue n'est jamais assimilée au vert.
CREATE FUNCTION public.treatment_station_snapshot(p_request UUID) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('request',jsonb_build_object('id',r.id,'planned_at',r.planned_at,'target_name',r.target_name,
 'warehouse_id',r.warehouse_id,'treated_area_m2',r.treated_area_m2,'water_volume_liters',r.water_volume_liters,
 'targets',(SELECT coalesce(jsonb_agg(t.campaign_planting_id ORDER BY t.campaign_planting_id),'[]') FROM treatment_request_targets t WHERE t.treatment_request_id=r.id)),
 'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('line_id',p.id,'product',coalesce(p.product_name,c.commercial_name,s.name,'Produit'),
 'prescribed',to_jsonb(p)-'actual_quantity','sources',x.sources,
 'risk',CASE WHEN NOT EXISTS(SELECT 1 FROM phyto_positive_lists l WHERE l.domain_id=r.domain_id AND l.status='active') THEN 'none'
 WHEN x.sources IS NULL OR x.unknown THEN 'unknown' WHEN x.red THEN 'red' WHEN x.yellow THEN 'yellow' ELSE 'green' END,
 'expired',coalesce(x.expired,false)) ORDER BY p.id)
 FROM treatment_request_products p LEFT JOIN stock_items s ON s.id=p.stock_item_id AND s.domain_id=r.domain_id
 LEFT JOIN plant_protection_products c ON c.id=coalesce(p.catalog_product_id,s.plant_protection_product_id) AND c.domain_id=r.domain_id
 LEFT JOIN LATERAL(SELECT jsonb_agg(jsonb_build_object('entry_id',e.id,'list_id',l.id,'version',l.version,'risk_class',e.risk_class,
 'restriction_until',e.station_restriction_until) ORDER BY e.id) sources,
 bool_or(station_risk(e.risk_class)='unknown') unknown,bool_or(station_risk(e.risk_class)='red') red,
 bool_or(station_risk(e.risk_class)='yellow') yellow,
 bool_or(e.station_restriction_until IS NOT NULL AND e.station_restriction_until<greatest(CURRENT_DATE,(r.planned_at AT TIME ZONE 'Africa/Casablanca')::date)) expired
 FROM phyto_positive_list_entries e JOIN phyto_positive_lists l ON l.id=e.list_id AND l.domain_id=r.domain_id AND l.status='active'
 LEFT JOIN phyto_targets t ON t.id=e.target_id
 WHERE e.domain_id=r.domain_id AND e.product_id=c.id AND e.review_status='valide' AND e.station_approved
 AND normalize_positive_list_key(coalesce(t.canonical_name,e.target_label))=normalize_positive_list_key(r.target_name)) x ON true
 WHERE p.treatment_request_id=r.id AND p.domain_id=r.domain_id),'[]'))
 FROM treatment_requests r WHERE r.id=p_request;
$$;
REVOKE ALL ON FUNCTION public.treatment_station_snapshot(UUID) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.get_treatment_station_review(p_request UUID) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r treatment_requests%ROWTYPE; s JSONB;
BEGIN
 SELECT * INTO r FROM treatment_requests WHERE id=p_request;
 IF NOT FOUND OR NOT is_domain_member(r.domain_id,auth.uid()) OR NOT has_domain_permission(r.domain_id,auth.uid(),'agronomie','view') THEN RAISE EXCEPTION 'Prescription inaccessible'; END IF;
 s:=treatment_station_snapshot(p_request);
 RETURN jsonb_build_object('snapshot',s,'fingerprint',md5(s::text),'can_review',can_attest_treatment_station(p_request,auth.uid()),
 'history',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'actor',coalesce(p.full_name,'Responsable'),
 'created_at',a.created_at,'snapshot',a.snapshot,'confirmations',a.confirmations) ORDER BY a.created_at DESC),'[]')
 FROM treatment_station_attestations a LEFT JOIN profiles p ON p.id=a.actor_id WHERE a.request_id=r.id AND a.domain_id=r.domain_id));
END $$;
REVOKE ALL ON FUNCTION public.get_treatment_station_review(UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_treatment_station_review(UUID) TO authenticated;

ALTER FUNCTION public.review_treatment_request(UUID,BOOLEAN,TEXT) RENAME TO review_treatment_before_station;
REVOKE ALL ON FUNCTION public.review_treatment_before_station(UUID,BOOLEAN,TEXT) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.review_treatment_station(p_request UUID,p_approve BOOLEAN,p_reason TEXT DEFAULT NULL,p_fingerprint TEXT DEFAULT NULL,p_confirmations JSONB DEFAULT '[]') RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r treatment_requests%ROWTYPE;s JSONB;line JSONB;c JSONB;
BEGIN
 SELECT * INTO r FROM treatment_requests WHERE id=p_request FOR UPDATE;
 IF NOT FOUND OR r.status<>'soumise' OR p_approve IS NULL THEN RAISE EXCEPTION 'Prescription déjà traitée ou décision invalide'; END IF;
 IF NOT can_attest_treatment_station(p_request,auth.uid()) THEN RAISE EXCEPTION 'Validation réservée au responsable d’exploitation habilité, distinct du demandeur'; END IF;
 IF p_approve THEN
  PERFORM 1 FROM treatment_request_products WHERE treatment_request_id=r.id FOR SHARE;
  PERFORM 1 FROM phyto_positive_lists WHERE domain_id=r.domain_id FOR SHARE;
  PERFORM 1 FROM phyto_positive_list_entries WHERE domain_id=r.domain_id FOR SHARE;
  s:=treatment_station_snapshot(r.id);
  IF p_fingerprint IS DISTINCT FROM md5(s::text) THEN RAISE EXCEPTION 'Prescription ou liste Station modifiée : rechargez les confirmations'; END IF;
  IF jsonb_typeof(p_confirmations) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Confirmations invalides'; END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(s->'lines') LOOP
   IF line->>'risk'='unknown' THEN RAISE EXCEPTION '% : couleur Station à contrôler dans la liste positive',line->>'product'; END IF;
   IF (line->>'expired')::boolean THEN RAISE EXCEPTION '% : restriction expirée à la date du traitement, consigne actualisée requise',line->>'product'; END IF;
   IF line->>'risk' IN ('yellow','red') THEN
    SELECT value INTO c FROM jsonb_array_elements(p_confirmations) WHERE value->>'line_id'=line->>'line_id';
    IF c->'station_agreed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION '% : accord Station à confirmer',line->>'product'; END IF;
    IF line->>'risk'='red' AND c->'restrictions_checked' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION '% : restrictions à confirmer',line->>'product'; END IF;
   END IF;
  END LOOP;
  INSERT INTO treatment_station_attestations(request_id,domain_id,actor_id,snapshot,fingerprint,confirmations)
  VALUES(r.id,r.domain_id,auth.uid(),s,md5(s::text),p_confirmations);
 END IF;
 PERFORM review_treatment_before_station(p_request,p_approve,p_reason);
END $$;
REVOKE ALL ON FUNCTION public.review_treatment_station(UUID,BOOLEAN,TEXT,TEXT,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_treatment_station(UUID,BOOLEAN,TEXT,TEXT,JSONB) TO authenticated;

-- L'ancien endpoint ne peut pas contourner les attestations.
CREATE FUNCTION public.review_treatment_request(p_request_id UUID,p_approve BOOLEAN,p_reason TEXT DEFAULT NULL) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_approve THEN RAISE EXCEPTION 'Ouvrez la validation Station pour confirmer les produits et leurs couleurs'; END IF;
 PERFORM review_treatment_station(p_request_id,false,p_reason);
END $$;
REVOKE ALL ON FUNCTION public.review_treatment_request(UUID,BOOLEAN,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_treatment_request(UUID,BOOLEAN,TEXT) TO authenticated;

CREATE FUNCTION public.guard_station_approval() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  -- Le circuit phyto validé ici est obligatoire, même si l'ancien paramètre générique était désactivé.
  NEW.status:='soumise'; NEW.approved_by:=NULL; NEW.approved_at:=NULL;
  RETURN NEW;
 END IF;
 IF (NEW.status='approuvee' OR (OLD.status IN ('approuvee','executee') AND EXISTS(SELECT 1 FROM treatment_station_attestations WHERE request_id=OLD.id)))
 AND ROW(NEW.domain_id,NEW.requested_by,NEW.planned_at,NEW.campaign_planting_id,NEW.warehouse_id,NEW.target_name,NEW.treated_area_m2,NEW.water_volume_liters)
 IS DISTINCT FROM ROW(OLD.domain_id,OLD.requested_by,OLD.planned_at,OLD.campaign_planting_id,OLD.warehouse_id,OLD.target_name,OLD.treated_area_m2,OLD.water_volume_liters)
 THEN RAISE EXCEPTION 'Prescription attestée : nouvelle soumission et validation nécessaires avant modification'; END IF;
 IF NEW.status='approuvee' AND OLD.status IS DISTINCT FROM NEW.status THEN
  IF NOT can_attest_treatment_station(OLD.id,auth.uid()) OR NOT EXISTS(SELECT 1 FROM treatment_station_attestations a
    WHERE a.request_id=OLD.id AND a.actor_id=auth.uid() AND a.created_at=transaction_timestamp()
    AND a.fingerprint=md5(treatment_station_snapshot(OLD.id)::text)) THEN RAISE EXCEPTION 'Validation Station tracée obligatoire'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_guard_station_approval BEFORE INSERT OR UPDATE ON public.treatment_requests FOR EACH ROW EXECUTE FUNCTION public.guard_station_approval();

CREATE FUNCTION public.guard_attested_treatment_lines() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid UUID; current_status approval_request_status;
BEGIN
 FOR rid IN SELECT DISTINCT x FROM unnest(ARRAY[CASE WHEN TG_OP<>'INSERT' THEN OLD.treatment_request_id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.treatment_request_id END]) x WHERE x IS NOT NULL LOOP
  SELECT status INTO current_status FROM treatment_requests WHERE id=rid FOR UPDATE;
  IF current_status IN ('approuvee','executee') AND EXISTS(SELECT 1 FROM treatment_station_attestations WHERE request_id=rid) THEN
   IF TG_OP<>'UPDATE' OR TG_TABLE_NAME='treatment_request_targets' OR
     (to_jsonb(NEW)-'actual_quantity') IS DISTINCT FROM (to_jsonb(OLD)-'actual_quantity')
   THEN RAISE EXCEPTION 'Prescription attestée : les produits et cibles nécessitent une nouvelle validation après modification'; END IF;
  END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_attested_products BEFORE INSERT OR UPDATE OR DELETE ON public.treatment_request_products FOR EACH ROW EXECUTE FUNCTION public.guard_attested_treatment_lines();
CREATE TRIGGER guard_attested_targets BEFORE INSERT OR UPDATE OR DELETE ON public.treatment_request_targets FOR EACH ROW EXECUTE FUNCTION public.guard_attested_treatment_lines();

ALTER FUNCTION public.mobile_can_review(TEXT,UUID,UUID) RENAME TO mobile_can_review_before_station;
REVOKE ALL ON FUNCTION public.mobile_can_review_before_station(TEXT,UUID,UUID) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.mobile_can_review(p_kind TEXT,p_id UUID,p_user UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT mobile_can_review_before_station(p_kind,p_id,p_user) AND (p_kind<>'treatment' OR can_attest_treatment_station(p_id,p_user));
$$;
REVOKE ALL ON FUNCTION public.mobile_can_review(TEXT,UUID,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_can_review(TEXT,UUID,UUID) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
