-- Lot 4 : fournisseurs, achats, factures fournisseurs et stocks.
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['suppliers','purchase_orders','purchase_order_lines','supplier_invoices','payments_made','stock_items','stock_movements'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES public.domains(id) ON DELETE RESTRICT',t);
  END LOOP;
END $$;

DO $$ DECLARE v_default UUID; BEGIN
  SELECT id INTO v_default FROM public.domains WHERE upper(code)='DOM-BENHALIMA';
  IF v_default IS NULL THEN RAISE EXCEPTION 'Domaine DOM-BENHALIMA introuvable'; END IF;
  UPDATE public.suppliers SET domain_id=v_default WHERE domain_id IS NULL;
  UPDATE public.stock_items SET domain_id=v_default WHERE domain_id IS NULL;
END $$;
UPDATE public.purchase_orders po SET domain_id=s.domain_id FROM public.suppliers s WHERE s.id=po.supplier_id AND po.domain_id IS NULL;
UPDATE public.purchase_order_lines pol SET domain_id=po.domain_id FROM public.purchase_orders po WHERE po.id=pol.po_id AND pol.domain_id IS NULL;
UPDATE public.supplier_invoices si SET domain_id=s.domain_id FROM public.suppliers s WHERE s.id=si.supplier_id AND si.domain_id IS NULL;
UPDATE public.payments_made pm SET domain_id=si.domain_id FROM public.supplier_invoices si WHERE si.id=pm.supplier_invoice_id AND pm.domain_id IS NULL;
UPDATE public.stock_movements sm SET domain_id=si.domain_id FROM public.stock_items si WHERE si.id=sm.stock_item_id AND sm.domain_id IS NULL;

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['suppliers','purchase_orders','purchase_order_lines','supplier_invoices','payments_made','stock_items','stock_movements'] LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN domain_id SET NOT NULL',t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(domain_id)','idx_'||t||'_domain',t);
  END LOOP;
END $$;

ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_code_key;
ALTER TABLE public.stock_items DROP CONSTRAINT IF EXISTS stock_items_code_key;
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_po_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_domain_code ON public.suppliers(domain_id,upper(code));
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_items_domain_code ON public.stock_items(domain_id,upper(code));
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_domain_number ON public.purchase_orders(domain_id,upper(po_number));

CREATE OR REPLACE FUNCTION public.sync_purchase_order_domain() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v UUID; x UUID;
BEGIN
  SELECT domain_id INTO v FROM suppliers WHERE id=NEW.supplier_id;
  IF NEW.campaign_id IS NOT NULL THEN SELECT domain_id INTO x FROM campaigns WHERE id=NEW.campaign_id; IF x<>v THEN RAISE EXCEPTION 'Fournisseur et campagne de domaines différents'; END IF; END IF;
  IF NEW.greenhouse_id IS NOT NULL THEN SELECT f.domain_id INTO x FROM greenhouses g JOIN farms f ON f.id=g.farm_id WHERE g.id=NEW.greenhouse_id; IF x<>v THEN RAISE EXCEPTION 'Fournisseur et serre de domaines différents'; END IF; END IF;
  IF v IS NULL THEN RAISE EXCEPTION 'Fournisseur introuvable'; END IF; NEW.domain_id:=v; RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.sync_purchase_line_domain() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v UUID; x UUID;
BEGIN SELECT domain_id INTO v FROM purchase_orders WHERE id=NEW.po_id;
  IF NEW.stock_item_id IS NOT NULL THEN SELECT domain_id INTO x FROM stock_items WHERE id=NEW.stock_item_id; IF x<>v THEN RAISE EXCEPTION 'Bon et article de domaines différents'; END IF; END IF;
  IF v IS NULL THEN RAISE EXCEPTION 'Bon introuvable'; END IF; NEW.domain_id:=v; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.sync_supplier_invoice_domain() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v UUID; x UUID;
BEGIN SELECT domain_id INTO v FROM suppliers WHERE id=NEW.supplier_id;
  IF NEW.po_id IS NOT NULL THEN SELECT domain_id INTO x FROM purchase_orders WHERE id=NEW.po_id; IF x<>v THEN RAISE EXCEPTION 'Facture et bon de domaines différents'; END IF; END IF;
  IF NEW.campaign_id IS NOT NULL THEN SELECT domain_id INTO x FROM campaigns WHERE id=NEW.campaign_id; IF x<>v THEN RAISE EXCEPTION 'Facture et campagne de domaines différents'; END IF; END IF;
  IF NEW.greenhouse_id IS NOT NULL THEN SELECT f.domain_id INTO x FROM greenhouses g JOIN farms f ON f.id=g.farm_id WHERE g.id=NEW.greenhouse_id; IF x<>v THEN RAISE EXCEPTION 'Facture et serre de domaines différents'; END IF; END IF;
  IF v IS NULL THEN RAISE EXCEPTION 'Fournisseur introuvable'; END IF; NEW.domain_id:=v; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.sync_payment_made_domain() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN SELECT domain_id INTO NEW.domain_id FROM supplier_invoices WHERE id=NEW.supplier_invoice_id; IF NEW.domain_id IS NULL THEN RAISE EXCEPTION 'Facture fournisseur introuvable'; END IF; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.sync_stock_item_domain() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE x UUID; BEGIN
  IF NEW.supplier_id IS NOT NULL THEN SELECT domain_id INTO x FROM suppliers WHERE id=NEW.supplier_id; IF x<>NEW.domain_id THEN RAISE EXCEPTION 'Article et fournisseur de domaines différents'; END IF; END IF; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.sync_stock_movement_domain() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v UUID; x UUID; BEGIN SELECT domain_id INTO v FROM stock_items WHERE id=NEW.stock_item_id;
  IF NEW.campaign_id IS NOT NULL THEN SELECT domain_id INTO x FROM campaigns WHERE id=NEW.campaign_id; IF x<>v THEN RAISE EXCEPTION 'Mouvement et campagne de domaines différents'; END IF; END IF;
  IF NEW.greenhouse_id IS NOT NULL THEN SELECT f.domain_id INTO x FROM greenhouses g JOIN farms f ON f.id=g.farm_id WHERE g.id=NEW.greenhouse_id; IF x<>v THEN RAISE EXCEPTION 'Mouvement et serre de domaines différents'; END IF; END IF;
  IF NEW.po_id IS NOT NULL THEN SELECT domain_id INTO x FROM purchase_orders WHERE id=NEW.po_id; IF x<>v THEN RAISE EXCEPTION 'Mouvement et bon de domaines différents'; END IF; END IF;
  IF v IS NULL THEN RAISE EXCEPTION 'Article introuvable'; END IF; NEW.domain_id:=v; RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_purchase_order_domain ON public.purchase_orders;
CREATE TRIGGER trg_purchase_order_domain BEFORE INSERT OR UPDATE OF supplier_id,campaign_id,greenhouse_id,domain_id ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.sync_purchase_order_domain();
DROP TRIGGER IF EXISTS trg_purchase_line_domain ON public.purchase_order_lines;
CREATE TRIGGER trg_purchase_line_domain BEFORE INSERT OR UPDATE OF po_id,stock_item_id,domain_id ON public.purchase_order_lines FOR EACH ROW EXECUTE FUNCTION public.sync_purchase_line_domain();
DROP TRIGGER IF EXISTS trg_supplier_invoice_domain ON public.supplier_invoices;
CREATE TRIGGER trg_supplier_invoice_domain BEFORE INSERT OR UPDATE OF supplier_id,po_id,campaign_id,greenhouse_id,domain_id ON public.supplier_invoices FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_invoice_domain();
DROP TRIGGER IF EXISTS trg_payment_made_domain ON public.payments_made;
CREATE TRIGGER trg_payment_made_domain BEFORE INSERT OR UPDATE OF supplier_invoice_id,domain_id ON public.payments_made FOR EACH ROW EXECUTE FUNCTION public.sync_payment_made_domain();
DROP TRIGGER IF EXISTS trg_stock_item_domain ON public.stock_items;
CREATE TRIGGER trg_stock_item_domain BEFORE INSERT OR UPDATE OF supplier_id,domain_id ON public.stock_items FOR EACH ROW EXECUTE FUNCTION public.sync_stock_item_domain();
DROP TRIGGER IF EXISTS trg_stock_movement_domain ON public.stock_movements;
CREATE TRIGGER trg_stock_movement_domain BEFORE INSERT OR UPDATE OF stock_item_id,campaign_id,greenhouse_id,po_id,domain_id ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.sync_stock_movement_domain();

DO $$ DECLARE t TEXT; module TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['suppliers','purchase_orders','purchase_order_lines','supplier_invoices','payments_made','stock_items','stock_movements'] LOOP
    module:=CASE WHEN t='suppliers' THEN 'fournisseurs' WHEN t IN ('stock_items','stock_movements') THEN 'stocks' ELSE 'achats' END;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','auth_read_'||t,t); EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','admin_write_'||t,t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',t||'_domain_select',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',t||'_domain_insert',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',t||'_domain_update',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',t||'_domain_delete',t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()) OR public.is_domain_member(domain_id,auth.uid()))',t||'_domain_select',t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_domain_permission(domain_id,auth.uid(),%L,''create''))',t||'_domain_insert',t,module);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.has_domain_permission(domain_id,auth.uid(),%L,''edit'')) WITH CHECK (public.has_domain_permission(domain_id,auth.uid(),%L,''edit''))',t||'_domain_update',t,module,module);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.has_domain_permission(domain_id,auth.uid(),%L,''delete''))',t||'_domain_delete',t,module);
  END LOOP;
END $$;
