SELECT key,label FROM public.reference_lists WHERE key='phyto_dose_unit';
SELECT code,label FROM public.reference_values WHERE list_key='phyto_dose_unit' ORDER BY order_idx;
SELECT to_regclass('public.treatment_prescription_schedules') AS schedules,
       to_regclass('public.treatment_schedule_occurrences') AS occurrences;
SELECT schedule_mode,count(*) FROM public.treatment_prescription_schedules GROUP BY schedule_mode;
SELECT s.id,s.schedule_mode,count(o.id) AS occurrences
FROM public.treatment_prescription_schedules s LEFT JOIN public.treatment_schedule_occurrences o ON o.schedule_id=s.id
GROUP BY s.id,s.schedule_mode ORDER BY s.created_at DESC;
