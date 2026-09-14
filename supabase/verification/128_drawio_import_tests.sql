-- Recette entièrement annulée par le script appelant (ROLLBACK).
DO $$
DECLARE actor uuid; d uuid; f uuid; other_f uuid; existing uuid; foreign_gh uuid; iid uuid:=gen_random_uuid();
 rows_data jsonb; decor jsonb; result_data jsonb; bad jsonb; rejected boolean; before_count integer;
BEGIN
 SELECT p.id,dm.domain_id INTO actor,d FROM public.profiles p JOIN public.domain_memberships dm ON dm.user_id=p.id
 WHERE p.is_active AND dm.is_active AND public.has_domain_permission(dm.domain_id,p.id,'fermes','edit')
 AND public.has_domain_permission(dm.domain_id,p.id,'serres','create') LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'Compte de recette habilité requis'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 INSERT INTO farms(code,name,domain_id) VALUES('QA128-'||left(gen_random_uuid()::text,8),'QA import annulé',d) RETURNING id INTO f;
 INSERT INTO farms(code,name,domain_id) VALUES('QA128-'||left(gen_random_uuid()::text,8),'QA autre ferme annulée',d) RETURNING id INTO other_f;
 INSERT INTO greenhouses(farm_id,code,name,type,status,total_area,exploitable_area) VALUES(f,'S1','Existante','tunnel','active',2000,1900) RETURNING id INTO existing;
 INSERT INTO greenhouses(farm_id,code,name,type,status,total_area,exploitable_area) VALUES(other_f,'S1','Autre ferme','tunnel','active',2000,1900) RETURNING id INTO foreign_gh;
 rows_data:=jsonb_build_array(
 jsonb_build_object('source_id','a','greenhouse_id',existing,'x',100,'y',100,'width',100,'height',100,'rotation',0),
 jsonb_build_object('source_id','b','new_greenhouse',jsonb_build_object('code','S2','name','Nouvelle','type','tunnel','status','active','total_area',7360.25,'exploitable_area',7300),'x',300,'y',100,'width',100,'height',100,'rotation',90));
 decor:='[{"id":"bassin","label":"Bassin","kind":"bassin","shape":"rect","x":600,"y":300,"width":100,"height":80,"rotation":0,"fill":"#ffffff","stroke":"#123456","fontColor":"#000000","fontSize":12}]';
 result_data:=import_farm_drawio_plan(f,0,rows_data,decor,iid);
 IF result_data->>'created_count'<>'1' OR result_data->>'linked_count'<>'1' OR result_data->>'revision'<>'1' THEN RAISE EXCEPTION 'Résultat import incorrect'; END IF;
 IF (SELECT total_area FROM greenhouses WHERE id=existing)<>2000 THEN RAISE EXCEPTION 'Surface existante modifiée'; END IF;
 IF (SELECT total_area FROM greenhouses WHERE farm_id=f AND code='S2')<>7360.25 THEN RAISE EXCEPTION 'Surface officielle perdue'; END IF;
 IF (SELECT elements FROM farm_schematic_plans WHERE farm_id=f)<>decor THEN RAISE EXCEPTION 'Décor perdu'; END IF;
 IF import_farm_drawio_plan(f,0,rows_data,decor,iid)<>result_data OR (SELECT count(*) FROM greenhouses WHERE farm_id=f)<>2 THEN RAISE EXCEPTION 'Nouvel essai non idempotent'; END IF;
 rejected:=false;
 BEGIN PERFORM import_farm_drawio_plan(f,0,rows_data,'[]',iid); EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Identifiant d’import déjà utilisé%' THEN RAISE; END IF; rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Identifiant réutilisé avec contenu différent'; END IF;
 rejected:=false;
 BEGIN PERFORM import_farm_drawio_plan(f,0,rows_data,decor,gen_random_uuid()); EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Le plan a été modifié%' THEN RAISE; END IF; rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Révision périmée acceptée'; END IF;
 bad:=jsonb_build_array(jsonb_set(rows_data->1,'{new_greenhouse,code}','"S3"'),jsonb_set(rows_data->0,'{greenhouse_id}',to_jsonb(foreign_gh)));
 rejected:=false;
 BEGIN PERFORM import_farm_drawio_plan(f,1,bad,decor,gen_random_uuid()); EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Serre manquante ou étrangère%' THEN RAISE; END IF; rejected:=true; END;
 IF NOT rejected OR EXISTS(SELECT 1 FROM greenhouses WHERE farm_id=f AND code='S3') THEN RAISE EXCEPTION 'Import partiel ou serre étrangère accepté'; END IF;
 bad:=jsonb_build_array(rows_data->0,rows_data->0); rejected:=false;
 BEGIN PERFORM import_farm_drawio_plan(f,1,bad,decor,gen_random_uuid()); EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Forme dupliquée%' THEN RAISE; END IF; rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Forme dupliquée acceptée'; END IF;
 bad:=jsonb_build_array(jsonb_set(rows_data->1,'{new_greenhouse,code}','"S01"'));rejected:=false;
 BEGIN PERFORM import_farm_drawio_plan(f,1,bad,decor,gen_random_uuid()); EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'La serre % existe déjà%' THEN RAISE; END IF; rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Doublon de code normalisé accepté'; END IF;
 bad:=jsonb_build_array(jsonb_set(jsonb_set(rows_data->1,'{new_greenhouse,code}','"S3"'),'{new_greenhouse,total_area}','0'));rejected:=false;
 BEGIN PERFORM import_farm_drawio_plan(f,1,bad,decor,gen_random_uuid()); EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Surfaces invalides%' THEN RAISE; END IF; rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Surface nulle acceptée'; END IF;
 rejected:=false;
 BEGIN PERFORM validate_farm_plan_elements(jsonb_set(jsonb_set(decor,'{0,shape}','"image"'),'{0,image}','"https://example.com/picture.png"')); EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Seuls les petits pictogrammes%' THEN RAISE; END IF; rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Image externe acceptée'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);rejected:=false;
 BEGIN PERFORM import_farm_drawio_plan(f,1,rows_data,decor,gen_random_uuid()); EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Import non autorisé%' THEN RAISE; END IF; rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Anonyme accepté'; END IF;
 IF has_function_privilege('anon','public.import_farm_drawio_plan(uuid,integer,jsonb,jsonb,uuid)','execute') THEN RAISE EXCEPTION 'Droit anonyme accordé'; END IF;
END $$;
SELECT 'PASS: rattachement, création atomique, surfaces, décor, retry, révision, doublons, cloisonnement, refus anonyme' AS verification;
