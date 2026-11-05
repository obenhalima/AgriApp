BEGIN;
ALTER TABLE public.stock_exit_requests
 ADD COLUMN cancelled_by uuid REFERENCES public.profiles(id),
 ADD COLUMN cancelled_at timestamptz;
CREATE FUNCTION public.cancel_stock_exit_request(p_request_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' AS $fn$
DECLARE request public.stock_exit_requests%ROWTYPE; approval public.approval_requests%ROWTYPE;
BEGIN
 SELECT * INTO request FROM public.stock_exit_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR request.requested_by IS DISTINCT FROM auth.uid()
 OR NOT coalesce(public.has_domain_permission(request.domain_id,auth.uid(),'stocks','view'),false)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND NOT coalesce(must_change_password,false))
 THEN RAISE EXCEPTION 'Seul l’auteur peut annuler sa demande' USING ERRCODE='42501'; END IF;
 IF request.status='annulee' THEN RETURN; END IF;
 IF request.status<>'soumise' OR request.stock_movement_id IS NOT NULL THEN RAISE EXCEPTION 'Annulation possible uniquement avant validation du responsable'; END IF;
 SELECT * INTO approval FROM public.approval_requests WHERE process_code='stock_exit' AND entity_id=request.id AND domain_id=request.domain_id FOR UPDATE;
 IF FOUND THEN
   IF approval.status<>'soumise' OR approval.current_level>1 THEN RAISE EXCEPTION 'La validation a déjà commencé : annulation impossible'; END IF;
   UPDATE public.approval_requests SET status='annulee',completed_at=now(),updated_at=now() WHERE id=approval.id;
 END IF;
 UPDATE public.stock_exit_requests SET status='annulee',cancelled_by=auth.uid(),cancelled_at=now(),updated_at=now() WHERE id=request.id;
END $fn$;
REVOKE ALL ON FUNCTION public.cancel_stock_exit_request(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_stock_exit_request(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
