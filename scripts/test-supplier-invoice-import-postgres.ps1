param([ValidateRange(1024,65535)][int]$Port = 55489)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$pg = Join-Path $tempRoot ('itrix-invoice-test-' + [guid]::NewGuid().ToString('N'))
Push-Location $repo
$started = $false
try {
initdb -D $pg -U postgres -A trust --no-locale -E UTF8 | Out-Null
if ($LASTEXITCODE) { exit $LASTEXITCODE }
pg_ctl -D $pg -l (Join-Path $pg 'server.log') -o "-p $Port -h 127.0.0.1" -w -t 20 start
if ($LASTEXITCODE) { Get-Content (Join-Path $pg 'server.log'); exit 1 }
$started = $true
@'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
CREATE TABLE public.domains(id uuid PRIMARY KEY);
CREATE TABLE public.suppliers(id uuid PRIMARY KEY, domain_id uuid REFERENCES domains);
CREATE TABLE public.supplier_invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), domain_id uuid REFERENCES domains,
  supplier_id uuid REFERENCES suppliers, po_id uuid, invoice_number text, invoice_date date, due_date date,
  currency text, subtotal numeric, tax_amount numeric, total_amount numeric);
CREATE TABLE public.purchase_orders(id uuid PRIMARY KEY, domain_id uuid, supplier_id uuid, currency text);
CREATE TABLE public.stock_items(id uuid PRIMARY KEY, domain_id uuid, is_active boolean);
CREATE FUNCTION public.is_platform_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.is_domain_member(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1=$2 $$;
CREATE FUNCTION public.has_domain_permission(uuid,uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1=$2 AND $3='achats' AND $4='create' $$;
CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit int, allowed_mime_types text[]);
CREATE TABLE storage.objects(bucket_id text, name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA auth,storage TO authenticated;
GRANT SELECT ON storage.objects TO authenticated;
GRANT SELECT,INSERT ON supplier_invoices TO authenticated;
'@ | psql -h 127.0.0.1 -p $Port -U postgres -X -v ON_ERROR_STOP=1
if ($LASTEXITCODE) { exit $LASTEXITCODE }
psql -h 127.0.0.1 -p $Port -U postgres -X -v ON_ERROR_STOP=1 -f 'supabase/migrations/20261121111937_supplier_invoice_imports.sql' -f 'supabase/migrations/20261121112705_supplier_invoice_import_workflow.sql'
if ($LASTEXITCODE) { exit $LASTEXITCODE }
@'
INSERT INTO domains VALUES ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001');
INSERT INTO suppliers VALUES ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001');
INSERT INTO supplier_invoice_imports(id,domain_id,filename,mime_type,byte_size,sha256,status,extracted_data) VALUES
('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','a.pdf','application/pdf',5,repeat('a',64),'queued','{"invoice":{"number":"ERR"}}'),
('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','b.pdf','application/pdf',5,repeat('b',64),'to_review','{}');
INSERT INTO storage.objects SELECT 'supplier-invoice-imports', object_path || '/preview-1.jpg' FROM supplier_invoice_imports;
DO $$ BEGIN
  IF (SELECT count(*) FROM claim_supplier_invoice_import() WHERE status='processing' AND attempt=1 AND lease_until > now()) <> 1 THEN RAISE EXCEPTION 'Claim failed'; END IF;
  IF (SELECT count(*) FROM claim_supplier_invoice_import()) <> 0 THEN RAISE EXCEPTION 'Claim repeated'; END IF;
END $$;
UPDATE supplier_invoice_imports SET status='to_review' WHERE id='00000000-0000-0000-0000-000000000004';
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
DO $$ BEGIN
  IF (SELECT count(*) FROM storage.objects) <> 2 THEN RAISE EXCEPTION 'Preview RLS failure'; END IF;
END $$;
INSERT INTO supplier_invoices(domain_id,supplier_id,invoice_number,invoice_date,due_date,currency,subtotal,tax_amount,total_amount,supplier_invoice_import_id,supplier_invoice_review)
VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','CORRECT','2026-01-01','2026-02-01','MAD',100,20,120,
'00000000-0000-0000-0000-000000000004','{"supplier_id":"00000000-0000-0000-0000-000000000003","stock_matches":[],"data":{"invoice":{"number":"CORRECT","date":"2026-01-01","due_date":"2026-02-01","currency":"MAD"},"totals":{"total_ht":100,"total_vat":20,"total_ttc":120}}}');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM supplier_invoice_imports WHERE status='validated' AND invoice_id IS NOT NULL
    AND corrections @> '[{"field":"data.invoice.number","extracted":"ERR","final":"CORRECT"}]') THEN RAISE EXCEPTION 'Finalize failed'; END IF;
  BEGIN
    INSERT INTO supplier_invoices(domain_id,supplier_id,invoice_number,invoice_date,due_date,currency,subtotal,tax_amount,total_amount,supplier_invoice_import_id,supplier_invoice_review)
    SELECT domain_id,supplier_id,invoice_number,invoice_date,due_date,currency,subtotal,tax_amount,total_amount,
      '00000000-0000-0000-0000-000000000005',supplier_invoice_review FROM supplier_invoices LIMIT 1;
    RAISE EXCEPTION 'Duplicate accepted' USING ERRCODE='XX000';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  IF (SELECT count(*) FROM supplier_invoices) <> 1 OR
    NOT EXISTS (SELECT 1 FROM supplier_invoice_imports WHERE id='00000000-0000-0000-0000-000000000005' AND status='to_review') THEN
    RAISE EXCEPTION 'Duplicate rollback failed';
  END IF;
END $$;
'@ | psql -h 127.0.0.1 -p $Port -U postgres -X -v ON_ERROR_STOP=1
if ($LASTEXITCODE) { exit $LASTEXITCODE }
} finally {
  if ($started) { pg_ctl -D $pg -m fast -w stop }
  Pop-Location
  if (Test-Path -LiteralPath $pg) {
    $resolved = (Resolve-Path -LiteralPath $pg).Path
    if ($resolved -eq $pg -and (Split-Path -Leaf $resolved) -match '^itrix-invoice-test-[0-9a-f]{32}$') {
      Remove-Item -LiteralPath $resolved -Recurse -Force
    }
  }
}
