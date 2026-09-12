BEGIN;
-- Durcissement des RPC de valorisation : jamais accessibles au rôle anonyme.
REVOKE ALL ON FUNCTION public.confirm_inventory_value(UUID,UUID,NUMERIC,NUMERIC,TEXT),public.receive_costed_purchase(UUID,JSONB),public.get_production_cost_data(UUID,UUID,DATE,DATE),public.create_costed_direct_order(JSONB),public.review_inventory_consumption(UUID,UUID,NUMERIC,TEXT),public.sync_po_to_cost_entries(UUID),public.post_consumption_cost(UUID),public.confirm_treatment_application_before_costing(UUID,JSONB,JSONB) FROM anon;
CREATE TABLE public.mobile_push_subscriptions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES public.profiles(id),
 endpoint TEXT NOT NULL UNIQUE, keys JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mobile_push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_push ON public.mobile_push_subscriptions FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.mobile_push_subscriptions TO authenticated;
CREATE TABLE public.mobile_notification_preferences (
 user_id UUID PRIMARY KEY REFERENCES public.profiles(id), push_enabled BOOLEAN NOT NULL DEFAULT true,
 telegram_enabled BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE public.mobile_notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_preferences ON public.mobile_notification_preferences FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
GRANT SELECT,INSERT,UPDATE ON public.mobile_notification_preferences TO authenticated;
CREATE TABLE public.mobile_telegram_links (
 user_id UUID PRIMARY KEY REFERENCES public.profiles(id), chat_id TEXT UNIQUE,
 code_hash TEXT, expires_at TIMESTAMPTZ, linked_at TIMESTAMPTZ
);
ALTER TABLE public.mobile_telegram_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_telegram ON public.mobile_telegram_links FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT SELECT ON public.mobile_telegram_links TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.mobile_telegram_links FROM authenticated,anon;
CREATE TABLE public.mobile_notification_rules (
 domain_id UUID NOT NULL REFERENCES public.domains(id), process TEXT NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT true, reminder_hours INTEGER NOT NULL DEFAULT 24 CHECK(reminder_hours BETWEEN 1 AND 720),
 PRIMARY KEY(domain_id,process)
);
ALTER TABLE public.mobile_notification_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_rules_read ON public.mobile_notification_rules FOR SELECT TO authenticated USING(is_domain_member(domain_id,auth.uid()));
CREATE POLICY notification_rules_admin ON public.mobile_notification_rules FOR ALL TO authenticated USING(is_domain_admin(domain_id,auth.uid())) WITH CHECK(is_domain_admin(domain_id,auth.uid()));
GRANT SELECT,INSERT,UPDATE ON public.mobile_notification_rules TO authenticated;

CREATE FUNCTION public.mobile_can_review(p_kind TEXT,p_id UUID,p_user UUID) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE a approval_requests%ROWTYPE; t treatment_requests%ROWTYPE; s stock_exit_requests%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_user AND is_active) THEN RETURN false; END IF;
 IF p_kind='approval' THEN
  SELECT * INTO a FROM approval_requests WHERE id=p_id;
  RETURN coalesce(a.status='soumise' AND a.requested_by<>p_user AND is_domain_member(a.domain_id,p_user)
   AND can_validate_approval_level(a.policy_id,a.current_level,p_user)
   AND NOT EXISTS(SELECT 1 FROM approval_decisions WHERE request_id=a.id AND decided_by=p_user),false);
 ELSIF p_kind='treatment' THEN
  SELECT * INTO t FROM treatment_requests WHERE id=p_id;
  RETURN coalesce(t.status='soumise' AND t.requested_by<>p_user AND is_domain_member(t.domain_id,p_user) AND is_domain_responsible(t.domain_id,p_user,'agronomie'),false);
 ELSIF p_kind='stock_exit' THEN
  SELECT * INTO s FROM stock_exit_requests WHERE id=p_id;
  RETURN coalesce(s.status='soumise' AND s.requested_by<>p_user AND is_domain_member(s.domain_id,p_user) AND is_domain_responsible(s.domain_id,p_user,'stocks'),false);
 END IF;
 RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.mobile_can_review(TEXT,UUID,UUID) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_can_review(TEXT,UUID,UUID) TO service_role;

CREATE FUNCTION public.mobile_approval_items() RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
 RETURN coalesce((SELECT jsonb_agg(item || jsonb_build_object(
 'requester',(SELECT coalesce(full_name,email) FROM profiles WHERE id=(item->>'requested_by')::uuid),
 'supplier',(SELECT name FROM suppliers WHERE id=(item->'entity'->>'supplier_id')::uuid),
 'source_warehouse',(SELECT name FROM warehouses WHERE id=(item->'entity'->>'source_id')::uuid),
 'destination_warehouse',(SELECT name FROM warehouses WHERE id=(item->'entity'->>'destination_id')::uuid),
 'farm',(SELECT f.name FROM campaign_plantings cp JOIN greenhouses g ON g.id=cp.greenhouse_id JOIN farms f ON f.id=g.farm_id WHERE cp.id=(item->'entity'->>'campaign_planting_id')::uuid)
 ) ORDER BY created_at) FROM (
 SELECT a.created_at,jsonb_build_object('kind','approval','id',a.id,'domain_id',a.domain_id,'company',d.name,'process',a.process_code,'reference',a.entity_reference,'level',a.current_level,'levels',a.required_levels,'requested_by',a.requested_by,'created_at',a.created_at,'details',to_jsonb(a),
 'entity',CASE WHEN a.process_code='purchase_order' THEN (SELECT to_jsonb(p) FROM purchase_orders p WHERE p.id=a.entity_id) WHEN a.process_code='stock_transfer' THEN (SELECT to_jsonb(t) FROM stock_transfers t WHERE t.id=a.entity_id) ELSE '{}'::jsonb END,
 'lines',CASE WHEN a.process_code='purchase_order' THEN (SELECT coalesce(jsonb_agg(to_jsonb(l)),'[]') FROM purchase_order_lines l WHERE l.po_id=a.entity_id) ELSE '[]'::jsonb END,
 'history',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.decided_at),'[]') FROM approval_decisions h WHERE h.request_id=a.id),
 'href',CASE WHEN a.process_code='purchase_order' THEN '/achats/'||a.entity_id ELSE '/stocks/transferts' END) item
 FROM approval_requests a JOIN domains d ON d.id=a.domain_id WHERE mobile_can_review('approval',a.id,auth.uid())
 UNION ALL
 SELECT t.created_at,jsonb_build_object('kind','treatment','id',t.id,'domain_id',t.domain_id,'company',d.name,'process','treatment','reference',t.target_name,'level',1,'levels',1,'requested_by',t.requested_by,'created_at',t.created_at,'details',to_jsonb(t),'entity',to_jsonb(t),
 'lines',(SELECT coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('product_name',s.name)),'[]') FROM treatment_request_products p LEFT JOIN stock_items s ON s.id=p.stock_item_id WHERE p.treatment_request_id=t.id),'href','/agronomie/traitements')
 FROM treatment_requests t JOIN domains d ON d.id=t.domain_id WHERE mobile_can_review('treatment',t.id,auth.uid())
 AND NOT EXISTS(SELECT 1 FROM approval_requests a WHERE a.process_code='treatment' AND a.entity_id=t.id)
 UNION ALL
 SELECT s.created_at,jsonb_build_object('kind','stock_exit','id',s.id,'domain_id',s.domain_id,'company',d.name,'process','stock_exit','reference',coalesce(s.reference,i.name),'level',1,'levels',1,'requested_by',s.requested_by,'created_at',s.created_at,'details',to_jsonb(s),'entity',to_jsonb(s)||jsonb_build_object('product_name',i.name,'unit',i.unit),'lines','[]'::jsonb,'href','/stocks')
 FROM stock_exit_requests s JOIN domains d ON d.id=s.domain_id JOIN stock_items i ON i.id=s.stock_item_id WHERE mobile_can_review('stock_exit',s.id,auth.uid())
 AND NOT EXISTS(SELECT 1 FROM approval_requests a WHERE a.process_code='stock_exit' AND a.entity_id=s.id)
 ) q),'[]');
END $$;
REVOKE ALL ON FUNCTION public.mobile_approval_items() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_approval_items() TO authenticated;

CREATE TABLE public.mobile_approval_audit (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),domain_id UUID NOT NULL REFERENCES public.domains(id),
 kind TEXT NOT NULL,entity_id UUID NOT NULL,actor UUID NOT NULL DEFAULT auth.uid(),decision TEXT NOT NULL,comment TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mobile_approval_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_mobile_audit ON public.mobile_approval_audit FOR SELECT TO authenticated USING(actor=auth.uid() OR is_domain_admin(domain_id,auth.uid()));
GRANT SELECT ON public.mobile_approval_audit TO authenticated;
CREATE FUNCTION public.mobile_review(p_kind TEXT,p_id UUID,p_level INTEGER,p_approve BOOLEAN,p_comment TEXT DEFAULT NULL) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d UUID; current_level_value INTEGER;
BEGIN
 IF p_approve IS NULL THEN RAISE EXCEPTION 'Décision requise'; END IF;
 IF p_kind='approval' THEN SELECT domain_id,current_level INTO d,current_level_value FROM approval_requests WHERE id=p_id FOR UPDATE;
 ELSIF p_kind='treatment' THEN SELECT domain_id,1 INTO d,current_level_value FROM treatment_requests WHERE id=p_id FOR UPDATE;
 ELSIF p_kind='stock_exit' THEN SELECT domain_id,1 INTO d,current_level_value FROM stock_exit_requests WHERE id=p_id FOR UPDATE;
 ELSE RAISE EXCEPTION 'Type non pris en charge'; END IF;
 IF p_level IS DISTINCT FROM current_level_value OR NOT mobile_can_review(p_kind,p_id,auth.uid()) THEN RAISE EXCEPTION 'Demande déjà traitée, niveau modifié ou habilitation insuffisante. Actualisez.'; END IF;
 IF NOT p_approve AND length(btrim(coalesce(p_comment,'')))<3 THEN RAISE EXCEPTION 'Motif du refus obligatoire'; END IF;
 IF p_kind='approval' THEN PERFORM review_approval_request(p_id,p_approve,p_comment);
 ELSIF p_kind='treatment' THEN PERFORM review_treatment_request(p_id,p_approve,p_comment);
 ELSE PERFORM review_stock_exit_request(p_id,p_approve,p_comment); END IF;
 INSERT INTO mobile_approval_audit(domain_id,kind,entity_id,decision,comment) VALUES(d,p_kind,p_id,CASE WHEN p_approve THEN 'approuvee' ELSE 'rejetee' END,p_comment);
END $$;
REVOKE ALL ON FUNCTION public.mobile_review(TEXT,UUID,INTEGER,BOOLEAN,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_review(TEXT,UUID,INTEGER,BOOLEAN,TEXT) TO authenticated;

CREATE FUNCTION public.mobile_telegram_invite() RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE code TEXT:=replace(gen_random_uuid()::text,'-','');
BEGIN
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active) THEN RAISE EXCEPTION 'Connexion requise'; END IF;
 INSERT INTO mobile_telegram_links(user_id,code_hash,expires_at) VALUES(auth.uid(),md5(code),now()+interval '15 minutes')
 ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at;
 RETURN code;
END $$;
CREATE FUNCTION public.mobile_telegram_enroll(p_code TEXT,p_chat TEXT) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_chat !~ '^[1-9][0-9]{0,19}$' THEN RETURN false; END IF;
 UPDATE mobile_telegram_links SET chat_id=p_chat,code_hash=NULL,expires_at=NULL,linked_at=now()
 WHERE code_hash=md5(p_code) AND expires_at>now() AND EXISTS(SELECT 1 FROM profiles WHERE id=user_id AND is_active);
 RETURN FOUND;
END $$;
CREATE FUNCTION public.mobile_telegram_disconnect() RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ DELETE FROM mobile_telegram_links WHERE user_id=auth.uid(); $$;
REVOKE ALL ON FUNCTION public.mobile_telegram_invite(),public.mobile_telegram_disconnect(),public.mobile_telegram_enroll(TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_telegram_invite(),public.mobile_telegram_disconnect() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_telegram_enroll(TEXT,TEXT) TO service_role;
-- Supabase peut accorder EXECUTE explicitement par privilèges par défaut.
REVOKE ALL ON FUNCTION public.mobile_can_review(TEXT,UUID,UUID),public.mobile_approval_items(),public.mobile_review(TEXT,UUID,INTEGER,BOOLEAN,TEXT),public.mobile_telegram_invite(),public.mobile_telegram_disconnect(),public.mobile_telegram_enroll(TEXT,TEXT) FROM anon;
NOTIFY pgrst,'reload schema';
COMMIT;
