-- Migration 096 — Stockage privé des fichiers sources des listes positives
BEGIN;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('phyto-positive-lists','phyto-positive-lists',FALSE,15728640,ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','text/csv'])
ON CONFLICT(id) DO UPDATE SET public=FALSE,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS positive_list_files_read ON storage.objects;
CREATE POLICY positive_list_files_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='phyto-positive-lists' AND public.has_domain_permission(((storage.foldername(name))[1])::UUID,auth.uid(),'agronomie','view'));
DROP POLICY IF EXISTS positive_list_files_insert ON storage.objects;
CREATE POLICY positive_list_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='phyto-positive-lists' AND public.has_domain_permission(((storage.foldername(name))[1])::UUID,auth.uid(),'agronomie','edit'));
COMMIT;
