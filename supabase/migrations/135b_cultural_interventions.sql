-- Interventions culturales hors phytosanitaires. Prérequis : 133, 135A, stocks/coûts 115-118.
-- Ne migre ni ne réécrit les historiques d'irrigation ou de phyto.
BEGIN;
CREATE TABLE public.cultural_families(code text PRIMARY KEY,name text NOT NULL,water_required boolean NOT NULL DEFAULT false,products_required boolean NOT NULL DEFAULT false);
INSERT INTO public.cultural_families VALUES
 ('fertigation','Fertigation',true,true),('nutrition_foliaire','Nutrition foliaire',true,true),
 ('amendement','Fertilisation de fond / amendements',false,true),('qualite_eau','Correction de la qualité de l’eau',true,true),
 ('biostimulation','Biostimulation hors phyto',false,true),('auxiliaires','Lâcher d’auxiliaires',false,true),
 ('piegeage','Piégeage / surveillance',false,false),('confusion','Diffuseurs hors phyto',false,true),
 ('hygiene','Nettoyage / hygiène',false,false),('reseau','Entretien du réseau',false,false),
 ('sol','Travail du sol / substrat hors phyto',false,false),('pollinisation','Pollinisation',false,true),
 ('ombrage','Blanchiment / ombrage',false,false),('co2','Enrichissement CO₂',false,true),('travaux','Travaux culturaux',false,false);
CREATE TABLE public.cultural_settings(domain_id uuid REFERENCES public.domains(id),family text REFERENCES public.cultural_families(code),
 levels integer NOT NULL DEFAULT 1 CHECK(levels BETWEEN 0 AND 2),alert_days integer NOT NULL DEFAULT 15 CHECK(alert_days BETWEEN 0 AND 365),PRIMARY KEY(domain_id,family));
CREATE TABLE public.cultural_programs(
 id uuid PRIMARY KEY,domain_id uuid NOT NULL REFERENCES public.domains(id),farm_id uuid NOT NULL REFERENCES public.farms(id),campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
 family text NOT NULL REFERENCES public.cultural_families(code),title text NOT NULL CHECK(length(btrim(title)) BETWEEN 3 AND 160),
 warehouse_id uuid REFERENCES public.warehouses(id),recipe_id uuid REFERENCES public.fertigation_recipes(id),water_liters numeric NOT NULL DEFAULT 0 CHECK(water_liters BETWEEN 0 AND 1e12),
 targets jsonb NOT NULL,products jsonb NOT NULL,input jsonb NOT NULL,requested_by uuid NOT NULL REFERENCES public.profiles(id),
 status text NOT NULL DEFAULT 'brouillon' CHECK(status IN('brouillon','soumise','approuvee','rejetee','annulee','terminee')),
 required_levels integer,current_level integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),submitted_at timestamptz,approved_at timestamptz
);
CREATE TABLE public.cultural_occurrences(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),program_id uuid NOT NULL REFERENCES public.cultural_programs(id),planned_at timestamptz NOT NULL,
 actual jsonb,performed_at timestamptz,confirmed_at timestamptz,confirmed_by uuid REFERENCES public.profiles(id),
 cancelled_at timestamptz,cancelled_by uuid REFERENCES public.profiles(id),cancel_reason text,UNIQUE(program_id,planned_at),CHECK(confirmed_at IS NULL OR cancelled_at IS NULL));
CREATE TABLE public.cultural_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),domain_id uuid NOT NULL REFERENCES public.domains(id),program_id uuid REFERENCES public.cultural_programs(id),
 actor uuid NOT NULL REFERENCES public.profiles(id),action text NOT NULL,level_number integer,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX cultural_decision_once ON public.cultural_audit(program_id,level_number) WHERE action IN('approve','reject');
CREATE TABLE public.cultural_consumptions(movement_id uuid PRIMARY KEY REFERENCES public.stock_movements(id),occurrence_id uuid NOT NULL REFERENCES public.cultural_occurrences(id),
 domain_id uuid NOT NULL REFERENCES public.domains(id),allocations jsonb NOT NULL,UNIQUE(occurrence_id,movement_id));
CREATE INDEX ON public.cultural_programs(domain_id,farm_id,status);
CREATE INDEX ON public.cultural_occurrences(program_id,planned_at);
ALTER TABLE public.cultural_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cultural_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cultural_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cultural_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cultural_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cultural_consumptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cultural_families,public.cultural_settings,public.cultural_programs,public.cultural_occurrences,public.cultural_audit,public.cultural_consumptions FROM PUBLIC,anon,authenticated;

INSERT INTO public.business_capabilities(code,name,process_code,is_sensitive,is_system) VALUES
 ('cultural.plan','Planifier les interventions culturales','cultural',false,true),
 ('cultural.validate','Valider les interventions culturales N1','cultural',true,true),
 ('cultural.validate2','Valider les interventions culturales N2','cultural',true,true),
 ('cultural.execute','Confirmer les interventions culturales','cultural',true,true) ON CONFLICT(code) DO NOTHING;
INSERT INTO public.function_capabilities(function_id,capability_id)
SELECT f.id,c.id FROM (VALUES('responsable_fertigation','cultural.plan'),('responsable_fertigation','cultural.validate'),('responsable_fertigation','cultural.execute'),
 ('responsable_exploitation','cultural.validate'),('responsable_exploitation','cultural.validate2'),('charge_irrigation','cultural.execute')) x(f,c)
JOIN public.operational_functions f ON f.code=x.f JOIN public.business_capabilities c ON c.code=x.c ON CONFLICT DO NOTHING;

CREATE FUNCTION public.cultural_products(p_domain uuid,p_lines jsonb,p_area numeric,p_water numeric) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l jsonb;s stock_items%ROWTYPE;seen uuid[]:='{}';r jsonb:='[]';dose numeric;q numeric; mode text;
BEGIN
 IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' THEN RAISE EXCEPTION 'Liste de produits requise'; END IF;
 IF jsonb_array_length(p_lines)>30 THEN RAISE EXCEPTION 'Maximum 30 produits'; END IF;
 FOR l IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  SELECT * INTO s FROM stock_items WHERE id=(l->>'stock_item_id')::uuid AND domain_id=p_domain AND is_active FOR SHARE;
  IF NOT FOUND OR s.category::text='phytosanitaires' OR s.plant_protection_product_id IS NOT NULL THEN RAISE EXCEPTION 'Article actif hors phyto du même client requis'; END IF;
  IF s.id=ANY(seen) THEN RAISE EXCEPTION 'Article en double'; END IF; seen:=array_append(seen,s.id);
  mode:=l->>'mode';dose:=(l->>'dose')::numeric;
  IF dose IS NULL OR NOT(dose>0 AND dose<=1e10) THEN RAISE EXCEPTION 'Dose / quantité positive requise'; END IF;
  IF mode='recipe' THEN
   q:=((fertigation_lines(p_domain,p_water,jsonb_build_array(l))->0)->>'quantity')::numeric;
  ELSIF mode='fixed' THEN q:=dose;
  ELSIF mode='ha' THEN q:=dose*p_area/10000;
  ELSIF mode='m3' AND p_water>0 THEN q:=dose*p_water/1000;
  ELSE RAISE EXCEPTION 'Base de calcul invalide ou eau manquante'; END IF;
  -- Existing movement quantities use two decimals: same rounding in forecast and actual stock posting.
  q:=round(q,2);IF NOT(q>0 AND q<=99999999.99) THEN RAISE EXCEPTION 'Quantité hors précision du stock (0,01 minimum)'; END IF;
  r:=r||jsonb_build_array(jsonb_build_object('stock_item_id',s.id,'name',s.name,'unit',s.unit,'mode',mode,'dose',dose,'dose_unit',l->>'dose_unit','quantity',q));
 END LOOP;
 RETURN r;
END $$;

CREATE FUNCTION public.save_cultural_program(p_id uuid,p_input jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d uuid:=(p_input->>'domain_id')::uuid; f uuid:=(p_input->>'farm_id')::uuid;c uuid:=(p_input->>'campaign_id')::uuid;
 old cultural_programs%ROWTYPE; family cultural_families%ROWTYPE;recipe fertigation_recipes%ROWTYPE;targets jsonb:='[]';products jsonb; l jsonb;cp record;area numeric;total numeric:=0;
 seen uuid[]:='{}';dates timestamptz[];water numeric:=coalesce((p_input->>'water_liters')::numeric,0);w uuid:=nullif(p_input->>'warehouse_id','')::uuid;
BEGIN
 IF NOT irrigation_access(d,f,'cultural.plan') THEN RAISE EXCEPTION 'Planification non autorisée sur cette ferme'; END IF;
 IF p_id IS NULL THEN RAISE EXCEPTION 'Identifiant requis'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,135));SELECT * INTO old FROM cultural_programs WHERE id=p_id;
 IF FOUND THEN IF old.requested_by=auth.uid() AND old.input=p_input THEN RETURN p_id; END IF;RAISE EXCEPTION 'Identifiant déjà utilisé'; END IF;
 SELECT * INTO family FROM cultural_families WHERE code=p_input->>'family';IF NOT FOUND THEN RAISE EXCEPTION 'Famille inconnue'; END IF;
 IF NOT EXISTS(SELECT 1 FROM campaigns WHERE id=c AND domain_id=d AND farm_id=f) THEN RAISE EXCEPTION 'Campagne étrangère à la ferme'; END IF;
 IF NOT(water>=0 AND water<=1e12) OR (family.water_required AND water<=0) THEN RAISE EXCEPTION 'Volume d’eau global positif requis pour cette famille'; END IF;
 IF length(btrim(coalesce(p_input->>'notes','')))<5 THEN RAISE EXCEPTION 'Objectif / consignes requis (5 caractères minimum)'; END IF;
 IF coalesce((p_input->>'scope_confirmed')::boolean,false)=false THEN RAISE EXCEPTION 'Confirmez le parcours hors phyto et la répartition par surfaces'; END IF;
 IF jsonb_typeof(p_input->'targets') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'targets')=0 THEN RAISE EXCEPTION 'Plantations requises'; END IF;
 FOR l IN SELECT value FROM jsonb_array_elements(p_input->'targets') LOOP
  SELECT p.*,g.name AS greenhouse_name INTO cp FROM campaign_plantings p JOIN greenhouses g ON g.id=p.greenhouse_id
  WHERE p.id=(l->>'planting_id')::uuid AND p.domain_id=d AND p.campaign_id=c AND g.farm_id=f AND g.status='active';
  IF NOT FOUND OR cp.id=ANY(seen) THEN RAISE EXCEPTION 'Plantation invalide ou en double'; END IF;
  area:=(l->>'area')::numeric;
  IF area IS NULL OR NOT(area>0 AND area<=cp.planted_area) THEN RAISE EXCEPTION 'Surface positive dans la limite plantée requise'; END IF;
  seen:=array_append(seen,cp.id);total:=total+area;
  targets:=targets||jsonb_build_array(jsonb_build_object('planting_id',cp.id,'greenhouse_id',cp.greenhouse_id,'greenhouse',cp.greenhouse_name,'variety_id',cp.variety_id,'campaign_id',c,'area',area));
 END LOOP;
 IF family.code='fertigation' THEN
  SELECT * INTO recipe FROM fertigation_recipes WHERE id=(p_input->>'recipe_id')::uuid AND domain_id=d AND farm_id=f;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recette fertigation de cette ferme requise'; END IF;
  SELECT jsonb_agg(x||'{"mode":"recipe"}') INTO products FROM jsonb_array_elements(recipe.lines) x;
 ELSE products:=coalesce(p_input->'products','[]'); END IF;
 products:=cultural_products(d,products,total,water);
 IF family.products_required AND jsonb_array_length(products)=0 THEN RAISE EXCEPTION 'Produits requis pour cette famille'; END IF;
 IF jsonb_array_length(products)>0 AND NOT EXISTS(SELECT 1 FROM warehouses WHERE id=w AND domain_id=d AND farm_id=f AND is_active) THEN RAISE EXCEPTION 'Entrepôt actif de la ferme requis'; END IF;
 SELECT array_agg(value::timestamptz ORDER BY value::timestamptz) INTO dates FROM jsonb_array_elements_text(p_input->'dates');
 IF coalesce(cardinality(dates),0) NOT BETWEEN 1 AND 100 OR cardinality(dates)<>(SELECT count(DISTINCT x) FROM unnest(dates) x)
 OR EXISTS(SELECT 1 FROM unnest(dates) x WHERE x IS NULL OR NOT isfinite(x) OR x<=now() OR x>now()+interval '3 years') THEN RAISE EXCEPTION '1 à 100 dates futures distinctes requises'; END IF;
 INSERT INTO cultural_programs(id,domain_id,farm_id,campaign_id,family,title,warehouse_id,recipe_id,water_liters,targets,products,input,requested_by)
 VALUES(p_id,d,f,c,family.code,btrim(p_input->>'title'),CASE WHEN jsonb_array_length(products)>0 THEN w END,recipe.id,water,targets,products,p_input,auth.uid());
 INSERT INTO cultural_occurrences(program_id,planned_at) SELECT p_id,x FROM unnest(dates) x;
 INSERT INTO cultural_audit(domain_id,program_id,actor,action) VALUES(d,p_id,auth.uid(),'create');RETURN p_id;
END $$;

CREATE FUNCTION public.cultural_can_review(p_id uuid,p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM cultural_programs p JOIN profiles u ON u.id=p_user JOIN farms f ON f.id=p.farm_id AND f.domain_id=p.domain_id
 WHERE p.id=p_id AND p.status='soumise' AND p.requested_by<>p_user AND u.is_active AND NOT coalesce(u.must_change_password,false) AND f.is_active
 AND is_domain_member(p.domain_id,p_user) AND has_domain_permission(p.domain_id,p_user,'agronomie','view')
 AND has_business_capability(p.domain_id,p_user,CASE WHEN p.current_level=2 THEN 'cultural.validate2' ELSE 'cultural.validate' END,p.farm_id)
 AND NOT EXISTS(SELECT 1 FROM cultural_audit a WHERE a.program_id=p.id AND a.action='approve' AND a.actor=p_user));
$$;
CREATE FUNCTION public.cultural_action(p_id uuid,p_action text,p_level integer DEFAULT 1,p_comment text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p cultural_programs%ROWTYPE;n integer;
BEGIN
 SELECT * INTO p FROM cultural_programs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT irrigation_access(p.domain_id,p.farm_id) THEN RAISE EXCEPTION 'Programme inaccessible'; END IF;
 IF p_action='submit' THEN
  IF p.requested_by<>auth.uid() OR NOT irrigation_access(p.domain_id,p.farm_id,'cultural.plan') THEN RAISE EXCEPTION 'Seul le demandeur habilité peut soumettre'; END IF;
  IF p.status<>'brouillon' THEN RAISE EXCEPTION 'Programme déjà soumis'; END IF;
  IF EXISTS(SELECT 1 FROM cultural_occurrences WHERE program_id=p.id AND planned_at<=now()) THEN RAISE EXCEPTION 'Dates dépassées : créer un nouveau programme'; END IF;
  SELECT levels INTO n FROM cultural_settings WHERE domain_id=p.domain_id AND family=p.family;n:=coalesce(n,1);
  UPDATE cultural_programs SET required_levels=n,submitted_at=now(),status=CASE WHEN n=0 THEN 'approuvee' ELSE 'soumise' END,approved_at=CASE WHEN n=0 THEN now() END WHERE id=p.id;
 ELSIF p_action IN('approve','reject') THEN
  IF p_level IS DISTINCT FROM p.current_level OR NOT cultural_can_review(p_id,auth.uid()) THEN RAISE EXCEPTION 'Niveau modifié, demande traitée ou validation non autorisée (autre personne requise)'; END IF;
  IF p_action='reject' AND length(btrim(coalesce(p_comment,'')))<5 THEN RAISE EXCEPTION 'Motif de refus requis (5 caractères)'; END IF;
  UPDATE cultural_programs SET status=CASE WHEN p_action='reject' THEN 'rejetee' WHEN current_level=required_levels THEN 'approuvee' ELSE 'soumise' END,
   approved_at=CASE WHEN p_action='approve' AND current_level=required_levels THEN now() END,
   current_level=CASE WHEN p_action='approve' AND current_level<required_levels THEN current_level+1 ELSE current_level END WHERE id=p.id;
 ELSIF p_action='cancel' THEN
  IF NOT((p.requested_by=auth.uid() AND irrigation_access(p.domain_id,p.farm_id,'cultural.plan')) OR irrigation_access(p.domain_id,p.farm_id,'cultural.validate')) THEN RAISE EXCEPTION 'Annulation non autorisée'; END IF;
  IF p.status NOT IN('brouillon','soumise','approuvee') OR length(btrim(coalesce(p_comment,'')))<5 THEN RAISE EXCEPTION 'Annulation impossible ou motif manquant'; END IF;
  UPDATE cultural_programs SET status='annulee' WHERE id=p.id;
 ELSE RAISE EXCEPTION 'Action inconnue'; END IF;
 INSERT INTO cultural_audit(domain_id,program_id,actor,action,level_number,details) VALUES(p.domain_id,p.id,auth.uid(),p_action,CASE WHEN p_action IN('approve','reject') THEN p.current_level END,jsonb_build_object('comment',p_comment));
END $$;

-- Stock uses existing atomic warehouse locks and CUMP. Costs use immutable actual surface snapshots.
ALTER FUNCTION public.post_consumption_cost(uuid) RENAME TO post_consumption_cost_before_cultural;
CREATE FUNCTION public.post_consumption_cost(p_movement uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE link cultural_consumptions%ROWTYPE;m stock_movements%ROWTYPE;rev inventory_consumption_reviews%ROWTYPE;t jsonb;total numeric;allocated numeric:=0;part numeric;i integer:=0;n integer;cat uuid;category text;
BEGIN
 SELECT * INTO link FROM cultural_consumptions WHERE movement_id=p_movement;
 IF NOT FOUND THEN PERFORM post_consumption_cost_before_cultural(p_movement);RETURN; END IF;
 SELECT * INTO m FROM stock_movements WHERE id=p_movement;
 SELECT * INTO rev FROM inventory_consumption_reviews WHERE movement_id=m.id;
 IF FOUND THEN m.total_cost:=rev.unit_cost*m.quantity;m.valuation_verified:=true;END IF;
 IF m.total_cost IS NULL OR EXISTS(SELECT 1 FROM cost_entries WHERE source_stock_movement_id=m.id) THEN RETURN; END IF;
 SELECT s.category::text INTO category FROM stock_items s WHERE s.id=m.stock_item_id;
 SELECT id INTO cat FROM account_categories WHERE code=map_purchase_cat_to_account_code(category) LIMIT 1;
 SELECT sum((x->>'area')::numeric) INTO total FROM jsonb_array_elements(link.allocations) x;
 SELECT count(*) INTO n FROM (SELECT x->>'greenhouse_id',x->>'variety_id',x->>'campaign_id' FROM jsonb_array_elements(link.allocations) x GROUP BY 1,2,3) grouped;
 FOR t IN SELECT jsonb_build_object('greenhouse_id',x->>'greenhouse_id','variety_id',x->>'variety_id','campaign_id',x->>'campaign_id','area',sum((x->>'area')::numeric))
  FROM jsonb_array_elements(link.allocations) x GROUP BY x->>'greenhouse_id',x->>'variety_id',x->>'campaign_id' ORDER BY x->>'greenhouse_id',x->>'variety_id' LOOP
  i:=i+1;part:=CASE WHEN i=n THEN round(m.total_cost,2)-allocated ELSE greatest(0,least(round(m.total_cost,2)-allocated,round(m.total_cost*(t->>'area')::numeric/total,2))) END;allocated:=allocated+part;
  INSERT INTO cost_entries(domain_id,campaign_id,greenhouse_id,variety_id,account_category_id,cost_category,amount,entry_date,description,is_planned,source_stock_movement_id,allocation_method,cost_quality)
  VALUES(m.domain_id,(t->>'campaign_id')::uuid,(t->>'greenhouse_id')::uuid,(t->>'variety_id')::uuid,cat,category,part,m.movement_date,'Intervention culturale '||m.reference,false,m.id,'surface_reelle_confirmee',CASE WHEN m.valuation_verified THEN 'verified' ELSE 'provisional' END);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.post_consumption_cost_before_cultural(uuid),public.post_consumption_cost(uuid) FROM PUBLIC,anon,authenticated;
-- Rebind the existing trigger dispatcher to the new wrapper, including long-lived sessions.
CREATE OR REPLACE FUNCTION public.trigger_consumption_cost() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='stock_movements' THEN PERFORM post_consumption_cost(NEW.id);
 ELSIF TG_TABLE_NAME='inventory_consumption_reviews' THEN PERFORM post_consumption_cost(NEW.movement_id);
 ELSE PERFORM post_consumption_cost(NEW.stock_movement_id);END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.cultural_consumption_cost_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM post_consumption_cost(NEW.movement_id);RETURN NEW;END $$;
REVOKE ALL ON FUNCTION public.cultural_consumption_cost_trigger() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER cultural_consumption_cost AFTER INSERT ON public.cultural_consumptions FOR EACH ROW EXECUTE FUNCTION public.cultural_consumption_cost_trigger();
-- The pre-existing reconciliation RPC also supports unknown prices on these consumed products.
ALTER FUNCTION public.review_inventory_consumption(uuid,uuid,numeric,text) RENAME TO review_inventory_consumption_before_cultural;
CREATE FUNCTION public.review_inventory_consumption(p_movement uuid,p_planting uuid,p_unit_cost numeric,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m stock_movements%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM cultural_consumptions WHERE movement_id=p_movement) THEN PERFORM review_inventory_consumption_before_cultural(p_movement,p_planting,p_unit_cost,p_reason);RETURN; END IF;
 SELECT * INTO m FROM stock_movements WHERE id=p_movement FOR UPDATE;
 IF NOT coalesce(is_domain_member(m.domain_id,auth.uid()),false) OR NOT coalesce(has_domain_permission(m.domain_id,auth.uid(),'couts','edit'),false)
 OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND is_active AND NOT coalesce(must_change_password,false)) THEN RAISE EXCEPTION 'Rapprochement non autorisé'; END IF;
 IF EXISTS(SELECT 1 FROM cost_entries WHERE source_stock_movement_id=m.id) THEN RAISE EXCEPTION 'Consommation déjà imputée'; END IF;
 IF p_unit_cost IS NULL OR NOT(p_unit_cost>=0 AND p_unit_cost<=1e12) OR length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Prix et justificatif requis'; END IF;
 INSERT INTO inventory_consumption_reviews(movement_id,domain_id,unit_cost,reason) VALUES(m.id,m.domain_id,p_unit_cost,p_reason);
END $$;
REVOKE ALL ON FUNCTION public.review_inventory_consumption_before_cultural(uuid,uuid,numeric,text),public.review_inventory_consumption(uuid,uuid,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_inventory_consumption(uuid,uuid,numeric,text) TO authenticated;

CREATE FUNCTION public.confirm_cultural_occurrence(p_id uuid,p_actual jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p cultural_programs%ROWTYPE;o cultural_occurrences%ROWTYPE;l jsonb;t jsonb;areas jsonb:='[]';actual_lines jsonb;expected jsonb;
 area numeric;total numeric:=0;q numeric;water numeric;done timestamptz;mid uuid;unit_now text;qty numeric;old_guard text;
BEGIN
 SELECT cp.* INTO p FROM cultural_programs cp JOIN cultural_occurrences co ON co.program_id=cp.id WHERE co.id=p_id FOR UPDATE OF cp;
 IF NOT FOUND OR NOT irrigation_access(p.domain_id,p.farm_id,'cultural.execute') THEN RAISE EXCEPTION 'Confirmation non autorisée'; END IF;
 SELECT * INTO o FROM cultural_occurrences WHERE id=p_id FOR UPDATE;
 IF o.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'Occurrence déclarée non réalisée'; END IF;
 IF o.confirmed_at IS NOT NULL THEN IF o.confirmed_by=auth.uid() AND o.actual=p_actual THEN RETURN; END IF;RAISE EXCEPTION 'Occurrence déjà confirmée'; END IF;
 IF p.status<>'approuvee' THEN RAISE EXCEPTION 'Programme non approuvé'; END IF;
 done:=(p_actual->>'performed_at')::timestamptz;water:=coalesce((p_actual->>'water_liters')::numeric,0);
 IF done IS NULL OR NOT isfinite(done) OR done>now() OR done<p.approved_at THEN RAISE EXCEPTION 'Date réelle après approbation et non future requise'; END IF;
 IF NOT(water>=0 AND water<=1e12) OR (EXISTS(SELECT 1 FROM cultural_families WHERE code=p.family AND water_required) AND water<=0) THEN RAISE EXCEPTION 'Eau réelle invalide'; END IF;
 IF length(btrim(coalesce(p_actual->>'notes','')))<5 OR coalesce((p_actual->>'homogeneous')::boolean,false)=false THEN RAISE EXCEPTION 'Observation et confirmation de répartition homogène requises'; END IF;
 FOR t IN SELECT value FROM jsonb_array_elements(p.targets) LOOP
  area:=(p_actual->'areas'->>(t->>'planting_id'))::numeric;
  IF area IS NULL OR NOT(area>0 AND area<=(t->>'area')::numeric) THEN RAISE EXCEPTION 'Surface réelle positive dans la limite prescrite requise pour chaque plantation'; END IF;
  areas:=areas||jsonb_build_array(t||jsonb_build_object('area',area));total:=total+area;
 END LOOP;
 expected:=cultural_products(p.domain_id,p.products,total,water);
 actual_lines:=p_actual->'products';
 IF jsonb_typeof(actual_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(actual_lines)<>jsonb_array_length(expected) THEN RAISE EXCEPTION 'Renseigner chaque quantité réelle'; END IF;
 IF (SELECT count(DISTINCT x->>'stock_item_id') FROM jsonb_array_elements(actual_lines) x)<>jsonb_array_length(expected) THEN RAISE EXCEPTION 'Produits réels en double'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(actual_lines) x WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(expected) y WHERE y->>'stock_item_id'=x->>'stock_item_id')) THEN RAISE EXCEPTION 'Remplacement de produit interdit sans nouvelle prescription'; END IF;
 IF jsonb_array_length(expected)>0 AND NOT EXISTS(SELECT 1 FROM warehouses WHERE id=p.warehouse_id AND domain_id=p.domain_id AND farm_id=p.farm_id AND is_active) THEN RAISE EXCEPTION 'Entrepôt déplacé ou inactif : nouveau programme requis'; END IF;
 -- Lock all item rows in deterministic order before warehouse triggers acquire them.
 PERFORM 1 FROM stock_items WHERE id IN(SELECT (x->>'stock_item_id')::uuid FROM jsonb_array_elements(expected) x) ORDER BY id FOR UPDATE;
 FOR l IN SELECT value FROM jsonb_array_elements(expected) ORDER BY value->>'stock_item_id' LOOP
  SELECT x INTO t FROM jsonb_array_elements(actual_lines) x WHERE x->>'stock_item_id'=l->>'stock_item_id';
  q:=(t->>'quantity')::numeric;
  IF q IS NULL OR NOT(q>=0 AND q<=99999999.99) OR q<>round(q,2) THEN RAISE EXCEPTION 'Quantité réelle positive ou nulle à 2 décimales requise'; END IF;
  IF q<>(l->>'quantity')::numeric AND length(btrim(coalesce(p_actual->>'deviation_reason','')))<5 THEN RAISE EXCEPTION 'Justificatif requis pour les quantités différentes du calcul'; END IF;
  -- Check the unit snapshot before deducting quantities; never silently reinterpret units.
  SELECT unit INTO unit_now FROM stock_items WHERE id=(l->>'stock_item_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.products) x WHERE x->>'stock_item_id'=l->>'stock_item_id' AND x->>'unit'=unit_now) THEN RAISE EXCEPTION 'Unité stock modifiée depuis la prescription'; END IF;
  IF q=0 THEN CONTINUE; END IF;
  SELECT coalesce(current_qty,0) INTO qty FROM warehouse_stocks WHERE warehouse_id=p.warehouse_id AND stock_item_id=(l->>'stock_item_id')::uuid;
  IF coalesce(qty,0)<q THEN RAISE EXCEPTION 'Stock insuffisant : %',l->>'name'; END IF;
  old_guard:=current_setting('app.approved_stock_exit',true);
  PERFORM set_config('app.approved_stock_exit','true',true);
  INSERT INTO stock_movements(stock_item_id,movement_type,quantity,movement_date,warehouse_id,reference,notes,domain_id)
  VALUES((l->>'stock_item_id')::uuid,'sortie',q,(done AT TIME ZONE 'Africa/Casablanca')::date,p.warehouse_id,'CULT-'||o.id,p_actual->>'notes',p.domain_id) RETURNING id INTO mid;
  PERFORM set_config('app.approved_stock_exit',coalesce(old_guard,'false'),true);
  INSERT INTO cultural_consumptions(movement_id,occurrence_id,domain_id,allocations) VALUES(mid,o.id,p.domain_id,areas);
 END LOOP;
 UPDATE cultural_occurrences SET actual=p_actual,performed_at=done,confirmed_at=now(),confirmed_by=auth.uid() WHERE id=o.id;
 IF NOT EXISTS(SELECT 1 FROM cultural_occurrences WHERE program_id=p.id AND confirmed_at IS NULL AND cancelled_at IS NULL) THEN UPDATE cultural_programs SET status='terminee' WHERE id=p.id; END IF;
 INSERT INTO cultural_audit(domain_id,program_id,actor,action,details) VALUES(p.domain_id,p.id,auth.uid(),'execute',jsonb_build_object('occurrence_id',o.id,'actual',p_actual));
END $$;

CREATE FUNCTION public.skip_cultural_occurrence(p_id uuid,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p cultural_programs%ROWTYPE;o cultural_occurrences%ROWTYPE;
BEGIN
 SELECT cp.* INTO p FROM cultural_programs cp JOIN cultural_occurrences co ON co.program_id=cp.id WHERE co.id=p_id FOR UPDATE OF cp;
 IF NOT FOUND OR NOT irrigation_access(p.domain_id,p.farm_id,'cultural.execute') THEN RAISE EXCEPTION 'Confirmation non autorisée'; END IF;
 SELECT * INTO o FROM cultural_occurrences WHERE id=p_id FOR UPDATE;
 IF o.cancelled_at IS NOT NULL AND o.cancelled_by=auth.uid() AND o.cancel_reason=p_reason THEN RETURN; END IF;
 IF p.status<>'approuvee' OR o.confirmed_at IS NOT NULL OR o.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'Occurrence déjà clôturée ou programme non approuvé'; END IF;
 IF length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Motif requis (5 caractères minimum)'; END IF;
 UPDATE cultural_occurrences SET cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason=p_reason WHERE id=o.id;
 IF NOT EXISTS(SELECT 1 FROM cultural_occurrences WHERE program_id=p.id AND confirmed_at IS NULL AND cancelled_at IS NULL) THEN UPDATE cultural_programs SET status='terminee' WHERE id=p.id; END IF;
 INSERT INTO cultural_audit(domain_id,program_id,actor,action,details) VALUES(p.domain_id,p.id,auth.uid(),'not_performed',jsonb_build_object('occurrence_id',o.id,'comment',p_reason));
END $$;
REVOKE ALL ON FUNCTION public.skip_cultural_occurrence(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.skip_cultural_occurrence(uuid,text) TO authenticated;

CREATE FUNCTION public.cultural_forecast(p_domain uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT irrigation_access(p_domain,NULL) THEN RAISE EXCEPTION 'Accès agronomie requis'; END IF;
 WITH needs AS (
  SELECT o.id AS occurrence_id,o.planned_at,p.id AS program_id,p.title,p.family,p.farm_id,p.warehouse_id,x->>'name' AS product,x->>'unit' AS unit,(x->>'stock_item_id')::uuid AS item,(x->>'quantity')::numeric AS quantity,
  sum((x->>'quantity')::numeric) OVER(PARTITION BY p.warehouse_id,x->>'stock_item_id' ORDER BY o.planned_at,o.id ROWS UNBOUNDED PRECEDING) AS cumulative
  FROM cultural_programs p JOIN cultural_occurrences o ON o.program_id=p.id CROSS JOIN LATERAL jsonb_array_elements(p.products) x
  WHERE p.domain_id=p_domain AND p.status IN('soumise','approuvee') AND o.confirmed_at IS NULL AND o.cancelled_at IS NULL
 ) SELECT coalesce(jsonb_agg(to_jsonb(n)||jsonb_build_object('available',coalesce(s.current_qty,0),'missing',least(n.quantity,greatest(0,n.cumulative-coalesce(s.current_qty,0)))) ORDER BY n.planned_at,n.occurrence_id),'[]') INTO result
 FROM needs n LEFT JOIN warehouse_stocks s ON s.warehouse_id=n.warehouse_id AND s.stock_item_id=n.item AND s.domain_id=p_domain;
 RETURN result;
END $$;
CREATE FUNCTION public.set_cultural_settings(p_domain uuid,p_family text,p_levels integer,p_alert_days integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT irrigation_access(p_domain,NULL) OR NOT is_domain_admin(p_domain,auth.uid()) THEN RAISE EXCEPTION 'Administration requise'; END IF;
 INSERT INTO cultural_settings VALUES(p_domain,p_family,p_levels,p_alert_days) ON CONFLICT(domain_id,family) DO UPDATE SET levels=EXCLUDED.levels,alert_days=EXCLUDED.alert_days;
 INSERT INTO cultural_audit(domain_id,actor,action,details) VALUES(p_domain,auth.uid(),'settings',jsonb_build_object('family',p_family,'levels',p_levels,'alert_days',p_alert_days));
END $$;
CREATE FUNCTION public.cultural_workspace(p_domain uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT irrigation_access(p_domain,NULL) THEN RAISE EXCEPTION 'Accès agronomie requis'; END IF;
 RETURN jsonb_build_object('can_configure',is_domain_admin(p_domain,auth.uid()),
 'families',(SELECT jsonb_agg(to_jsonb(f)||jsonb_build_object('levels',coalesce(s.levels,1),'alert_days',coalesce(s.alert_days,15)) ORDER BY f.name) FROM cultural_families f LEFT JOIN cultural_settings s ON s.family=f.code AND s.domain_id=p_domain),
 'farms',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'can_plan',irrigation_access(p_domain,f.id,'cultural.plan'),'can_execute',irrigation_access(p_domain,f.id,'cultural.execute'),'can_validate',irrigation_access(p_domain,f.id,'cultural.validate')) ORDER BY f.name) FROM farms f WHERE f.domain_id=p_domain AND f.is_active),'[]'),
 'campaigns',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'farm_id',farm_id,'name',name)) FROM campaigns WHERE domain_id=p_domain),'[]'),
 'plantings',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'campaign_id',p.campaign_id,'farm_id',g.farm_id,'name',g.name,'area',p.planted_area,'variety',v.commercial_name)) FROM campaign_plantings p JOIN greenhouses g ON g.id=p.greenhouse_id LEFT JOIN varieties v ON v.id=p.variety_id WHERE p.domain_id=p_domain AND g.status='active'),'[]'),
 'warehouses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'farm_id',farm_id,'name',name)) FROM warehouses WHERE domain_id=p_domain AND is_active),'[]'),
 'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'unit',unit,'category',category) ORDER BY name) FROM stock_items WHERE domain_id=p_domain AND is_active AND category::text<>'phytosanitaires' AND plant_protection_product_id IS NULL),'[]'),
 'recipes',coalesce((SELECT jsonb_agg(to_jsonb(r)-'input') FROM fertigation_recipes r WHERE domain_id=p_domain),'[]'),
 'forecast',cultural_forecast(p_domain),
 'programs',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('can_review',cultural_can_review(p.id,auth.uid()),
  'occurrences',(SELECT jsonb_agg(to_jsonb(o) ORDER BY planned_at) FROM cultural_occurrences o WHERE program_id=p.id),
  'audit',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY created_at),'[]') FROM cultural_audit a WHERE program_id=p.id)) ORDER BY p.created_at DESC) FROM cultural_programs p WHERE domain_id=p_domain),'[]'));
END $$;
REVOKE ALL ON FUNCTION public.cultural_products(uuid,jsonb,numeric,numeric),public.cultural_can_review(uuid,uuid),public.save_cultural_program(uuid,jsonb),public.cultural_action(uuid,text,integer,text),public.confirm_cultural_occurrence(uuid,jsonb),public.cultural_forecast(uuid),public.set_cultural_settings(uuid,text,integer,integer),public.cultural_workspace(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_cultural_program(uuid,jsonb),public.cultural_action(uuid,text,integer,text),public.confirm_cultural_occurrence(uuid,jsonb),public.cultural_forecast(uuid),public.set_cultural_settings(uuid,text,integer,integer),public.cultural_workspace(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
