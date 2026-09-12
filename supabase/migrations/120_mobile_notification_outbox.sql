BEGIN;
CREATE TABLE public.mobile_notifications (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES profiles(id),domain_id UUID NOT NULL REFERENCES domains(id),
 kind TEXT NOT NULL,entity_id UUID NOT NULL,phase TEXT NOT NULL,channel TEXT NOT NULL CHECK(channel IN ('push','telegram')),
 subscription_id UUID REFERENCES mobile_push_subscriptions(id) ON DELETE CASCADE,
 dedupe_key TEXT NOT NULL UNIQUE,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 available_at TIMESTAMPTZ NOT NULL DEFAULT now(),locked_until TIMESTAMPTZ,attempts INTEGER NOT NULL DEFAULT 0,
 sent_at TIMESTAMPTZ,cancelled BOOLEAN NOT NULL DEFAULT false,last_error TEXT
);
ALTER TABLE public.mobile_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_notification_status ON public.mobile_notifications FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT SELECT ON public.mobile_notifications TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.mobile_notifications FROM authenticated,anon;
CREATE INDEX mobile_outbox_pending ON public.mobile_notifications(available_at) WHERE sent_at IS NULL AND NOT cancelled;

CREATE FUNCTION public.mobile_queue(p_user UUID,p_domain UUID,p_kind TEXT,p_entity UUID,p_phase TEXT,p_key TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE process_name TEXT;
BEGIN
 process_name:=CASE WHEN p_kind='approval' THEN (SELECT process_code FROM approval_requests WHERE id=p_entity) ELSE p_kind END;
 IF EXISTS(SELECT 1 FROM mobile_notification_rules WHERE domain_id=p_domain AND process=process_name AND NOT enabled) THEN RETURN; END IF;
 INSERT INTO mobile_notifications(user_id,domain_id,kind,entity_id,phase,channel,subscription_id,dedupe_key)
 SELECT p_user,p_domain,p_kind,p_entity,p_phase,'push',s.id,p_key||':push:'||s.id FROM mobile_push_subscriptions s
 WHERE s.user_id=p_user AND coalesce((SELECT push_enabled FROM mobile_notification_preferences WHERE user_id=p_user),true)
 ON CONFLICT(dedupe_key) DO NOTHING;
 INSERT INTO mobile_notifications(user_id,domain_id,kind,entity_id,phase,channel,dedupe_key)
 SELECT p_user,p_domain,p_kind,p_entity,p_phase,'telegram',p_key||':telegram:'||p_user
 WHERE EXISTS(SELECT 1 FROM mobile_telegram_links WHERE user_id=p_user AND chat_id IS NOT NULL)
 AND EXISTS(SELECT 1 FROM mobile_notification_preferences WHERE user_id=p_user AND telegram_enabled)
 ON CONFLICT(dedupe_key) DO NOTHING;
END $$;

CREATE FUNCTION public.mobile_refresh_notifications() RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r RECORD; u RECORD; hours INTEGER; enabled BOOLEAN; bucket BIGINT;
BEGIN
 FOR r IN
  SELECT 'approval'::text kind,id,domain_id,process_code process,current_level level,created_at FROM approval_requests WHERE status='soumise'
  UNION ALL SELECT 'treatment',t.id,t.domain_id,'treatment',1,t.created_at FROM treatment_requests t WHERE status='soumise' AND NOT EXISTS(SELECT 1 FROM approval_requests a WHERE a.process_code='treatment' AND a.entity_id=t.id)
  UNION ALL SELECT 'stock_exit',s.id,s.domain_id,'stock_exit',1,s.created_at FROM stock_exit_requests s WHERE status='soumise' AND NOT EXISTS(SELECT 1 FROM approval_requests a WHERE a.process_code='stock_exit' AND a.entity_id=s.id)
 LOOP
  SELECT reminder_hours,m.enabled INTO hours,enabled FROM mobile_notification_rules m WHERE domain_id=r.domain_id AND process=r.process;
  IF enabled IS FALSE THEN CONTINUE; END IF;
  bucket:=floor(extract(epoch FROM (now()-r.created_at))/(coalesce(hours,24)*3600));
  FOR u IN SELECT id FROM profiles WHERE is_active AND mobile_can_review(r.kind,r.id,id) LOOP
   PERFORM mobile_queue(u.id,r.domain_id,r.kind,r.id,'pending',r.kind||':'||r.id||':'||r.level||':'||bucket);
  END LOOP;
 END LOOP;
END $$;
CREATE FUNCTION public.mobile_result_notification() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE kind TEXT;
BEGIN
 IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status NOT IN ('approuvee','rejetee','annulee') THEN RETURN NEW; END IF;
 kind:=CASE TG_TABLE_NAME WHEN 'approval_requests' THEN 'approval' WHEN 'treatment_requests' THEN 'treatment' ELSE 'stock_exit' END;
 IF NEW.requested_by IS NOT NULL THEN
  PERFORM mobile_queue(NEW.requested_by,NEW.domain_id,kind,NEW.id,NEW.status,kind||':'||NEW.id||':'||NEW.status);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mobile_approval_result AFTER UPDATE ON approval_requests FOR EACH ROW EXECUTE FUNCTION mobile_result_notification();
CREATE TRIGGER mobile_treatment_result AFTER UPDATE ON treatment_requests FOR EACH ROW EXECUTE FUNCTION mobile_result_notification();
CREATE TRIGGER mobile_stock_result AFTER UPDATE ON stock_exit_requests FOR EACH ROW EXECUTE FUNCTION mobile_result_notification();

CREATE FUNCTION public.mobile_claim_notifications() RETURNS SETOF public.mobile_notifications LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 RETURN QUERY UPDATE mobile_notifications n SET locked_until=now()+interval '3 minutes',attempts=n.attempts+1
 WHERE n.id IN (SELECT id FROM mobile_notifications WHERE sent_at IS NULL AND NOT cancelled AND attempts<5
 AND available_at<=now() AND (locked_until IS NULL OR locked_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 20) RETURNING n.*;
END $$;
REVOKE ALL ON FUNCTION public.mobile_queue(UUID,UUID,TEXT,UUID,TEXT,TEXT),public.mobile_refresh_notifications(),public.mobile_result_notification(),public.mobile_claim_notifications() FROM PUBLIC,authenticated,anon;
GRANT EXECUTE ON FUNCTION public.mobile_refresh_notifications(),public.mobile_claim_notifications() TO service_role;
GRANT ALL ON public.mobile_notifications,public.mobile_push_subscriptions,public.mobile_notification_preferences,public.mobile_telegram_links TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
