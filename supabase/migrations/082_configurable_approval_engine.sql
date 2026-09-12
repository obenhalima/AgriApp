-- Migration 082 — Moteur transversal de validations configurables par domaine/type

BEGIN;

CREATE TABLE public.approval_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  process_code VARCHAR(50) NOT NULL,
  operation_type VARCHAR(80) NOT NULL DEFAULT '*',
  name VARCHAR(160) NOT NULL,
  validation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  responsible_role_id UUID REFERENCES public.roles(id) ON DELETE RESTRICT,
  approval_levels INTEGER NOT NULL DEFAULT 1 CHECK (approval_levels BETWEEN 1 AND 3),
  amount_threshold NUMERIC(14,2),
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain_id,process_code,operation_type),
  CHECK (process_code IN ('purchase_order','direct_purchase','stock_exit','stock_adjustment','treatment','phyto_receipt'))
);

CREATE TABLE public.approval_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES public.approval_policies(id) ON DELETE RESTRICT,
  process_code VARCHAR(50) NOT NULL,
  operation_type VARCHAR(80) NOT NULL DEFAULT '*',
  entity_id UUID NOT NULL,
  entity_reference VARCHAR(120),
  amount NUMERIC(14,2),
  status VARCHAR(30) NOT NULL DEFAULT 'soumise'
    CHECK(status IN ('soumise','approuvee','rejetee','annulee')),
  current_level INTEGER NOT NULL DEFAULT 1,
  required_levels INTEGER NOT NULL DEFAULT 1,
  requested_by UUID NOT NULL REFERENCES public.profiles(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(process_code,entity_id)
);

CREATE TABLE public.approval_decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  level_number INTEGER NOT NULL,
  decision VARCHAR(20) NOT NULL CHECK(decision IN ('approuvee','rejetee','automatique')),
  decided_by UUID REFERENCES public.profiles(id),
  comment TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(request_id,level_number)
);

CREATE INDEX idx_approval_policies_lookup ON public.approval_policies(domain_id,process_code,operation_type,is_active);
CREATE INDEX idx_approval_requests_domain_status ON public.approval_requests(domain_id,status,process_code);
CREATE INDEX idx_approval_decisions_request ON public.approval_decisions(request_id);

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS purchase_type VARCHAR(30) NOT NULL DEFAULT 'standard';

CREATE OR REPLACE FUNCTION public.resolve_approval_policy(p_domain UUID,p_process TEXT,p_type TEXT DEFAULT '*',p_amount NUMERIC DEFAULT NULL)
RETURNS public.approval_policies LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT ap.* FROM approval_policies ap
  WHERE ap.domain_id=p_domain AND ap.process_code=p_process AND ap.is_active
    AND ap.operation_type IN (COALESCE(NULLIF(p_type,''),'*'),'*')
    AND (ap.amount_threshold IS NULL OR COALESCE(p_amount,0)>=ap.amount_threshold)
  ORDER BY (ap.operation_type=COALESCE(NULLIF(p_type,''),'*')) DESC,
           ap.amount_threshold DESC NULLS LAST,ap.priority ASC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_validate_policy(p_policy UUID,p_user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_platform_admin(p_user) OR public.is_domain_admin(ap.domain_id,p_user)
    OR EXISTS(SELECT 1 FROM domain_memberships dm WHERE dm.domain_id=ap.domain_id AND dm.user_id=p_user
      AND dm.role_id=ap.responsible_role_id AND dm.is_active)
  FROM approval_policies ap WHERE ap.id=p_policy;
$$;

CREATE OR REPLACE FUNCTION public.submit_approval_request(p_process TEXT,p_type TEXT,p_entity UUID,p_reference TEXT,p_amount NUMERIC,p_comment TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_domain UUID; v_policy approval_policies%ROWTYPE; v_id UUID; v_enabled BOOLEAN;
BEGIN
  IF p_process='purchase_order' THEN SELECT domain_id INTO v_domain FROM purchase_orders WHERE id=p_entity;
  ELSIF p_process='treatment' THEN SELECT domain_id INTO v_domain FROM treatment_requests WHERE id=p_entity;
  ELSIF p_process='stock_exit' THEN SELECT domain_id INTO v_domain FROM stock_exit_requests WHERE id=p_entity;
  ELSE RAISE EXCEPTION 'Processus non pris en charge pour la soumission'; END IF;
  IF v_domain IS NULL OR NOT is_domain_member(v_domain,auth.uid()) THEN RAISE EXCEPTION 'Entité inaccessible'; END IF;
  IF p_process='purchase_order' AND NOT has_domain_permission(v_domain,auth.uid(),'achats','create') THEN RAISE EXCEPTION 'Permission refusée'; END IF;
  SELECT * INTO v_policy FROM resolve_approval_policy(v_domain,p_process,p_type,p_amount);
  v_enabled:=FOUND AND v_policy.validation_enabled;
  INSERT INTO approval_requests(domain_id,policy_id,process_code,operation_type,entity_id,entity_reference,amount,status,current_level,required_levels,requested_by,completed_at,comment)
  VALUES(v_domain,CASE WHEN FOUND THEN v_policy.id END,p_process,COALESCE(NULLIF(p_type,''),'*'),p_entity,p_reference,p_amount,
    CASE WHEN v_enabled THEN 'soumise' ELSE 'approuvee' END,1,CASE WHEN FOUND THEN v_policy.approval_levels ELSE 1 END,auth.uid(),CASE WHEN v_enabled THEN NULL ELSE NOW() END,p_comment)
  ON CONFLICT(process_code,entity_id) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Cette entité possède déjà une demande de validation'; END IF;
  IF NOT v_enabled THEN INSERT INTO approval_decisions(request_id,domain_id,level_number,decision,comment) VALUES(v_id,v_domain,1,'automatique','Validation désactivée ou aucune règle applicable'); END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.review_approval_request(p_request UUID,p_approve BOOLEAN,p_comment TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v approval_requests%ROWTYPE;
BEGIN
  SELECT * INTO v FROM approval_requests WHERE id=p_request FOR UPDATE;
  IF NOT FOUND OR v.status<>'soumise' THEN RAISE EXCEPTION 'Demande introuvable ou déjà traitée'; END IF;
  IF v.requested_by=auth.uid() THEN RAISE EXCEPTION 'Le demandeur ne peut pas valider sa propre demande'; END IF;
  IF v.policy_id IS NULL OR NOT can_validate_policy(v.policy_id,auth.uid()) THEN RAISE EXCEPTION 'Validation réservée au rôle responsable'; END IF;
  IF NOT p_approve AND NULLIF(btrim(p_comment),'') IS NULL THEN RAISE EXCEPTION 'Le motif de rejet est obligatoire'; END IF;
  INSERT INTO approval_decisions(request_id,domain_id,level_number,decision,decided_by,comment)
  VALUES(v.id,v.domain_id,v.current_level,CASE WHEN p_approve THEN 'approuvee' ELSE 'rejetee' END,auth.uid(),p_comment);
  IF NOT p_approve THEN UPDATE approval_requests SET status='rejetee',completed_at=NOW(),updated_at=NOW() WHERE id=v.id;
  ELSIF v.current_level>=v.required_levels THEN UPDATE approval_requests SET status='approuvee',completed_at=NOW(),updated_at=NOW() WHERE id=v.id;
  ELSE UPDATE approval_requests SET current_level=current_level+1,updated_at=NOW() WHERE id=v.id; END IF;
END $$;

-- Une commande ne peut quitter le brouillon que si sa validation est acquise.
CREATE OR REPLACE FUNCTION public.guard_purchase_approval()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_policy approval_policies%ROWTYPE;
BEGIN
  IF NEW.status=OLD.status OR NEW.status IN ('brouillon','annule') THEN RETURN NEW; END IF;
  SELECT * INTO v_policy FROM resolve_approval_policy(NEW.domain_id,'purchase_order',COALESCE(NEW.purchase_type,'standard'),NEW.total_amount);
  IF FOUND AND v_policy.validation_enabled AND NOT EXISTS(
    SELECT 1 FROM approval_requests ar WHERE ar.process_code='purchase_order' AND ar.entity_id=NEW.id AND ar.status='approuvee'
  ) THEN RAISE EXCEPTION 'Le bon d’achat doit être validé par le responsable'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_purchase_approval ON public.purchase_orders;
CREATE TRIGGER trg_guard_purchase_approval BEFORE UPDATE OF status ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_approval();

-- Les validations 080 utilisent désormais le rôle configuré dans les politiques 082.
CREATE OR REPLACE FUNCTION public.is_domain_responsible(p_domain_id UUID,p_user_id UUID,p_module TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_platform_admin(p_user_id) OR public.is_domain_admin(p_domain_id,p_user_id)
    OR EXISTS(
      SELECT 1 FROM approval_policies ap JOIN domain_memberships dm
        ON dm.domain_id=ap.domain_id AND dm.role_id=ap.responsible_role_id
      WHERE ap.domain_id=p_domain_id AND ap.process_code=CASE WHEN p_module='agronomie' THEN 'treatment' ELSE 'stock_exit' END
        AND ap.is_active AND ap.validation_enabled AND dm.user_id=p_user_id AND dm.is_active
    );
$$;

CREATE OR REPLACE FUNCTION public.apply_optional_validation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_process TEXT; v_policy approval_policies%ROWTYPE;
BEGIN
  v_process:=CASE TG_TABLE_NAME WHEN 'treatment_requests' THEN 'treatment' ELSE 'stock_exit' END;
  SELECT * INTO v_policy FROM resolve_approval_policy(NEW.domain_id,v_process,'*',NULL);
  IF NOT FOUND OR NOT v_policy.validation_enabled THEN
    NEW.status:='approuvee'; NEW.approved_at:=NOW();
    -- approved_by reste NULL : approbation automatique identifiable.
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_optional_treatment_validation ON public.treatment_requests;
CREATE TRIGGER trg_optional_treatment_validation BEFORE INSERT ON public.treatment_requests
FOR EACH ROW EXECUTE FUNCTION public.apply_optional_validation();
DROP TRIGGER IF EXISTS trg_optional_stock_exit_validation ON public.stock_exit_requests;
CREATE TRIGGER trg_optional_stock_exit_validation BEFORE INSERT ON public.stock_exit_requests
FOR EACH ROW EXECUTE FUNCTION public.apply_optional_validation();

-- Règles initiales : validation active partout, chef d'exploitation responsable.
INSERT INTO approval_policies(domain_id,process_code,operation_type,name,validation_enabled,responsible_role_id,priority)
SELECT d.id,x.process,x.kind,x.label,TRUE,r.id,x.priority FROM domains d CROSS JOIN roles r CROSS JOIN (VALUES
 ('purchase_order','standard','Bon d’achat standard',10),('direct_purchase','direct','Achat direct',10),
 ('stock_exit','*','Sortie de stock',10),('stock_adjustment','*','Ajustement de stock',10),
 ('treatment','*','Traitement phytosanitaire',10),('phyto_receipt','*','Réception phytosanitaire',10)
) x(process,kind,label,priority) WHERE r.code='chef_exploitation'
ON CONFLICT(domain_id,process_code,operation_type) DO NOTHING;

ALTER TABLE approval_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY approval_policies_read ON approval_policies FOR SELECT TO authenticated USING(is_platform_admin(auth.uid()) OR is_domain_member(domain_id,auth.uid()));
CREATE POLICY approval_policies_write ON approval_policies FOR ALL TO authenticated USING(is_domain_admin(domain_id,auth.uid())) WITH CHECK(is_domain_admin(domain_id,auth.uid()));
CREATE POLICY approval_requests_read ON approval_requests FOR SELECT TO authenticated USING(is_platform_admin(auth.uid()) OR is_domain_member(domain_id,auth.uid()));
CREATE POLICY approval_decisions_read ON approval_decisions FOR SELECT TO authenticated USING(is_platform_admin(auth.uid()) OR is_domain_member(domain_id,auth.uid()));

REVOKE ALL ON FUNCTION submit_approval_request(TEXT,TEXT,UUID,TEXT,NUMERIC,TEXT),review_approval_request(UUID,BOOLEAN,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_approval_request(TEXT,TEXT,UUID,TEXT,NUMERIC,TEXT),review_approval_request(UUID,BOOLEAN,TEXT) TO authenticated;

COMMIT;
