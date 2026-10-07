-- Apply before deploying the workflow-transition Edge Function.
BEGIN;

-- A column trigger protects against OR-combined permissive profile policies.
CREATE OR REPLACE FUNCTION public.guard_profile_activation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.is_active IS DISTINCT FROM OLD.is_active
    AND coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
   IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active)
      OR NOT coalesce(can_manage_profile(OLD.id,auth.uid()),false) THEN
     RAISE EXCEPTION 'Activation du compte réservée à un administrateur actif autorisé' USING ERRCODE='42501';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_profile_activation BEFORE UPDATE OF is_active ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_activation();

-- Fix the shared administration helper too: suspended actors must not administer.
CREATE OR REPLACE FUNCTION public.can_manage_profile(p_target uuid,p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_platform_admin(p_actor) OR EXISTS(
   SELECT 1 FROM domain_memberships a
   JOIN profiles p ON p.id=a.user_id AND p.is_active
   JOIN domains d ON d.id=a.domain_id AND d.is_active
   JOIN roles r ON r.id=a.role_id AND r.is_admin AND r.is_active
   JOIN domain_memberships t ON t.domain_id=a.domain_id AND t.user_id=p_target AND t.is_active
   WHERE a.user_id=p_actor AND a.is_active
 );
$$;

-- Direct farm takes precedence, consistently with applicator/enrollment RPCs.
CREATE FUNCTION public.worker_access(p_farm uuid,p_team uuid,p_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT is_platform_admin(auth.uid()) OR EXISTS(
   SELECT 1 FROM farms f WHERE f.id=coalesce(p_farm,(SELECT farm_id FROM teams WHERE id=p_team))
   AND CASE WHEN p_action='view' THEN is_domain_member(f.domain_id,auth.uid())
       ELSE has_domain_permission(f.domain_id,auth.uid(),'rh_employes',p_action) END
 );
$$;
REVOKE ALL ON FUNCTION public.worker_access(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.worker_access(uuid,uuid,text) TO authenticated;
DROP POLICY IF EXISTS auth_read_workers ON public.workers;
DROP POLICY IF EXISTS admin_write_workers ON public.workers;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
-- Restrictive tenant fence also covers any additional existing permissive policy.
CREATE POLICY workers_tenant_fence ON public.workers AS RESTRICTIVE FOR ALL TO authenticated
 USING(worker_access(farm_id,team_id,'view')) WITH CHECK(worker_access(farm_id,team_id,'view'));
CREATE POLICY workers_scoped_read ON public.workers FOR SELECT TO authenticated USING(worker_access(farm_id,team_id,'view'));
CREATE POLICY workers_scoped_insert ON public.workers FOR INSERT TO authenticated WITH CHECK(worker_access(farm_id,team_id,'create'));
CREATE POLICY workers_scoped_update ON public.workers FOR UPDATE TO authenticated USING(worker_access(farm_id,team_id,'edit')) WITH CHECK(worker_access(farm_id,team_id,'edit'));
CREATE POLICY workers_scoped_delete ON public.workers FOR DELETE TO authenticated USING(worker_access(farm_id,team_id,'delete'));

-- Keep the public signature; never trust the caller's policy selector or amount.
CREATE OR REPLACE FUNCTION public.purchase_approval_amount(p_po uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p purchase_orders%ROWTYPE; amount numeric;
BEGIN
 SELECT * INTO p FROM purchase_orders WHERE id=p_po FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bon introuvable'; END IF;
 IF p.tax_amount IS NULL OR p.tax_amount<0 OR p.tax_amount::text IN ('NaN','Infinity','-Infinity')
    OR EXISTS(SELECT 1 FROM purchase_order_lines WHERE po_id=p_po AND
      (quantity IS NULL OR quantity<=0 OR unit_price IS NULL OR unit_price<0
       OR quantity::text IN ('NaN','Infinity','-Infinity') OR unit_price::text IN ('NaN','Infinity','-Infinity'))) THEN
   RAISE EXCEPTION 'Quantité, prix ou taxe invalide';
 END IF;
 -- Stored monetary line_total uses two decimals; preserve fractional-quantity purchases.
 SELECT coalesce(sum(round(quantity*unit_price,2)),0)+p.tax_amount INTO amount FROM purchase_order_lines WHERE po_id=p_po;
 IF p.total_amount IS DISTINCT FROM amount THEN RAISE EXCEPTION 'Le total du bon ne correspond pas à ses lignes et taxes'; END IF;
 RETURN amount;
END $$;
REVOKE ALL ON FUNCTION public.purchase_approval_amount(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.submit_approval_request(p_process text,p_type text,p_entity uuid,p_reference text,p_amount numeric,p_comment text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d uuid; typ text; amount numeric; ref text; policy approval_policies%ROWTYPE; request uuid; enabled boolean;
BEGIN
 IF p_process='purchase_order' THEN
   SELECT domain_id,purchase_type,total_amount,po_number INTO d,typ,amount,ref FROM purchase_orders WHERE id=p_entity FOR UPDATE;
   IF typ IS NULL OR typ NOT IN ('standard','direct') THEN RAISE EXCEPTION 'Type de bon invalide'; END IF;
   IF amount IS NULL OR amount<0 OR amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Montant de bon invalide'; END IF;
 ELSIF p_process='treatment' THEN
   SELECT domain_id INTO d FROM treatment_requests WHERE id=p_entity FOR UPDATE;
   typ:='*'; amount:=NULL; ref:=p_entity::text;
 ELSIF p_process='stock_exit' THEN
   SELECT domain_id INTO d FROM stock_exit_requests WHERE id=p_entity FOR UPDATE;
   typ:='*'; amount:=NULL; ref:=p_entity::text;
 ELSE RAISE EXCEPTION 'Processus non pris en charge pour la soumission'; END IF;
 IF d IS NULL OR NOT coalesce(is_domain_member(d,auth.uid()),false) THEN RAISE EXCEPTION 'Entité inaccessible' USING ERRCODE='42501'; END IF;
 IF p_process='purchase_order' AND NOT coalesce(has_domain_permission(d,auth.uid(),'achats','create'),false) THEN RAISE EXCEPTION 'Permission refusée' USING ERRCODE='42501'; END IF;
 IF p_process='purchase_order' THEN amount:=purchase_approval_amount(p_entity); END IF;
 SELECT * INTO policy FROM resolve_approval_policy(d,p_process,typ,amount);
 enabled:=coalesce(policy.validation_enabled,false);
 INSERT INTO approval_requests(domain_id,policy_id,process_code,operation_type,entity_id,entity_reference,amount,status,current_level,required_levels,requested_by,completed_at,comment)
 VALUES(d,policy.id,p_process,typ,p_entity,ref,amount,CASE WHEN enabled THEN 'soumise' ELSE 'approuvee' END,1,coalesce(policy.approval_levels,1),auth.uid(),CASE WHEN enabled THEN NULL ELSE now() END,p_comment)
 ON CONFLICT(process_code,entity_id) DO NOTHING RETURNING id INTO request;
 IF request IS NULL THEN RAISE EXCEPTION 'Cette entité possède déjà une demande de validation'; END IF;
 IF NOT enabled THEN INSERT INTO approval_decisions(request_id,domain_id,level_number,decision,comment) VALUES(request,d,1,'automatique','Validation désactivée ou aucune règle applicable'); END IF;
 RETURN request;
END $$;

-- Reject unknown persisted selectors and stale approvals at the consumption boundary.
CREATE OR REPLACE FUNCTION public.guard_purchase_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE policy approval_policies%ROWTYPE;
BEGIN
 IF NEW.purchase_type IS NULL OR NEW.purchase_type NOT IN ('standard','direct') THEN RAISE EXCEPTION 'Type de bon invalide'; END IF;
 IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.purchase_type IS NOT DISTINCT FROM OLD.purchase_type
    AND NEW.total_amount IS NOT DISTINCT FROM OLD.total_amount
    AND NEW.tax_amount IS NOT DISTINCT FROM OLD.tax_amount THEN RETURN NEW; END IF;
 IF NEW.status IN ('brouillon','annule') THEN RETURN NEW; END IF;
 -- On creation no lines can exist yet; creation in a received/sent state is not a valid workflow.
 IF TG_OP='INSERT' THEN RAISE EXCEPTION 'Créer le bon en brouillon puis le soumettre'; END IF;
 PERFORM purchase_approval_amount(NEW.id);
 IF NEW.total_amount IS DISTINCT FROM OLD.total_amount OR NEW.purchase_type IS DISTINCT FROM OLD.purchase_type
    OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount THEN RAISE EXCEPTION 'Revenir au brouillon avant de modifier les conditions du bon'; END IF;
 SELECT * INTO policy FROM resolve_approval_policy(NEW.domain_id,'purchase_order',NEW.purchase_type,NEW.total_amount);
 IF coalesce(policy.validation_enabled,false) AND NOT EXISTS(
   SELECT 1 FROM approval_requests a WHERE a.process_code='purchase_order' AND a.entity_id=NEW.id
   AND a.domain_id=NEW.domain_id AND a.status='approuvee' AND a.policy_id=policy.id
   AND a.operation_type=NEW.purchase_type AND a.amount IS NOT DISTINCT FROM NEW.total_amount
 ) THEN RAISE EXCEPTION 'Le bon d’achat doit être validé par le responsable pour ce type et ce montant'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_purchase_approval ON public.purchase_orders;
CREATE TRIGGER trg_guard_purchase_approval BEFORE INSERT OR UPDATE OF status,purchase_type,total_amount,tax_amount ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_approval();

-- Freeze original lines after submission; substitutions use their separate audited workflow.
CREATE FUNCTION public.guard_submitted_purchase_lines()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ids uuid[]; item uuid;
BEGIN
 IF TG_OP='INSERT' THEN ids:=ARRAY[NEW.po_id];
 ELSIF TG_OP='DELETE' THEN ids:=ARRAY[OLD.po_id];
 ELSE ids:=ARRAY[OLD.po_id,NEW.po_id]; END IF;
 FOR item IN SELECT DISTINCT unnest(ids) ORDER BY 1 LOOP
   PERFORM 1 FROM purchase_orders WHERE id=item FOR UPDATE;
   IF EXISTS(SELECT 1 FROM approval_requests WHERE process_code='purchase_order' AND entity_id=item
      AND status IN ('soumise','approuvee')) THEN
     -- Receipt only changes received_qty; original terms stay untouched.
     IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'received_qty') IS NOT DISTINCT FROM (to_jsonb(OLD)-'received_qty') THEN CONTINUE; END IF;
     RAISE EXCEPTION 'Les lignes d’un bon soumis sont verrouillées';
   END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_submitted_purchase_lines BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_order_lines
FOR EACH ROW EXECUTE FUNCTION public.guard_submitted_purchase_lines();

-- Every new receipt revalidates old approvals against the actual lines and current policy.
CREATE FUNCTION public.guard_receipt_approval_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p purchase_orders%ROWTYPE; policy approval_policies%ROWTYPE; v_amount numeric;
BEGIN
 SELECT * INTO p FROM purchase_orders WHERE id=NEW.po_id FOR UPDATE;
 v_amount:=purchase_approval_amount(p.id);
 IF p.purchase_type IS NULL OR p.purchase_type NOT IN ('standard','direct') THEN RAISE EXCEPTION 'Type de bon invalide'; END IF;
 SELECT * INTO policy FROM resolve_approval_policy(p.domain_id,'purchase_order',p.purchase_type,v_amount);
 IF coalesce(policy.validation_enabled,false) AND NOT EXISTS(
   SELECT 1 FROM approval_requests a WHERE a.entity_id=p.id AND a.process_code='purchase_order'
   AND a.domain_id=p.domain_id AND a.status='approuvee' AND a.policy_id=policy.id
   AND a.operation_type=p.purchase_type AND a.amount IS NOT DISTINCT FROM v_amount
 ) THEN RAISE EXCEPTION 'Validation responsable requise pour les lignes actuelles'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_receipt_approval_snapshot BEFORE INSERT ON public.costed_purchase_receipts
FOR EACH ROW EXECUTE FUNCTION public.guard_receipt_approval_snapshot();

CREATE FUNCTION public.apply_authorized_workflow_transition(p_entity_type text,p_entity_id uuid,p_transition_id uuid,p_comment text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d uuid; current_status text; tr record; module_code text; target_table text;
BEGIN
 IF p_entity_type='purchase_order' THEN
   target_table:='purchase_orders'; module_code:='achats';
   SELECT domain_id,status::text INTO d,current_status FROM purchase_orders WHERE id=p_entity_id FOR UPDATE;
 ELSIF p_entity_type='sales_order' THEN
   target_table:='sales_orders'; module_code:='commandes';
   -- Legacy sales orders have no domain_id: ownership comes from their campaign.
   SELECT c.domain_id,o.status::text INTO d,current_status
   FROM sales_orders o LEFT JOIN campaigns c ON c.id=o.campaign_id
   WHERE o.id=p_entity_id FOR UPDATE OF o;
 ELSE RAISE EXCEPTION 'Type d’entité non pris en charge'; END IF;
 IF current_status IS NULL OR NOT coalesce(has_domain_permission(d,auth.uid(),module_code,'edit'),false) THEN
   RAISE EXCEPTION 'Entité inaccessible ou permission refusée' USING ERRCODE='42501';
 END IF;
 SELECT t.id,t.definition_id,s.code AS from_code,z.code AS to_code,t.requires_approval INTO tr
 FROM workflow_transitions t JOIN workflow_definitions w ON w.id=t.definition_id
 JOIN workflow_states s ON s.id=t.from_state_id AND s.definition_id=w.id
 JOIN workflow_states z ON z.id=t.to_state_id AND z.definition_id=w.id
 WHERE t.id=p_transition_id AND t.is_active AND w.is_active AND w.entity_type=p_entity_type;
 IF NOT FOUND OR tr.from_code IS DISTINCT FROM current_status THEN RAISE EXCEPTION 'Transition invalide pour l’état actuel'; END IF;
 IF tr.requires_approval AND NOT coalesce(has_domain_permission(d,auth.uid(),module_code,'admin'),false) THEN
   RAISE EXCEPTION 'Transition réservée au responsable' USING ERRCODE='42501';
 END IF;
 -- Literal status supports the existing enum and text columns; identifiers are allowlisted.
 EXECUTE format('UPDATE public.%I SET status=%L,updated_at=now() WHERE id=$1',target_table,tr.to_code) USING p_entity_id;
 INSERT INTO workflow_history(entity_type,entity_id,definition_id,transition_id,from_state_code,to_state_code,performed_by,comment)
 VALUES(p_entity_type,p_entity_id,tr.definition_id,tr.id,tr.from_code,tr.to_code,auth.uid(),p_comment);
 RETURN jsonb_build_object('to_state',tr.to_code);
END $$;
REVOKE ALL ON FUNCTION public.apply_authorized_workflow_transition(text,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_authorized_workflow_transition(text,uuid,uuid,text) TO authenticated;
COMMIT;
