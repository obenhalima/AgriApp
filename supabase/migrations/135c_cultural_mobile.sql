-- Prérequis : 135B et socle notifications 119-126. Compatible avec 134 avant ou après.
BEGIN;
INSERT INTO public.mobile_notification_rules(domain_id,process,enabled,reminder_hours)
SELECT id,'cultural',false,24 FROM public.domains ON CONFLICT DO NOTHING;
ALTER FUNCTION public.mobile_can_review(text,uuid,uuid) RENAME TO mobile_can_review_before_cultural;
CREATE FUNCTION public.mobile_can_review(p_kind text,p_id uuid,p_user uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_kind='cultural' THEN RETURN cultural_can_review(p_id,p_user); END IF;
 RETURN mobile_can_review_before_cultural(p_kind,p_id,p_user);
END $$;
REVOKE ALL ON FUNCTION public.mobile_can_review_before_cultural(text,uuid,uuid),public.mobile_can_review(text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_can_review(text,uuid,uuid) TO service_role;
ALTER FUNCTION public.mobile_approval_items() RENAME TO mobile_approval_items_before_cultural;
CREATE FUNCTION public.mobile_approval_items() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
 RETURN coalesce(mobile_approval_items_before_cultural(),'[]')||coalesce((SELECT jsonb_agg(jsonb_build_object(
 'kind','cultural','process','cultural','id',p.id,'domain_id',p.domain_id,'company',d.name,'reference',p.title,
 'level',p.current_level,'levels',p.required_levels,'created_at',p.submitted_at,'requester',(SELECT full_name FROM profiles WHERE id=p.requested_by),'farm',f.name,
 'href','/interventions/programmes?programme='||p.id,'entity',jsonb_build_object('family',cf.name,'notes',p.input->>'notes','water_liters',p.water_liters,'targets',p.targets,
 'warehouse',(SELECT name FROM warehouses WHERE id=p.warehouse_id),'dates',(SELECT jsonb_agg(planned_at ORDER BY planned_at) FROM cultural_occurrences WHERE program_id=p.id)),
 'lines',(SELECT coalesce(jsonb_agg(jsonb_build_object('product_name',l->>'name','planned_quantity',(l->>'quantity')::numeric,'unit',l->>'unit','dose',(l->>'dose')::numeric,'dose_unit',CASE WHEN l->>'mode'='recipe' THEN replace(l->>'dose_unit','_m3',' / m³') WHEN l->>'mode'='ha' THEN (l->>'unit')||' / ha' WHEN l->>'mode'='m3' THEN (l->>'unit')||' / m³' ELSE (l->>'unit')||' / occurrence' END)),'[]') FROM jsonb_array_elements(p.products) l),
 'history',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'level_number',a.level_number,'decision',a.action,'comment',a.details->>'comment') ORDER BY a.created_at),'[]') FROM cultural_audit a WHERE a.program_id=p.id AND a.action IN('approve','reject'))
 ) ORDER BY p.submitted_at) FROM cultural_programs p JOIN domains d ON d.id=p.domain_id JOIN farms f ON f.id=p.farm_id JOIN cultural_families cf ON cf.code=p.family WHERE cultural_can_review(p.id,auth.uid())),'[]');
END $$;
REVOKE ALL ON FUNCTION public.mobile_approval_items_before_cultural(),public.mobile_approval_items() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_approval_items() TO authenticated;
ALTER FUNCTION public.mobile_review(text,uuid,integer,boolean,text) RENAME TO mobile_review_before_cultural;
CREATE FUNCTION public.mobile_review(p_kind text,p_id uuid,p_level integer,p_approve boolean,p_comment text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d uuid;
BEGIN
 IF p_kind IS DISTINCT FROM 'cultural' THEN PERFORM mobile_review_before_cultural(p_kind,p_id,p_level,p_approve,p_comment);RETURN; END IF;
 IF p_approve IS NULL THEN RAISE EXCEPTION 'Décision requise'; END IF;
 PERFORM cultural_action(p_id,CASE WHEN p_approve THEN 'approve' ELSE 'reject' END,p_level,p_comment);
 SELECT domain_id INTO d FROM cultural_programs WHERE id=p_id;
 INSERT INTO mobile_approval_audit(domain_id,kind,entity_id,actor,decision,comment) VALUES(d,'cultural',p_id,auth.uid(),CASE WHEN p_approve THEN 'approuvee' ELSE 'rejetee' END,p_comment);
END $$;
REVOKE ALL ON FUNCTION public.mobile_review_before_cultural(text,uuid,integer,boolean,text),public.mobile_review(text,uuid,integer,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_review(text,uuid,integer,boolean,text) TO authenticated;
ALTER FUNCTION public.mobile_refresh_notifications() RENAME TO mobile_refresh_notifications_before_cultural;
CREATE FUNCTION public.mobile_refresh_notifications() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p record;u record;b bigint;
BEGIN
 PERFORM mobile_refresh_notifications_before_cultural();
 FOR p IN SELECT cp.*,r.reminder_hours FROM cultural_programs cp JOIN mobile_notification_rules r ON r.domain_id=cp.domain_id AND r.process='cultural' AND r.enabled WHERE cp.status='soumise' LOOP
  b:=greatest(0,floor(extract(epoch FROM(now()-p.submitted_at))/(p.reminder_hours*3600)))::bigint;
  FOR u IN SELECT user_id FROM domain_memberships WHERE domain_id=p.domain_id AND is_active AND cultural_can_review(p.id,user_id) LOOP
   PERFORM mobile_queue(u.user_id,p.domain_id,'cultural',p.id,'pending','cultural:'||p.id||':'||p.current_level||':'||b);
  END LOOP;
 END LOOP;
 UPDATE mobile_notifications n SET cancelled=true,locked_until=NULL,last_error='Demande traitée ou droits modifiés'
 WHERE n.kind='cultural' AND n.phase='pending' AND n.sent_at IS NULL AND NOT n.cancelled AND
 (NOT cultural_can_review(n.entity_id,n.user_id) OR NOT EXISTS(SELECT 1 FROM mobile_notification_rules r WHERE r.domain_id=n.domain_id AND r.process='cultural' AND r.enabled));
END $$;
REVOKE ALL ON FUNCTION public.mobile_refresh_notifications_before_cultural(),public.mobile_refresh_notifications() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mobile_refresh_notifications() TO service_role;
CREATE FUNCTION public.cultural_mobile_result() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.current_level=OLD.current_level THEN RETURN NEW; END IF;
 UPDATE mobile_notifications SET cancelled=true,locked_until=NULL,last_error='Statut ou niveau modifié'
 WHERE kind='cultural' AND entity_id=NEW.id AND phase='pending' AND sent_at IS NULL AND NOT cancelled;
 IF NEW.status IN('approuvee','rejetee','annulee') AND NEW.requested_by IS DISTINCT FROM auth.uid()
 AND EXISTS(SELECT 1 FROM mobile_notification_rules WHERE domain_id=NEW.domain_id AND process='cultural' AND enabled)
 AND EXISTS(SELECT 1 FROM profiles WHERE id=NEW.requested_by AND is_active AND NOT coalesce(must_change_password,false)) AND is_domain_member(NEW.domain_id,NEW.requested_by) THEN
  PERFORM mobile_queue(NEW.requested_by,NEW.domain_id,'cultural',NEW.id,NEW.status,'cultural:'||NEW.id||':'||NEW.status);
 END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.cultural_mobile_result() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cultural_mobile_result AFTER UPDATE OF status,current_level ON public.cultural_programs FOR EACH ROW EXECUTE FUNCTION public.cultural_mobile_result();
NOTIFY pgrst,'reload schema';
COMMIT;
