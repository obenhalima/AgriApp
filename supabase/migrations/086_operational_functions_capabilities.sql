-- Migration 086 — Fonctions opérationnelles, habilitations et séparation des tâches
BEGIN;

CREATE TABLE public.operational_functions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(80) UNIQUE NOT NULL,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.business_capabilities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(180) NOT NULL,
  process_code VARCHAR(50),
  description TEXT,
  is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.function_capabilities (
  function_id UUID NOT NULL REFERENCES public.operational_functions(id) ON DELETE CASCADE,
  capability_id UUID NOT NULL REFERENCES public.business_capabilities(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(function_id,capability_id)
);

CREATE TABLE public.user_function_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  farm_id UUID REFERENCES public.farms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  function_id UUID NOT NULL REFERENCES public.operational_functions(id) ON DELETE RESTRICT,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(valid_until IS NULL OR valid_until>=valid_from)
);
CREATE UNIQUE INDEX uq_active_user_function_scope ON public.user_function_assignments(
  domain_id,user_id,function_id,COALESCE(farm_id,'00000000-0000-0000-0000-000000000000'::UUID)
) WHERE is_active AND valid_until IS NULL;

CREATE TABLE public.user_capability_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  farm_id UUID REFERENCES public.farms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  capability_id UUID NOT NULL REFERENCES public.business_capabilities(id) ON DELETE CASCADE,
  granted BOOLEAN NOT NULL,
  reason TEXT,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(valid_until IS NULL OR valid_until>=valid_from)
);
CREATE UNIQUE INDEX uq_user_capability_scope ON public.user_capability_overrides(
  domain_id,user_id,capability_id,COALESCE(farm_id,'00000000-0000-0000-0000-000000000000'::UUID)
) WHERE valid_until IS NULL;

CREATE TABLE public.approval_policy_levels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES public.approval_policies(id) ON DELETE CASCADE,
  level_number INTEGER NOT NULL CHECK(level_number BETWEEN 1 AND 3),
  required_capability_id UUID REFERENCES public.business_capabilities(id) ON DELETE RESTRICT,
  responsible_role_id UUID REFERENCES public.roles(id) ON DELETE RESTRICT,
  name VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(policy_id,level_number),
  CHECK(required_capability_id IS NOT NULL OR responsible_role_id IS NOT NULL)
);

CREATE TABLE public.organization_security_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_function_assignments_user ON public.user_function_assignments(domain_id,user_id,is_active);
CREATE INDEX idx_capability_overrides_user ON public.user_capability_overrides(domain_id,user_id,capability_id);
CREATE INDEX idx_policy_levels_policy ON public.approval_policy_levels(policy_id,level_number);
CREATE INDEX idx_org_security_audit_domain ON public.organization_security_audit(domain_id,created_at DESC);

INSERT INTO public.operational_functions(code,name,description,is_system) VALUES
 ('responsable_exploitation','Responsable d’exploitation et technique','Pilote, arbitre et coordonne l’exploitation.',TRUE),
 ('responsable_phytosanitaire','Responsable phytosanitaire','Prescrit, contrôle et confirme les traitements.',TRUE),
 ('responsable_fertigation','Responsable fertigation','Définit et supervise la stratégie de fertigation.',TRUE),
 ('charge_irrigation','Chargé d’irrigation et de fertigation','Exécute les programmes et relève les mesures.',TRUE),
 ('caporal','Caporal ou responsable des travaux','Organise les équipes et contrôle les travaux.',TRUE),
 ('gestionnaire_administratif','Gestionnaire administratif, traçabilité et stocks','Enregistre, contrôle et garantit la traçabilité.',TRUE)
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,is_active=TRUE;

INSERT INTO public.business_capabilities(code,name,process_code,is_sensitive,is_system) VALUES
 ('treatment.prescribe','Prescrire un traitement','treatment',FALSE,TRUE),
 ('treatment.validate','Valider un traitement','treatment',TRUE,TRUE),
 ('treatment.confirm_application','Confirmer une application','treatment',TRUE,TRUE),
 ('dar.override','Autoriser une dérogation DAR','harvest',TRUE,TRUE),
 ('stock_exit.request','Demander une sortie de stock','stock_exit',FALSE,TRUE),
 ('stock_exit.validate','Valider une sortie de stock','stock_exit',TRUE,TRUE),
 ('stock_exit.execute','Exécuter une sortie de stock','stock_exit',TRUE,TRUE),
 ('purchase.request','Demander un achat','purchase_order',FALSE,TRUE),
 ('purchase.validate','Valider un achat','purchase_order',TRUE,TRUE),
 ('timekeeping.validate','Valider un pointage','timekeeping',TRUE,TRUE),
 ('payroll.close','Clôturer une période de paie','payroll',TRUE,TRUE)
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,process_code=EXCLUDED.process_code,is_sensitive=EXCLUDED.is_sensitive,is_active=TRUE;

INSERT INTO public.function_capabilities(function_id,capability_id)
SELECT f.id,c.id FROM (VALUES
 ('responsable_exploitation','treatment.validate'),('responsable_exploitation','dar.override'),
 ('responsable_exploitation','stock_exit.validate'),('responsable_exploitation','purchase.validate'),
 ('responsable_exploitation','timekeeping.validate'),('responsable_exploitation','payroll.close'),
 ('responsable_phytosanitaire','treatment.prescribe'),('responsable_phytosanitaire','treatment.validate'),
 ('responsable_phytosanitaire','treatment.confirm_application'),('responsable_phytosanitaire','stock_exit.request'),
 ('responsable_fertigation','stock_exit.request'),('charge_irrigation','stock_exit.request'),
 ('caporal','timekeeping.validate'),('gestionnaire_administratif','stock_exit.execute'),
 ('gestionnaire_administratif','purchase.request')
) x(function_code,capability_code)
JOIN public.operational_functions f ON f.code=x.function_code
JOIN public.business_capabilities c ON c.code=x.capability_code
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_business_capability(
  p_domain UUID,p_user UUID,p_capability TEXT,p_farm UUID DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(
    (SELECT uco.granted FROM user_capability_overrides uco
     JOIN business_capabilities bc ON bc.id=uco.capability_id
     WHERE uco.domain_id=p_domain AND uco.user_id=p_user AND bc.code=p_capability
       AND (uco.farm_id=p_farm OR uco.farm_id IS NULL)
       AND uco.valid_from<=CURRENT_DATE AND (uco.valid_until IS NULL OR uco.valid_until>=CURRENT_DATE)
     ORDER BY (uco.farm_id IS NOT NULL) DESC LIMIT 1),
    EXISTS(SELECT 1 FROM user_function_assignments ufa
      JOIN function_capabilities fc ON fc.function_id=ufa.function_id
      JOIN business_capabilities bc ON bc.id=fc.capability_id
      WHERE ufa.domain_id=p_domain AND ufa.user_id=p_user AND bc.code=p_capability
        AND ufa.is_active AND (ufa.farm_id IS NULL OR ufa.farm_id=p_farm)
        AND ufa.valid_from<=CURRENT_DATE AND (ufa.valid_until IS NULL OR ufa.valid_until>=CURRENT_DATE)),
    FALSE
  );
$$;

-- Compatibilité des workflows 080 : dès qu'un utilisateur possède une configuration
-- organisationnelle dans la société, seules ses habilitations métier s'appliquent.
-- Le rôle historique reste accepté uniquement pour les utilisateurs non encore configurés.
CREATE OR REPLACE FUNCTION public.is_domain_responsible(p_domain_id UUID,p_user_id UUID,p_module TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT has_business_capability(
      p_domain_id,p_user_id,
      CASE WHEN p_module='agronomie' THEN 'treatment.validate' ELSE 'stock_exit.validate' END,
      NULL
    )
    OR (
      NOT EXISTS(SELECT 1 FROM user_function_assignments ufa
        WHERE ufa.domain_id=p_domain_id AND ufa.user_id=p_user_id AND ufa.is_active
          AND ufa.valid_from<=CURRENT_DATE AND (ufa.valid_until IS NULL OR ufa.valid_until>=CURRENT_DATE))
      AND NOT EXISTS(SELECT 1 FROM user_capability_overrides uco
        WHERE uco.domain_id=p_domain_id AND uco.user_id=p_user_id AND uco.valid_until IS NULL)
      AND EXISTS(
        SELECT 1 FROM approval_policies ap JOIN domain_memberships dm
          ON dm.domain_id=ap.domain_id AND dm.role_id=ap.responsible_role_id
        WHERE ap.domain_id=p_domain_id
          AND ap.process_code=CASE WHEN p_module='agronomie' THEN 'treatment' ELSE 'stock_exit' END
          AND ap.is_active AND ap.validation_enabled AND dm.user_id=p_user_id AND dm.is_active
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_validate_approval_level(p_policy UUID,p_level INTEGER,p_user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(
    SELECT 1 FROM approval_policies ap
    JOIN approval_policy_levels apl ON apl.policy_id=ap.id AND apl.level_number=p_level
    LEFT JOIN business_capabilities bc ON bc.id=apl.required_capability_id
    WHERE ap.id=p_policy AND (
      (bc.id IS NOT NULL AND has_business_capability(ap.domain_id,p_user,bc.code,NULL))
      OR (apl.responsible_role_id IS NOT NULL AND EXISTS(
        SELECT 1 FROM domain_memberships dm WHERE dm.domain_id=ap.domain_id
          AND dm.user_id=p_user AND dm.role_id=apl.responsible_role_id AND dm.is_active
      ))
    )
  );
$$;

INSERT INTO public.approval_policy_levels(policy_id,level_number,required_capability_id,responsible_role_id,name)
SELECT ap.id,n,
  (SELECT id FROM business_capabilities WHERE code=CASE
    WHEN ap.process_code='treatment' THEN 'treatment.validate'
    WHEN ap.process_code IN ('stock_exit','stock_adjustment','phyto_receipt') THEN 'stock_exit.validate'
    ELSE 'purchase.validate' END),
  ap.responsible_role_id,'Niveau '||n
FROM approval_policies ap CROSS JOIN LATERAL generate_series(1,ap.approval_levels) n
ON CONFLICT(policy_id,level_number) DO NOTHING;

CREATE OR REPLACE FUNCTION public.review_approval_request(p_request UUID,p_approve BOOLEAN,p_comment TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v approval_requests%ROWTYPE;
BEGIN
  SELECT * INTO v FROM approval_requests WHERE id=p_request FOR UPDATE;
  IF NOT FOUND OR v.status<>'soumise' THEN RAISE EXCEPTION 'Demande introuvable ou déjà traitée'; END IF;
  IF v.requested_by=auth.uid() THEN RAISE EXCEPTION 'Le demandeur ne peut pas valider sa propre demande'; END IF;
  IF EXISTS(SELECT 1 FROM approval_decisions WHERE request_id=v.id AND decided_by=auth.uid()) THEN
    RAISE EXCEPTION 'Une même personne ne peut intervenir qu’une fois dans ce circuit';
  END IF;
  IF v.policy_id IS NULL OR NOT can_validate_approval_level(v.policy_id,v.current_level,auth.uid()) THEN
    RAISE EXCEPTION 'Vous ne possédez pas l’habilitation requise pour ce niveau';
  END IF;
  IF NOT p_approve AND NULLIF(btrim(p_comment),'') IS NULL THEN RAISE EXCEPTION 'Le motif de rejet est obligatoire'; END IF;
  INSERT INTO approval_decisions(request_id,domain_id,level_number,decision,decided_by,comment)
  VALUES(v.id,v.domain_id,v.current_level,CASE WHEN p_approve THEN 'approuvee' ELSE 'rejetee' END,auth.uid(),p_comment);
  IF NOT p_approve THEN UPDATE approval_requests SET status='rejetee',completed_at=NOW(),updated_at=NOW() WHERE id=v.id;
  ELSIF v.current_level>=v.required_levels THEN UPDATE approval_requests SET status='approuvee',completed_at=NOW(),updated_at=NOW() WHERE id=v.id;
  ELSE UPDATE approval_requests SET current_level=current_level+1,updated_at=NOW() WHERE id=v.id; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_approval_policy_levels(p_policy UUID,p_levels JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_domain UUID; v_before JSONB;
BEGIN
  SELECT domain_id INTO v_domain FROM approval_policies WHERE id=p_policy;
  IF v_domain IS NULL OR NOT is_domain_admin(v_domain,auth.uid()) THEN RAISE EXCEPTION 'Administration refusée'; END IF;
  SELECT jsonb_agg(to_jsonb(x) ORDER BY level_number) INTO v_before FROM approval_policy_levels x WHERE policy_id=p_policy;
  DELETE FROM approval_policy_levels WHERE policy_id=p_policy;
  INSERT INTO approval_policy_levels(policy_id,level_number,required_capability_id,responsible_role_id,name)
  SELECT p_policy,(x->>'level_number')::INTEGER,NULLIF(x->>'required_capability_id','')::UUID,
    NULLIF(x->>'responsible_role_id','')::UUID,NULLIF(x->>'name','')
  FROM jsonb_array_elements(COALESCE(p_levels,'[]'::JSONB)) x;
  INSERT INTO organization_security_audit(domain_id,actor_id,action,entity_type,entity_id,before_data,after_data)
  VALUES(v_domain,auth.uid(),'approval_levels_updated','approval_policy',p_policy,v_before,p_levels);
END $$;

CREATE OR REPLACE FUNCTION public.set_user_organization_config(
  p_user UUID,p_domain UUID,p_functions JSONB,p_overrides JSONB
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_before JSONB;
BEGIN
  IF NOT can_manage_profile(p_user,auth.uid()) OR NOT is_domain_admin(p_domain,auth.uid()) THEN
    RAISE EXCEPTION 'Administration refusée pour cette société';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM domain_memberships WHERE domain_id=p_domain AND user_id=p_user AND is_active) THEN
    RAISE EXCEPTION 'L’utilisateur n’appartient pas à cette société';
  END IF;
  SELECT jsonb_build_object(
    'functions',(SELECT jsonb_agg(to_jsonb(x)) FROM user_function_assignments x WHERE x.user_id=p_user AND x.domain_id=p_domain AND x.is_active),
    'overrides',(SELECT jsonb_agg(to_jsonb(x)) FROM user_capability_overrides x WHERE x.user_id=p_user AND x.domain_id=p_domain AND x.valid_until IS NULL)
  ) INTO v_before;
  UPDATE user_function_assignments SET is_active=FALSE,valid_until=COALESCE(valid_until,CURRENT_DATE),updated_at=NOW()
  WHERE user_id=p_user AND domain_id=p_domain AND is_active;
  INSERT INTO user_function_assignments(domain_id,farm_id,user_id,function_id,valid_from,is_active,assigned_by)
  SELECT p_domain,NULLIF(x->>'farm_id','')::UUID,p_user,(x->>'function_id')::UUID,
    COALESCE(NULLIF(x->>'valid_from','')::DATE,CURRENT_DATE),TRUE,auth.uid()
  FROM jsonb_array_elements(COALESCE(p_functions,'[]'::JSONB)) x;
  UPDATE user_capability_overrides SET valid_until=CURRENT_DATE,updated_at=NOW()
  WHERE user_id=p_user AND domain_id=p_domain AND valid_until IS NULL;
  INSERT INTO user_capability_overrides(domain_id,farm_id,user_id,capability_id,granted,reason,assigned_by)
  SELECT p_domain,NULLIF(x->>'farm_id','')::UUID,p_user,(x->>'capability_id')::UUID,
    (x->>'granted')::BOOLEAN,NULLIF(x->>'reason',''),auth.uid()
  FROM jsonb_array_elements(COALESCE(p_overrides,'[]'::JSONB)) x;
  INSERT INTO organization_security_audit(domain_id,target_user_id,actor_id,action,entity_type,before_data,after_data)
  VALUES(p_domain,p_user,auth.uid(),'user_organization_updated','profile',v_before,
    jsonb_build_object('functions',p_functions,'overrides',p_overrides));
END $$;

ALTER TABLE operational_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE function_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_function_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_capability_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_policy_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_security_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY operational_functions_read ON operational_functions FOR SELECT TO authenticated USING(TRUE);
CREATE POLICY business_capabilities_read ON business_capabilities FOR SELECT TO authenticated USING(TRUE);
CREATE POLICY function_capabilities_read ON function_capabilities FOR SELECT TO authenticated USING(TRUE);
CREATE POLICY user_functions_read ON user_function_assignments FOR SELECT TO authenticated
  USING(is_platform_admin(auth.uid()) OR is_domain_member(domain_id,auth.uid()));
CREATE POLICY user_overrides_read ON user_capability_overrides FOR SELECT TO authenticated
  USING(is_platform_admin(auth.uid()) OR is_domain_member(domain_id,auth.uid()));
CREATE POLICY approval_policy_levels_read ON approval_policy_levels FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM approval_policies ap WHERE ap.id=policy_id AND (is_platform_admin(auth.uid()) OR is_domain_member(ap.domain_id,auth.uid()))));
CREATE POLICY organization_audit_read ON organization_security_audit FOR SELECT TO authenticated
  USING(is_platform_admin(auth.uid()) OR is_domain_admin(domain_id,auth.uid()));

REVOKE ALL ON FUNCTION public.has_business_capability(UUID,UUID,TEXT,UUID),public.is_domain_responsible(UUID,UUID,TEXT),public.can_validate_approval_level(UUID,INTEGER,UUID),public.sync_approval_policy_levels(UUID,JSONB),public.set_user_organization_config(UUID,UUID,JSONB,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_business_capability(UUID,UUID,TEXT,UUID),public.is_domain_responsible(UUID,UUID,TEXT),public.can_validate_approval_level(UUID,INTEGER,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_approval_policy_levels(UUID,JSONB),public.set_user_organization_config(UUID,UUID,JSONB,JSONB) TO authenticated;

COMMIT;
