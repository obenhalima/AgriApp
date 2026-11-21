-- Supplier invoice imports are written by the authenticated server workflow.
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS ice text CHECK (ice ~ '^[0-9]{15}$'),
  ADD COLUMN IF NOT EXISTS if_number text;
ALTER TABLE public.domains
  ADD COLUMN IF NOT EXISTS ice text CHECK (ice ~ '^[0-9]{15}$');

CREATE INDEX supplier_ice_domain_idx ON public.suppliers (domain_id, ice) WHERE ice IS NOT NULL;
CREATE INDEX supplier_if_domain_idx ON public.suppliers (domain_id, if_number) WHERE if_number IS NOT NULL;

CREATE TABLE public.supplier_invoice_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id uuid NOT NULL REFERENCES public.domains(id) ON DELETE RESTRICT,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  filename text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 255),
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/heic')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 10000000),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  object_path text GENERATED ALWAYS AS (domain_id::text || '/' || sha256) STORED,
  status text NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'queued', 'processing', 'to_review', 'failed', 'abandoned', 'validated')),
  provider text CHECK (provider IN ('gemini', 'ollama')),
  model text,
  duration_ms integer CHECK (duration_ms >= 0),
  raw_payload jsonb,
  extracted_data jsonb,
  validated_data jsonb,
  checks jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(checks) = 'array'),
  corrections jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(corrections) = 'array'),
  error_message text,
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  validated_at timestamptz,
  validated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invoice_id uuid UNIQUE REFERENCES public.supplier_invoices(id) ON DELETE SET NULL,
  UNIQUE (domain_id, sha256)
);

CREATE INDEX supplier_invoice_imports_domain_created_idx
  ON public.supplier_invoice_imports (domain_id, created_at DESC);
CREATE INDEX supplier_invoice_imports_queue_idx
  ON public.supplier_invoice_imports (created_at)
  WHERE status IN ('queued', 'processing');

CREATE FUNCTION public.supplier_invoice_import_before_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.invoice_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.supplier_invoices AS invoice
    WHERE invoice.id = NEW.invoice_id AND invoice.domain_id = NEW.domain_id
  ) THEN
    RAISE EXCEPTION 'La facture et son import doivent appartenir au même client.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER supplier_invoice_import_before_write
  BEFORE INSERT OR UPDATE ON public.supplier_invoice_imports
  FOR EACH ROW EXECUTE FUNCTION public.supplier_invoice_import_before_write();

ALTER TABLE public.supplier_invoice_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_invoice_imports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.supplier_invoice_imports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_invoice_imports TO service_role;

CREATE POLICY supplier_invoice_import_read ON public.supplier_invoice_imports
  FOR SELECT TO authenticated USING (
    public.is_platform_admin((SELECT auth.uid()))
    OR public.is_domain_member(domain_id, (SELECT auth.uid()))
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'supplier-invoice-imports', 'supplier-invoice-imports', false, 10000000,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/heic']
);

CREATE POLICY supplier_invoice_import_object_read ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'supplier-invoice-imports'
    AND EXISTS (
      SELECT 1 FROM public.supplier_invoice_imports AS invoice_import
      WHERE invoice_import.object_path = storage.objects.name
    )
  );

CREATE UNIQUE INDEX supplier_invoice_imports_object_idx
  ON public.supplier_invoice_imports (object_path);
