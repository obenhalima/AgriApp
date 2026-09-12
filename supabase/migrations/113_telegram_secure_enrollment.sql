-- 113 : pilote Telegram sécurisé. Aucune commande métier activée par ce lot.
BEGIN;

ALTER TABLE public.chatbot_users ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES public.domains(id);
ALTER TABLE public.chatbot_users ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES public.farms(id);
ALTER TABLE public.chatbot_users ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.chatbot_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_messages ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_scoped_invitation ON public.chatbot_users(enrollment_code)
 WHERE domain_id IS NOT NULL AND enrollment_code IS NOT NULL;

-- Ne pas attribuer automatiquement de droits aux anciens comptes.
-- Ils restent consultables par le super-administrateur et doivent être réinvités.
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT tablename,policyname FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('chatbot_users','chatbot_messages')
  LOOP EXECUTE format('DROP POLICY %I ON public.%I',r.policyname,r.tablename); END LOOP;
END $$;
CREATE POLICY telegram_admin_read ON public.chatbot_users FOR SELECT TO authenticated
  USING(public.is_domain_admin(domain_id,auth.uid()));
CREATE POLICY telegram_admin_messages_read ON public.chatbot_messages FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.chatbot_users u WHERE u.id=chatbot_user_id
    AND public.is_domain_admin(u.domain_id,auth.uid())));
-- Ecritures uniquement via RPC contrôlées (pas de changement de périmètre depuis le navigateur).
REVOKE INSERT,UPDATE,DELETE ON public.chatbot_users,public.chatbot_messages FROM authenticated,anon;

CREATE OR REPLACE FUNCTION public.telegram_invitable_workers(p_domain_id UUID)
RETURNS TABLE(id UUID,first_name TEXT,last_name TEXT,farm_id UUID,farm_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT w.id,w.first_name::TEXT,w.last_name::TEXT,f.id,f.name::TEXT
 FROM workers w LEFT JOIN teams t ON t.id=w.team_id
 JOIN farms f ON f.id=COALESCE(w.farm_id,t.farm_id)
 JOIN domains d ON d.id=f.domain_id AND d.is_active
 WHERE w.is_active AND f.is_active AND f.domain_id=p_domain_id
 AND public.is_domain_admin(p_domain_id,auth.uid()) ORDER BY w.last_name,w.first_name;
$$;

CREATE OR REPLACE FUNCTION public.invite_telegram_worker(p_domain_id UUID,p_worker_id UUID,p_language TEXT DEFAULT 'darija')
RETURNS TABLE(code TEXT,expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_farm UUID; v_code TEXT; v_exp TIMESTAMPTZ;
BEGIN
 IF NOT public.is_domain_admin(p_domain_id,auth.uid()) THEN RAISE EXCEPTION 'Administration de cette société requise'; END IF;
 IF p_language IS NULL OR p_language NOT IN ('fr','en','ar','darija') THEN RAISE EXCEPTION 'Langue invalide'; END IF;
 -- Verrou par employé : deux invitations concurrentes ne restent pas actives.
 PERFORM 1 FROM workers WHERE id=p_worker_id FOR UPDATE;
 SELECT f.id INTO v_farm FROM workers w LEFT JOIN teams t ON t.id=w.team_id
 JOIN farms f ON f.id=COALESCE(w.farm_id,t.farm_id)
 JOIN domains d ON d.id=f.domain_id AND d.is_active
 WHERE w.id=p_worker_id AND w.is_active AND f.is_active AND f.domain_id=p_domain_id;
 IF v_farm IS NULL THEN RAISE EXCEPTION 'Employé actif rattaché à une ferme de cette société requis'; END IF;
 UPDATE chatbot_users SET is_active=FALSE,enrollment_code=NULL,enrollment_code_expires_at=NULL,
   receive_recap=FALSE,session_state='{}'::JSONB
 WHERE worker_id=p_worker_id AND channel='telegram';
 v_code:=upper(left(replace(gen_random_uuid()::TEXT,'-',''),20));
 v_exp:=now()+interval '7 days';
 INSERT INTO chatbot_users(worker_id,domain_id,farm_id,invited_by,channel,channel_user_id,language,
   enrollment_code,enrollment_code_expires_at,is_active,receive_recap)
 VALUES(p_worker_id,p_domain_id,v_farm,auth.uid(),'telegram','pending_'||v_code,p_language,v_code,v_exp,TRUE,FALSE);
 RETURN QUERY SELECT v_code,v_exp;
END $$;

CREATE OR REPLACE FUNCTION public.disable_telegram_user(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE chatbot_users SET is_active=FALSE,enrollment_code=NULL,enrollment_code_expires_at=NULL,
   receive_recap=FALSE,session_state='{}'::JSONB
 WHERE id=p_id AND public.is_domain_admin(domain_id,auth.uid());
 IF NOT FOUND THEN RAISE EXCEPTION 'Compte absent ou accès refusé'; END IF;
END $$;

-- Réservé au webhook. Consommation atomique, code expiré/désactivé refusé.
CREATE OR REPLACE FUNCTION public.enroll_telegram_user(p_code TEXT,p_chat_id TEXT,p_username TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user chatbot_users%ROWTYPE;
BEGIN
 IF p_chat_id IS NULL OR p_chat_id !~ '^[1-9][0-9]{0,19}$' THEN RETURN FALSE; END IF;
 -- Sérialise aussi deux codes différents présentés par le même compte Telegram.
 PERFORM pg_advisory_xact_lock(hashtextextended('telegram:'||p_chat_id,0));
 SELECT * INTO v_user FROM chatbot_users WHERE enrollment_code=upper(trim(p_code))
   AND channel='telegram' AND is_active AND enrolled_at IS NULL
   AND enrollment_code_expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN FALSE; END IF;
 IF NOT EXISTS(SELECT 1 FROM workers w LEFT JOIN teams t ON t.id=w.team_id
   JOIN farms f ON f.id=COALESCE(w.farm_id,t.farm_id)
   JOIN domains d ON d.id=f.domain_id AND d.is_active
   WHERE w.id=v_user.worker_id AND w.is_active AND f.is_active
   AND f.id=v_user.farm_id AND f.domain_id=v_user.domain_id) THEN RETURN FALSE; END IF;
 IF EXISTS(SELECT 1 FROM chatbot_users WHERE channel='telegram' AND channel_user_id=p_chat_id AND is_active)
 THEN RETURN FALSE; END IF;
 -- Libère uniquement l'identifiant d'un ancien compte désactivé, conserve son historique.
 UPDATE chatbot_users SET channel_user_id='retired_'||id::TEXT
 WHERE channel='telegram' AND channel_user_id=p_chat_id AND NOT is_active;
 UPDATE chatbot_users SET channel_user_id=p_chat_id,channel_username=left(p_username,100),
   enrolled_at=now(),enrollment_code=NULL,enrollment_code_expires_at=NULL,session_state='{}'::JSONB
 WHERE id=v_user.id;
 RETURN TRUE;
END $$;

CREATE OR REPLACE FUNCTION public.telegram_access_context(p_chat_id TEXT)
RETURNS TABLE(id UUID,domain_id UUID,farm_id UUID,worker_id UUID,language TEXT,worker_name TEXT,farm_name TEXT,domain_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT u.id,u.domain_id,u.farm_id,u.worker_id,u.language::TEXT,
 concat_ws(' ',w.first_name,w.last_name),f.name::TEXT,d.name::TEXT
 FROM chatbot_users u JOIN workers w ON w.id=u.worker_id AND w.is_active
 LEFT JOIN teams t ON t.id=w.team_id
 JOIN farms f ON f.id=u.farm_id AND f.id=COALESCE(w.farm_id,t.farm_id) AND f.is_active
 JOIN domains d ON d.id=u.domain_id AND d.id=f.domain_id AND d.is_active
 WHERE u.channel='telegram' AND u.channel_user_id=p_chat_id AND u.is_active AND u.enrolled_at IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.telegram_invitable_workers(UUID),public.invite_telegram_worker(UUID,UUID,TEXT),public.disable_telegram_user(UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.telegram_invitable_workers(UUID),public.invite_telegram_worker(UUID,UUID,TEXT),public.disable_telegram_user(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.enroll_telegram_user(TEXT,TEXT,TEXT),public.telegram_access_context(TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_telegram_user(TEXT,TEXT,TEXT),public.telegram_access_context(TEXT) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
