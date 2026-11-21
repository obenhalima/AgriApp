ALTER TABLE public.supplier_invoice_imports ADD COLUMN preview_pages smallint CHECK (preview_pages BETWEEN 1 AND 5);
CREATE FUNCTION public.claim_supplier_invoice_import()
RETURNS SETOF public.supplier_invoice_imports
LANGUAGE sql SET search_path = '' AS $$
  UPDATE public.supplier_invoice_imports SET
    status = 'processing', attempt = attempt + 1,
    lease_until = now() + interval '10 minutes', error_message = NULL
  WHERE id = (
    SELECT id FROM public.supplier_invoice_imports
    WHERE status = 'queued' OR (status = 'processing' AND lease_until < now())
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
  )
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_supplier_invoice_import() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_supplier_invoice_import() TO service_role;

-- The invoice trigger and its RLS remain active in the original create flow.
-- This security-definer function only finalizes an import after a user-scoped insert
-- in the same transaction through the invoice trigger below.
ALTER TABLE public.supplier_invoices ADD COLUMN supplier_invoice_import_id uuid
  UNIQUE REFERENCES public.supplier_invoice_imports(id) ON DELETE SET NULL;
ALTER TABLE public.supplier_invoices ADD COLUMN supplier_invoice_review jsonb;

CREATE FUNCTION public.supplier_invoice_field_corrections(original jsonb, reviewed jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  WITH RECURSIVE fields(path, old_value, new_value) AS (
    SELECT ARRAY[]::text[], original, reviewed
    UNION ALL
    SELECT fields.path || child.key, child.old_value, child.new_value
    FROM fields
    CROSS JOIN LATERAL (
      SELECT coalesce(a.key, b.key) AS key, a.value AS old_value, b.value AS new_value
      FROM jsonb_each(CASE WHEN jsonb_typeof(old_value) = 'object' THEN old_value ELSE '{}'::jsonb END) a
      FULL JOIN jsonb_each(CASE WHEN jsonb_typeof(new_value) = 'object' THEN new_value ELSE '{}'::jsonb END) b USING (key)
      UNION ALL
      SELECT (coalesce(a.position, b.position) - 1)::text, a.value, b.value
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(old_value) = 'array' THEN old_value ELSE '[]'::jsonb END)
        WITH ORDINALITY a(value, position)
      FULL JOIN jsonb_array_elements(CASE WHEN jsonb_typeof(new_value) = 'array' THEN new_value ELSE '[]'::jsonb END)
        WITH ORDINALITY b(value, position) USING (position)
    ) child
    WHERE fields.old_value IS DISTINCT FROM fields.new_value
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('field', array_to_string(path, '.'),
    'extracted', old_value, 'final', new_value) ORDER BY path), '[]'::jsonb)
  FROM fields
  WHERE cardinality(path) > 0 AND old_value IS DISTINCT FROM new_value
    AND coalesce(jsonb_typeof(old_value), 'null') NOT IN ('object', 'array')
    AND coalesce(jsonb_typeof(new_value), 'null') NOT IN ('object', 'array')
$$;

REVOKE ALL ON FUNCTION public.supplier_invoice_field_corrections(jsonb, jsonb) FROM PUBLIC;

CREATE FUNCTION public.finalize_supplier_invoice_import() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE job public.supplier_invoice_imports;
DECLARE duplicate_id uuid;
BEGIN
  IF NEW.supplier_invoice_import_id IS NULL THEN
    IF NEW.supplier_invoice_review IS NOT NULL THEN RAISE EXCEPTION 'Import requis.'; END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO job FROM public.supplier_invoice_imports
    WHERE id = NEW.supplier_invoice_import_id AND domain_id = NEW.domain_id FOR UPDATE;
  IF NOT FOUND OR job.status <> 'to_review' OR auth.uid() IS NULL
      OR NOT public.has_domain_permission(NEW.domain_id, auth.uid(), 'achats', 'create') THEN
    RAISE EXCEPTION 'Import inaccessible ou déjà traité.';
  END IF;
  IF jsonb_typeof(NEW.supplier_invoice_review -> 'data') IS DISTINCT FROM 'object'
      OR NEW.supplier_invoice_review ->> 'supplier_id' IS DISTINCT FROM NEW.supplier_id::text
      OR NEW.supplier_invoice_review #>> '{data,invoice,number}' IS DISTINCT FROM NEW.invoice_number
      OR NEW.supplier_invoice_review #>> '{data,invoice,date}' IS DISTINCT FROM NEW.invoice_date::text
      OR NEW.supplier_invoice_review #>> '{data,invoice,due_date}' IS DISTINCT FROM NEW.due_date::text
      OR NEW.supplier_invoice_review #>> '{data,invoice,currency}' IS DISTINCT FROM NEW.currency
      OR (NEW.supplier_invoice_review #>> '{data,totals,total_ht}')::numeric IS DISTINCT FROM NEW.subtotal
      OR (NEW.supplier_invoice_review #>> '{data,totals,total_ttc}')::numeric IS DISTINCT FROM NEW.total_amount
      OR ((NEW.supplier_invoice_review #>> '{data,totals,total_vat}')::numeric +
        coalesce((NEW.supplier_invoice_review #>> '{data,totals,stamp_duty}')::numeric, 0)) IS DISTINCT FROM NEW.tax_amount
      OR jsonb_typeof(NEW.supplier_invoice_review -> 'stock_matches') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'La revue doit correspondre aux champs de la facture.';
  END IF;
  IF trim(NEW.invoice_number) = '' OR NEW.currency IS NULL OR NEW.currency !~ '^[A-Z]{3}$'
      OR NEW.tax_amount IS NULL
      OR NEW.due_date < NEW.invoice_date
      OR NEW.invoice_date > (now() AT TIME ZONE 'Africa/Casablanca')::date
      OR NEW.subtotal < 0 OR NEW.tax_amount < 0 OR NEW.total_amount <= 0
      OR abs(NEW.subtotal + NEW.tax_amount - NEW.total_amount) > 0.05 THEN
    RAISE EXCEPTION 'Vérifiez le numéro, la devise, les dates et les montants de la facture.';
  END IF;
  IF NEW.po_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.purchase_orders WHERE id = NEW.po_id AND domain_id = NEW.domain_id
      AND supplier_id = NEW.supplier_id AND currency = NEW.currency
  ) THEN
    RAISE EXCEPTION 'Le fournisseur ou la devise diffère du bon d’achat.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.supplier_invoice_review -> 'stock_matches') match
    WHERE coalesce((match ->> 'factor')::numeric, 0) <= 0
      OR NOT EXISTS (SELECT 1 FROM public.stock_items item WHERE item.id = (match ->> 'stock_item_id')::uuid
        AND item.domain_id = NEW.domain_id AND item.is_active)
  ) THEN
    RAISE EXCEPTION 'Vérifiez les articles et leurs conversions.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    NEW.domain_id::text || '/' || NEW.supplier_id::text || '/' || upper(trim(NEW.invoice_number)), 0));
  SELECT id INTO duplicate_id FROM public.supplier_invoices
    WHERE domain_id = NEW.domain_id AND supplier_id = NEW.supplier_id
      AND upper(trim(invoice_number)) = upper(trim(NEW.invoice_number)) AND id <> NEW.id LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'Une facture portant ce numéro existe déjà.' USING DETAIL = duplicate_id::text; END IF;

  UPDATE public.supplier_invoice_imports SET
    status = 'validated', invoice_id = NEW.id, validated_at = now(), validated_by = auth.uid(),
    validated_data = NEW.supplier_invoice_review,
    corrections = public.supplier_invoice_field_corrections(
      jsonb_build_object('data', job.extracted_data), NEW.supplier_invoice_review
    )
  WHERE id = job.id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_supplier_invoice_import() FROM PUBLIC;
CREATE TRIGGER finalize_supplier_invoice_import AFTER INSERT ON public.supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION public.finalize_supplier_invoice_import();

CREATE FUNCTION public.guard_supplier_invoice_import_fields() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND (
    NEW.supplier_invoice_import_id IS DISTINCT FROM OLD.supplier_invoice_import_id
    OR NEW.supplier_invoice_review IS DISTINCT FROM OLD.supplier_invoice_review
  ) THEN
    RAISE EXCEPTION 'Le rattachement de l’import est géré lors de la création de la facture.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_supplier_invoice_import_fields() FROM PUBLIC;
CREATE TRIGGER guard_supplier_invoice_import_fields
  BEFORE UPDATE OF supplier_invoice_import_id, supplier_invoice_review ON public.supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_invoice_import_fields();

CREATE POLICY supplier_invoice_import_preview_read ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'supplier-invoice-imports'
    AND storage.objects.name ~ '/preview-[1-5]\.jpg$'
    AND EXISTS (
      SELECT 1 FROM public.supplier_invoice_imports AS invoice_import
      WHERE invoice_import.object_path = regexp_replace(storage.objects.name, '/preview-[1-5]\.jpg$', '')
    )
  );
