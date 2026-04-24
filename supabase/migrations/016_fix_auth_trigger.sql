-- ============================================================
-- FIX : trigger de création auto du profil échoue à la signup.
-- Symptôme : "Database error creating new user" dans le dashboard.
--
-- Cause : la fonction doit être qualifiée avec le schéma public,
-- avoir un search_path explicite, et supabase_auth_admin doit
-- avoir le droit d'exécuter la fonction.
-- ============================================================

-- 1. Recrée la fonction avec les bonnes options
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    TRUE
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- On ne bloque jamais la création du user si le profil échoue
  -- (on le créera manuellement au besoin)
  RAISE WARNING 'handle_new_auth_user failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- 2. Accorde EXECUTE à tous les rôles qui peuvent déclencher le trigger
GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO postgres;
GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO service_role;

-- 3. Accorde INSERT sur profiles au rôle auth (au cas où SECURITY DEFINER ne suffirait pas)
GRANT INSERT, UPDATE ON public.profiles TO supabase_auth_admin;

-- 4. Recrée le trigger pour être sûr
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
