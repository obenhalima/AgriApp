-- Migration 102 — Administration du référentiel des cibles biologiques
BEGIN;

ALTER TABLE public.phyto_targets
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES public.phyto_targets(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.save_phyto_target(
  p_domain UUID,p_target_id UUID,p_name TEXT,p_category TEXT,p_aliases TEXT[],p_is_active BOOLEAN DEFAULT TRUE
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public.has_domain_permission(p_domain,auth.uid(),'agronomie','edit') THEN RAISE EXCEPTION 'Permission insuffisante'; END IF;
  IF NULLIF(btrim(p_name),'') IS NULL THEN RAISE EXCEPTION 'Le nom de la cible est obligatoire'; END IF;
  IF p_category NOT IN ('ravageur','maladie','acarien','nematode','adventice','autre') THEN RAISE EXCEPTION 'Catégorie invalide'; END IF;
  IF EXISTS(SELECT 1 FROM phyto_targets WHERE id IS DISTINCT FROM p_target_id AND normalize_positive_list_key(canonical_name)=normalize_positive_list_key(p_name)) THEN RAISE EXCEPTION 'Une cible portant ce nom existe déjà'; END IF;
  IF p_target_id IS NULL THEN
    INSERT INTO phyto_targets(canonical_name,category,aliases,is_active,updated_by)
    VALUES(btrim(p_name),p_category,coalesce(p_aliases,'{}'),p_is_active,auth.uid()) RETURNING id INTO v_id;
  ELSE
    UPDATE phyto_targets SET canonical_name=btrim(p_name),category=p_category,
      aliases=ARRAY(SELECT DISTINCT btrim(x) FROM unnest(coalesce(p_aliases,'{}')) x WHERE NULLIF(btrim(x),'') IS NOT NULL),
      is_active=p_is_active,updated_at=NOW(),updated_by=auth.uid()
    WHERE id=p_target_id AND merged_into_id IS NULL RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Cible introuvable ou déjà fusionnée'; END IF;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.merge_phyto_targets(p_domain UUID,p_source_id UUID,p_destination_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_source phyto_targets%ROWTYPE; v_destination phyto_targets%ROWTYPE; v_count INTEGER;
BEGIN
  IF NOT public.has_domain_permission(p_domain,auth.uid(),'agronomie','edit') THEN RAISE EXCEPTION 'Permission insuffisante'; END IF;
  IF p_source_id=p_destination_id THEN RAISE EXCEPTION 'Choisissez deux cibles différentes'; END IF;
  SELECT * INTO v_source FROM phyto_targets WHERE id=p_source_id FOR UPDATE;
  SELECT * INTO v_destination FROM phyto_targets WHERE id=p_destination_id AND merged_into_id IS NULL FOR UPDATE;
  IF v_source.id IS NULL OR v_destination.id IS NULL THEN RAISE EXCEPTION 'Cible source ou destination introuvable'; END IF;
  UPDATE phyto_positive_list_entries SET target_id=p_destination_id,target_label=v_destination.canonical_name
   WHERE domain_id=p_domain AND target_id=p_source_id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  UPDATE phyto_targets SET aliases=ARRAY(
    SELECT DISTINCT value FROM unnest(v_destination.aliases||v_source.aliases||ARRAY[v_source.canonical_name]) value WHERE NULLIF(btrim(value),'') IS NOT NULL
  ),updated_at=NOW(),updated_by=auth.uid() WHERE id=p_destination_id;
  IF NOT EXISTS(SELECT 1 FROM phyto_positive_list_entries WHERE target_id=p_source_id) THEN
    UPDATE phyto_targets SET is_active=FALSE,merged_into_id=p_destination_id,updated_at=NOW(),updated_by=auth.uid() WHERE id=p_source_id;
  END IF;
  RETURN jsonb_build_object('entries_moved',v_count,'source_id',p_source_id,'destination_id',p_destination_id);
END $$;

REVOKE ALL ON FUNCTION public.save_phyto_target(UUID,UUID,TEXT,TEXT,TEXT[],BOOLEAN),public.merge_phyto_targets(UUID,UUID,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_phyto_target(UUID,UUID,TEXT,TEXT,TEXT[],BOOLEAN),public.merge_phyto_targets(UUID,UUID,UUID) TO authenticated;

COMMIT;
