-- ============================================================
-- Active RLS sur toutes les tables publiques qui ne l'ont pas encore
-- + ajoute des policies par défaut :
--   - SELECT : tout utilisateur authentifié
--   - ALL    : admin (is_admin(auth.uid()))
--
-- Stratégie : balaye pg_class pour trouver les tables sans RLS,
-- ignore les tables système et celles déjà couvertes par d'autres
-- migrations (workflows, budgets, RH, chatbot…).
--
-- Idempotent : peut être rejoué sans risque.
-- ============================================================

DO $$
DECLARE
  t RECORD;
  policy_select_name TEXT;
  policy_admin_name TEXT;
BEGIN
  FOR t IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'                      -- tables ordinaires
      AND c.relname NOT LIKE 'pg_%'
      AND c.relname NOT LIKE '_prisma%'
      AND c.relrowsecurity = FALSE             -- RLS pas activé
  LOOP
    -- Active RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);

    policy_select_name := 'auth_read_' || t.tablename;
    policy_admin_name  := 'admin_write_' || t.tablename;

    -- Drop policies existantes du même nom (idempotent)
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_select_name, t.tablename);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_admin_name, t.tablename);

    -- Lecture : authenticated
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      policy_select_name, t.tablename
    );

    -- Écriture (INSERT/UPDATE/DELETE) : admin
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()))',
      policy_admin_name, t.tablename
    );

    RAISE NOTICE 'RLS activée + policies créées pour public.%', t.tablename;
  END LOOP;
END $$;

-- ============================================================
-- Note sur les Edge Functions :
-- Les Edge Functions utilisent SUPABASE_SERVICE_ROLE_KEY qui bypass
-- les policies RLS. Donc le chatbot, le webhook Telegram, daily-recap,
-- les imports Excel, etc. continueront à fonctionner.
--
-- Côté front (Next.js) :
-- - L'utilisateur connecté peut LIRE toutes les tables
-- - Seuls les ADMIN peuvent ÉCRIRE (insert/update/delete)
-- - Pour permettre aux non-admins d'écrire sur certaines tables,
--   ajoute des policies spécifiques après cette migration
--   (ex: users avec rôle 'comptable' peuvent écrire sur cost_entries).
-- ============================================================
