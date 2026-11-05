-- Articles + ouverture de stock, transaction atomique. À appliquer séparément en base.
-- Prérequis : entrepôts 106/108, valorisation 115, permissions par domaine 079.
BEGIN;
CREATE TABLE public.stock_initialization_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), domain_id uuid NOT NULL REFERENCES public.domains(id),
 request_id uuid NOT NULL, payload_hash text NOT NULL, result jsonb NOT NULL,
 created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(domain_id,request_id), UNIQUE(domain_id,payload_hash)
);
CREATE TABLE public.stock_initialization_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES public.stock_initialization_batches(id),
 domain_id uuid NOT NULL REFERENCES public.domains(id), stock_item_id uuid NOT NULL REFERENCES public.stock_items(id),
 warehouse_id uuid NOT NULL REFERENCES public.warehouses(id), inventory_date date NOT NULL,
 quantity numeric NOT NULL CHECK(quantity>=0), unit_cost numeric, evidence text, notes text,
 movement_id uuid REFERENCES public.stock_movements(id), UNIQUE(warehouse_id,stock_item_id)
);
ALTER TABLE public.stock_initialization_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_initialization_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stock_initialization_batches,public.stock_initialization_lines FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.stock_initialization_batches,public.stock_initialization_lines TO authenticated;
CREATE POLICY stock_initialization_batches_read ON public.stock_initialization_batches FOR SELECT TO authenticated
 USING(public.has_domain_permission(domain_id,auth.uid(),'stocks','view'));
CREATE POLICY stock_initialization_lines_read ON public.stock_initialization_lines FOR SELECT TO authenticated
 USING(public.has_domain_permission(domain_id,auth.uid(),'stocks','view'));

CREATE FUNCTION public.initialize_stock_inventory(p_domain uuid,p_request uuid,p_rows jsonb,p_apply boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' AS $fn$
DECLARE
 r jsonb; n integer:=0; v_code text; title text; cat text; unit text; warehouse_code text;
 q numeric; price numeric; inventory_date date; item public.stock_items%ROWTYPE; w public.warehouses%ROWTYPE;
 v_hash text; previous public.stock_initialization_batches%ROWTYPE; batch uuid; movement uuid;
 new_codes text[]:='{}'; reused_codes text[]:='{}'; pairs text[]:='{}'; pair text;
 definitions jsonb:='{}'; names jsonb:='{}'; definition jsonb; definition_key text;
 positives integer:=0; zeros integer:=0; unvalued integer:=0; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_domain IS NULL OR p_request IS NULL OR p_apply IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
 OR NOT EXISTS(SELECT 1 FROM public.domains WHERE id=p_domain AND is_active)
 OR NOT coalesce(public.has_domain_permission(p_domain,auth.uid(),'stocks','edit'),false)
 THEN RAISE EXCEPTION 'Modification des stocks interdite pour ce client' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Une liste de lignes est requise'; END IF;
 IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 1000 OR pg_column_size(p_rows)>5242880 THEN RAISE EXCEPTION 'Entre 1 et 1 000 lignes, maximum 5 Mo'; END IF;
 -- Serialize imports for a tenant; regular inventory movements serialize on item locks below.
 PERFORM pg_advisory_xact_lock(hashtextextended('stock-initialization:'||p_domain::text,0));
 v_hash:=encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
 SELECT * INTO previous FROM public.stock_initialization_batches b WHERE b.domain_id=p_domain AND b.request_id=p_request;
 IF FOUND THEN
   IF previous.payload_hash<>v_hash THEN RAISE EXCEPTION 'Cette référence de validation correspond à un autre fichier'; END IF;
   RETURN previous.result;
 END IF;
 SELECT * INTO previous FROM public.stock_initialization_batches b WHERE b.domain_id=p_domain AND b.payload_hash=v_hash;
 IF FOUND THEN RETURN previous.result; END IF;
 -- Prevent concurrent article creation/metadata edits between validation and insert.
 -- Reads stay available; lock_timeout bounds contention. No lock is taken for preview.
 IF p_apply THEN LOCK TABLE public.stock_items IN SHARE ROW EXCLUSIVE MODE; END IF;

 -- First pass: validate everything. Dry-run never writes business records.
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
   n:=n+1;
   IF jsonb_typeof(r) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Ligne % : objet attendu',n; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_each(r) e WHERE e.key NOT IN ('code','name','category','unit','warehouse','date','quantity','price','evidence','notes') OR jsonb_typeof(e.value) NOT IN ('string','null')) THEN RAISE EXCEPTION 'Ligne % : champs non reconnus ou valeurs non textuelles',n; END IF;
   v_code:=btrim(coalesce(r->>'code','')); title:=btrim(coalesce(r->>'name','')); cat:=btrim(coalesce(r->>'category','')); unit:=btrim(coalesce(r->>'unit',''));
   IF length(v_code) NOT BETWEEN 1 AND 30 OR length(title) NOT BETWEEN 1 AND 255 OR length(coalesce(r->>'notes',''))>2000 OR length(coalesce(r->>'evidence',''))>100 THEN RAISE EXCEPTION 'Ligne % : code, nom ou longueurs invalides',n; END IF;
   SELECT * INTO item FROM public.stock_items s WHERE s.domain_id=p_domain AND upper(s.code)=upper(v_code) FOR UPDATE;
   IF FOUND THEN
     IF NOT item.is_active THEN RAISE EXCEPTION 'Ligne % : article inactif %',n,v_code; END IF;
     IF upper(btrim(item.name))<>upper(title) OR upper(item.category::text)<>upper(cat) OR upper(btrim(item.unit))<>upper(unit) THEN RAISE EXCEPTION 'Ligne % : nom, catégorie ou unité ne correspond pas à l’article existant %',n,v_code; END IF;
     IF NOT upper(v_code)=ANY(reused_codes) THEN reused_codes:=array_append(reused_codes,upper(v_code)); END IF;
   ELSE
     IF NOT coalesce(public.has_domain_permission(p_domain,auth.uid(),'stocks','create'),false) THEN RAISE EXCEPTION 'Ligne % : droit de création des articles requis',n USING ERRCODE='42501'; END IF;
     IF EXISTS(SELECT 1 FROM public.stock_items s WHERE s.domain_id=p_domain AND upper(btrim(s.name))=upper(title)) THEN RAISE EXCEPTION 'Ligne % : désignation déjà utilisée, reprendre le code existant',n; END IF;
     IF NOT EXISTS(SELECT 1 FROM public.reference_values rv WHERE rv.list_key='stock_category' AND rv.code=cat AND rv.is_active)
       OR NOT cat=ANY(ARRAY['semences','plants','engrais','phytosanitaires','emballages','consommables','pieces_rechange','autre'])
       OR NOT EXISTS(SELECT 1 FROM public.reference_values rv WHERE rv.list_key='unit' AND rv.code=unit AND rv.is_active)
     THEN RAISE EXCEPTION 'Ligne % : catégorie ou unité absente des référentiels actifs',n; END IF;
     IF NOT upper(v_code)=ANY(new_codes) THEN new_codes:=array_append(new_codes,upper(v_code)); END IF;
   END IF;
   definition_key:=upper(v_code); definition:=jsonb_build_array(upper(title),upper(cat),upper(unit));
   IF definitions ? definition_key AND definitions->definition_key<>definition THEN RAISE EXCEPTION 'Ligne % : même code avec définitions contradictoires',n; END IF;
   IF names ? upper(title) AND names->>upper(title)<>definition_key THEN RAISE EXCEPTION 'Ligne % : même nom sous plusieurs codes',n; END IF;
   definitions:=jsonb_set(definitions,ARRAY[definition_key],definition); names:=jsonb_set(names,ARRAY[upper(title)],to_jsonb(definition_key));
   q:=NULL; price:=NULL;
   IF btrim(coalesce(r->>'quantity',''))<>'' THEN
     IF r->>'quantity' !~ '^\d+(\.\d{1,2})?$' THEN RAISE EXCEPTION 'Ligne % : quantité positive ou nulle, deux décimales maximum',n; END IF;
     q:=(r->>'quantity')::numeric;
     IF q>99999999.99 THEN RAISE EXCEPTION 'Ligne % : quantité trop élevée',n; END IF;
     IF coalesce(r->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Ligne % : date inventaire requise',n; END IF;
     inventory_date:=(r->>'date')::date;
     IF inventory_date>(now() AT TIME ZONE 'Africa/Casablanca')::date THEN RAISE EXCEPTION 'Ligne % : date future interdite',n; END IF;
     warehouse_code:=btrim(coalesce(r->>'warehouse',''));
     SELECT * INTO w FROM public.warehouses wh WHERE wh.domain_id=p_domain AND upper(wh.code)=upper(warehouse_code) AND wh.is_active
       AND EXISTS(SELECT 1 FROM public.farms f WHERE f.id=wh.farm_id AND f.domain_id=p_domain AND f.is_active) FOR SHARE OF wh;
     IF NOT FOUND THEN RAISE EXCEPTION 'Ligne % : entrepôt actif rattaché à une ferme du client requis',n; END IF;
     pair:=upper(v_code)||'|'||w.id::text;
     IF pair=ANY(pairs) THEN RAISE EXCEPTION 'Ligne % : article et entrepôt répétés',n; END IF; pairs:=array_append(pairs,pair);
     IF item.id IS NOT NULL AND (
       EXISTS(SELECT 1 FROM public.stock_initialization_lines l WHERE l.warehouse_id=w.id AND l.stock_item_id=item.id)
       OR EXISTS(SELECT 1 FROM public.warehouse_stocks s WHERE s.warehouse_id=w.id AND s.stock_item_id=item.id AND (s.current_qty<>0 OR coalesce(s.inventory_value,0)<>0))
       OR EXISTS(SELECT 1 FROM public.stock_movements m WHERE m.warehouse_id=w.id AND m.stock_item_id=item.id)
     ) THEN RAISE EXCEPTION 'Ligne % : stock déjà utilisé ou initialisé pour % ; aucune réinitialisation autorisée',n,v_code; END IF;
     IF q>0 THEN positives:=positives+1; IF btrim(coalesce(r->>'price',''))='' THEN unvalued:=unvalued+1; END IF;
     ELSE zeros:=zeros+1; END IF;
   END IF;
   IF btrim(coalesce(r->>'price',''))<>'' THEN
     IF q IS NULL OR r->>'price' !~ '^\d+(\.\d{1,8})?$' OR btrim(coalesce(r->>'evidence',''))='' THEN RAISE EXCEPTION 'Ligne % : quantité, coût valide et justificatif requis',n; END IF;
     price:=(r->>'price')::numeric;
     IF price>99999999.99 THEN RAISE EXCEPTION 'Ligne % : coût trop élevé',n; END IF;
   ELSIF btrim(coalesce(r->>'evidence',''))<>'' AND q IS NULL THEN RAISE EXCEPTION 'Ligne % : quantité requise',n;
   END IF;
 END LOOP;
 result:=jsonb_build_object('status','preview','created',cardinality(new_codes),'reused',cardinality(reused_codes),'positive',positives,'zero',zeros,'unvalued',unvalued,'operation_id',NULL);
 IF NOT p_apply THEN RETURN result; END IF;
 batch:=gen_random_uuid(); result:=result||jsonb_build_object('status','applied','operation_id',batch);
 INSERT INTO public.stock_initialization_batches(id,domain_id,request_id,payload_hash,result) VALUES(batch,p_domain,p_request,v_hash,result);
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
   SELECT * INTO item FROM public.stock_items s WHERE s.domain_id=p_domain AND upper(s.code)=upper(btrim(r->>'code')) FOR UPDATE;
   IF NOT FOUND THEN
     INSERT INTO public.stock_items(domain_id,code,name,category,unit,current_qty,min_qty,is_active,notes)
       VALUES(p_domain,btrim(r->>'code'),btrim(r->>'name'),(r->>'category')::public.stock_category,r->>'unit',0,0,true,nullif(r->>'notes','')) RETURNING * INTO item;
   END IF;
   IF coalesce(r->>'quantity','')<>'' THEN
     SELECT * INTO w FROM public.warehouses wh WHERE wh.domain_id=p_domain AND upper(wh.code)=upper(btrim(r->>'warehouse')) AND wh.is_active;
     q:=(r->>'quantity')::numeric; price:=nullif(r->>'price','')::numeric; movement:=NULL;
     -- Stock item locks are held since validation; creation/reuse remains all-or-nothing.
     IF q>0 THEN
       INSERT INTO public.stock_movements(domain_id,stock_item_id,warehouse_id,movement_type,quantity,unit_cost,movement_date,reference,notes)
       VALUES(p_domain,item.id,w.id,'entree',q,price,(r->>'date')::date,'INIT:'||batch::text,
         concat('Stock d’ouverture. ',r->>'evidence',' ',r->>'notes')) RETURNING id INTO movement;
     ELSE
       INSERT INTO public.warehouse_stocks(domain_id,warehouse_id,stock_item_id,current_qty,inventory_value,valuation_verified)
       VALUES(p_domain,w.id,item.id,0,0,true) ON CONFLICT(warehouse_id,stock_item_id)
       DO UPDATE SET inventory_value=0,valuation_verified=true,updated_at=now();
     END IF;
     INSERT INTO public.stock_initialization_lines(batch_id,domain_id,stock_item_id,warehouse_id,inventory_date,quantity,unit_cost,evidence,notes,movement_id)
     VALUES(batch,p_domain,item.id,w.id,(r->>'date')::date,q,price,nullif(r->>'evidence',''),nullif(r->>'notes',''),movement);
   END IF;
 END LOOP;
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.initialize_stock_inventory(uuid,uuid,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.initialize_stock_inventory(uuid,uuid,jsonb,boolean) TO authenticated;
COMMIT;
