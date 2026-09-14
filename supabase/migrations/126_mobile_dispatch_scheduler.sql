-- Automatic mobile outbox delivery. Secrets are provisioned separately, never committed.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE OR REPLACE FUNCTION public.mobile_configure_dispatch(p_url text,p_secret text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE secret_id uuid;
BEGIN
 IF p_url !~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/mobile-dispatch$'
 OR length(p_secret)<48 THEN RAISE EXCEPTION 'Invalid dispatcher configuration'; END IF;
 SELECT id INTO secret_id FROM vault.secrets WHERE name='farmpilot_mobile_dispatch_url';
 IF secret_id IS NULL THEN PERFORM vault.create_secret(p_url,'farmpilot_mobile_dispatch_url');
 ELSE PERFORM vault.update_secret(secret_id,p_url); END IF;
 SELECT id INTO secret_id FROM vault.secrets WHERE name='farmpilot_mobile_dispatch_secret';
 IF secret_id IS NULL THEN PERFORM vault.create_secret(p_secret,'farmpilot_mobile_dispatch_secret');
 ELSE PERFORM vault.update_secret(secret_id,p_secret); END IF;
END $$;
REVOKE ALL ON FUNCTION public.mobile_configure_dispatch(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_configure_dispatch(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.mobile_dispatch_tick()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE destination text; credential text;
BEGIN
 SELECT decrypted_secret INTO destination FROM vault.decrypted_secrets WHERE name='farmpilot_mobile_dispatch_url';
 SELECT decrypted_secret INTO credential FROM vault.decrypted_secrets WHERE name='farmpilot_mobile_dispatch_secret';
 IF destination IS NULL OR credential IS NULL THEN RETURN NULL; END IF;
 RETURN net.http_post(url:=destination,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),body:='{}'::jsonb,timeout_milliseconds:=55000);
END $$;
REVOKE ALL ON FUNCTION public.mobile_dispatch_tick() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_dispatch_tick() TO service_role;
SELECT cron.schedule('farmpilot-mobile-dispatch','* * * * *','SELECT public.mobile_dispatch_tick();');
NOTIFY pgrst,'reload schema';
COMMIT;
