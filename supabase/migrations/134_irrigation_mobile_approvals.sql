-- Requires 133 and the existing mobile stack 119-126.
-- Local-first rollout: irrigation notifications require explicit opt-in after UI deployment.
BEGIN;
INSERT INTO public.mobile_notification_rules(domain_id,process,enabled,reminder_hours)
SELECT id,'irrigation',false,24 FROM public.domains ON CONFLICT(domain_id,process) DO NOTHING;

ALTER FUNCTION public.mobile_can_review(text,uuid,uuid) RENAME TO mobile_can_review_before_irrigation;
CREATE FUNCTION public.mobile_can_review(p_kind text,p_id uuid,p_user uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_kind IS DISTINCT FROM 'irrigation' THEN RETURN mobile_can_review_before_irrigation(p_kind,p_id,p_user); END IF;
 RETURN EXISTS(SELECT 1 FROM irrigation_programs p JOIN farms f ON f.id=p.farm_id AND f.domain_id=p.domain_id
 JOIN profiles u ON u.id=p_user
 WHERE p.id=p_id AND p.status='soumise' AND p.validation_required AND p.requested_by<>p_user
 AND f.is_active AND u.is_active AND NOT coalesce(u.must_change_password,false)
 AND is_domain_member(p.domain_id,p_user) AND has_domain_permission(p.domain_id,p_user,'agronomie','view')
 AND has_business_capability(p.domain_id,p_user,'irrigation.validate',p.farm_id));
END $$;
REVOKE ALL ON FUNCTION public.mobile_can_review_before_irrigation(text,uuid,uuid),public.mobile_can_review(text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_can_review(text,uuid,uuid) TO service_role;

ALTER FUNCTION public.mobile_approval_items() RENAME TO mobile_approval_items_before_irrigation;
CREATE FUNCTION public.mobile_approval_items() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
 RETURN coalesce(mobile_approval_items_before_irrigation(),'[]'::jsonb)||coalesce((
 SELECT jsonb_agg(jsonb_build_object(
  'kind','irrigation','process','irrigation','id',p.id,'domain_id',p.domain_id,'company',d.name,
  'reference',p.title,'level',1,'levels',1,'created_at',p.submitted_at,'requested_by',p.requested_by,
  'requester',(SELECT coalesce(full_name,'Utilisateur') FROM profiles WHERE id=p.requested_by),
  'farm',f.name,'href','/interventions?programme='||p.id,
  'entity',jsonb_build_object('planned_liters',p.planned_liters,'water_source',p.water_source,'sector',p.sector,
    'water',p.input->'water','notes',p.input->>'notes',
    'greenhouses',(SELECT coalesce(jsonb_agg(g.name ORDER BY g.code),'[]') FROM greenhouses g WHERE g.id=ANY(p.greenhouse_ids) AND g.farm_id=p.farm_id),
    'occurrences',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'planned_at',o.planned_at) ORDER BY o.planned_at),'[]') FROM irrigation_occurrences o WHERE o.program_id=p.id)),
  'lines','[]'::jsonb,'history','[]'::jsonb
 ) ORDER BY p.submitted_at) FROM irrigation_programs p JOIN domains d ON d.id=p.domain_id
 JOIN farms f ON f.id=p.farm_id AND f.domain_id=p.domain_id WHERE mobile_can_review('irrigation',p.id,auth.uid())
 ),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.mobile_approval_items_before_irrigation(),public.mobile_approval_items() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_approval_items() TO authenticated;

ALTER FUNCTION public.mobile_review(text,uuid,integer,boolean,text) RENAME TO mobile_review_before_irrigation;
CREATE FUNCTION public.mobile_review(p_kind text,p_id uuid,p_level integer,p_approve boolean,p_comment text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p irrigation_programs%ROWTYPE;
BEGIN
 IF p_kind IS DISTINCT FROM 'irrigation' THEN PERFORM mobile_review_before_irrigation(p_kind,p_id,p_level,p_approve,p_comment); RETURN; END IF;
 SELECT * INTO p FROM irrigation_programs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR p_level IS DISTINCT FROM 1 OR p_approve IS NULL OR NOT mobile_can_review('irrigation',p_id,auth.uid()) THEN
  RAISE EXCEPTION 'Programme déjà traité ou habilitation insuffisante. Actualisez.';
 END IF;
 PERFORM irrigation_program_action(p_id,CASE WHEN p_approve THEN 'approve' ELSE 'reject' END,p_comment);
 INSERT INTO mobile_approval_audit(domain_id,kind,entity_id,actor,decision,comment)
 VALUES(p.domain_id,'irrigation',p.id,auth.uid(),CASE WHEN p_approve THEN 'approuvee' ELSE 'rejetee' END,p_comment);
END $$;
REVOKE ALL ON FUNCTION public.mobile_review_before_irrigation(text,uuid,integer,boolean,text),public.mobile_review(text,uuid,integer,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_review(text,uuid,integer,boolean,text) TO authenticated;

CREATE FUNCTION public.mobile_refresh_irrigation_notifications() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; u record; bucket bigint;
BEGIN
 FOR r IN SELECT p.*,m.reminder_hours FROM irrigation_programs p JOIN mobile_notification_rules m
 ON m.domain_id=p.domain_id AND m.process='irrigation' AND m.enabled
 WHERE p.status='soumise' AND p.validation_required LOOP
  bucket:=greatest(0,floor(extract(epoch FROM(now()-r.submitted_at))/(r.reminder_hours*3600)))::bigint;
  FOR u IN SELECT dm.user_id FROM domain_memberships dm WHERE dm.domain_id=r.domain_id AND dm.is_active
   AND mobile_can_review('irrigation',r.id,dm.user_id) LOOP
   PERFORM mobile_queue(u.user_id,r.domain_id,'irrigation',r.id,'pending','irrigation:'||r.id||':1:'||bucket);
  END LOOP;
 END LOOP;
 -- Already-sent notifications remain in the delivery audit. Unsent stale pending messages are cancelled.
 UPDATE mobile_notifications n SET cancelled=true,locked_until=NULL,last_error='No longer eligible'
 WHERE n.kind='irrigation' AND n.phase='pending' AND n.sent_at IS NULL AND NOT n.cancelled
 AND (NOT mobile_can_review('irrigation',n.entity_id,n.user_id)
  OR NOT EXISTS(SELECT 1 FROM mobile_notification_rules m WHERE m.domain_id=n.domain_id AND m.process='irrigation' AND m.enabled));
END $$;
REVOKE ALL ON FUNCTION public.mobile_refresh_irrigation_notifications() FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION public.mobile_refresh_notifications() RENAME TO mobile_refresh_notifications_before_irrigation;
CREATE FUNCTION public.mobile_refresh_notifications() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM mobile_refresh_notifications_before_irrigation();
 PERFORM mobile_refresh_irrigation_notifications();
END $$;
REVOKE ALL ON FUNCTION public.mobile_refresh_notifications_before_irrigation(),public.mobile_refresh_notifications() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mobile_refresh_notifications() TO service_role;

CREATE FUNCTION public.irrigation_mobile_result() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 IF NEW.status<>'soumise' THEN
  UPDATE mobile_notifications SET cancelled=true,locked_until=NULL,last_error='Programme traité'
  WHERE kind='irrigation' AND entity_id=NEW.id AND phase='pending' AND sent_at IS NULL AND NOT cancelled;
 END IF;
 -- Never imply a human approval when approval was disabled; do not notify a self-cancellation.
 IF NEW.status IN ('approuvee','rejetee','annulee') AND NEW.requested_by IS DISTINCT FROM auth.uid()
 AND EXISTS(SELECT 1 FROM mobile_notification_rules WHERE domain_id=NEW.domain_id AND process='irrigation' AND enabled)
 AND EXISTS(SELECT 1 FROM profiles WHERE id=NEW.requested_by AND is_active AND NOT coalesce(must_change_password,false))
 AND is_domain_member(NEW.domain_id,NEW.requested_by) THEN
  PERFORM mobile_queue(NEW.requested_by,NEW.domain_id,'irrigation',NEW.id,NEW.status,'irrigation:'||NEW.id||':'||NEW.status);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.irrigation_mobile_result() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER irrigation_mobile_result AFTER UPDATE OF status ON public.irrigation_programs FOR EACH ROW EXECUTE FUNCTION public.irrigation_mobile_result();
NOTIFY pgrst,'reload schema';
COMMIT;
