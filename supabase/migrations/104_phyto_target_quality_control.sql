-- Migration 104 — Qualité et validation des cibles issues des imports
BEGIN;

ALTER TABLE public.phyto_targets
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.is_plausible_phyto_target(p_value TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN NULLIF(btrim(p_value),'') IS NULL THEN FALSE
    WHEN length(btrim(p_value))<2 OR length(btrim(p_value))>160 THEN FALSE
    WHEN lower(btrim(p_value)) IN ('n.a','n.a.','na','n/a','non applicable','cible à identifier','cible non reconnue') THEN FALSE
    WHEN btrim(p_value) ~ '^[0-9.,% /-]+$' THEN FALSE
    WHEN lower(p_value) ~ '(préventif|preventif|apparition|premières attaques|premieres attaques|application|pulvérisation|pulverisation|traitement)' THEN FALSE
    WHEN lower(p_value) ~ '(^|[^a-z])(ml|cl|dl|l|g|kg)[[:space:]]*/?[[:space:]]*(ha|hl|100[[:space:]]*l|1000[[:space:]]*m2)($|[^a-z])' THEN FALSE
    ELSE TRUE END
$$;

-- Le socle initial est connu et validé.
UPDATE public.phyto_targets SET is_verified=TRUE,verified_at=COALESCE(verified_at,created_at)
WHERE canonical_name IN ('Tuta absoluta','Mouche blanche','Thrips','Puceron','Acariens','Oïdium','Botrytis','Mildiou','Alternariose','Cladosporiose','Fusariose','Nématodes');

-- Les lignes mal interprétées retournent au contrôle manuel, en conservant raw_data.
UPDATE public.phyto_positive_list_entries e
SET target_id=NULL,target_label='Cible à identifier',review_status='a_controler',
    station_approved=FALSE,station_approved_by=NULL,station_approved_at=NULL
WHERE NOT public.is_plausible_phyto_target(e.target_label)
   OR e.target_id IN (SELECT id FROM public.phyto_targets WHERE NOT public.is_plausible_phyto_target(canonical_name));

UPDATE public.phyto_targets
SET is_active=FALSE,is_verified=FALSE,updated_at=NOW(),updated_by=auth.uid()
WHERE NOT public.is_plausible_phyto_target(canonical_name);

CREATE OR REPLACE FUNCTION public.verify_phyto_target(p_domain UUID,p_target_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public.has_domain_permission(p_domain,auth.uid(),'agronomie','edit') THEN RAISE EXCEPTION 'Permission insuffisante'; END IF;
  UPDATE phyto_targets SET is_verified=TRUE,is_active=TRUE,verified_at=NOW(),verified_by=auth.uid(),updated_at=NOW(),updated_by=auth.uid()
   WHERE id=p_target_id AND merged_into_id IS NULL AND public.is_plausible_phyto_target(canonical_name)
   RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Cible introuvable ou non valide'; END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.verify_phyto_target(UUID,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_phyto_target(UUID,UUID) TO authenticated;

CREATE OR REPLACE VIEW public.v_active_station_phyto_products
WITH (security_invoker=TRUE) AS
SELECT
  e.domain_id,e.list_id,l.version,e.target_id,t.canonical_name AS target_name,
  e.product_id,e.authorized_use_id,e.commercial_name,e.station_approved,
  p.authorization_status,p.safety_data_verified,p.is_active,
  EXISTS(SELECT 1 FROM public.stock_items si WHERE si.domain_id=e.domain_id AND si.plant_protection_product_id=e.product_id AND si.category='phytosanitaires' AND si.is_active) AS linked_to_stock,
  (e.station_approved AND t.is_verified AND p.authorization_status='autorise' AND p.safety_data_verified AND p.is_active AND e.authorized_use_id IS NOT NULL) AS regulatory_ready
FROM public.phyto_positive_list_entries e
JOIN public.phyto_positive_lists l ON l.id=e.list_id AND l.status='active'
JOIN public.plant_protection_products p ON p.id=e.product_id
JOIN public.phyto_targets t ON t.id=e.target_id AND t.is_active AND t.is_verified
WHERE e.review_status='valide' AND e.station_approved;

GRANT SELECT ON public.v_active_station_phyto_products TO authenticated;
COMMIT;
