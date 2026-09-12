SELECT count(*) AS empty_targets FROM public.phyto_targets WHERE NULLIF(btrim(canonical_name),'') IS NULL;
SELECT count(*) AS invalid_validated_entries FROM public.phyto_positive_list_entries WHERE review_status='valide' AND (target_id IS NULL OR product_id IS NULL OR NULLIF(btrim(target_label),'') IS NULL);
SELECT id,list_id,source_page,source_row,target_label,review_status FROM public.phyto_positive_list_entries WHERE target_label='Cible à identifier';
