-- Lecture seule, après application de 106b. Les deux requêtes doivent retourner zéro ligne.
SELECT s.id,s.name,s.current_qty,sum(w.current_qty) AS warehouse_total
FROM public.stock_items s LEFT JOIN public.warehouse_stocks w ON w.stock_item_id=s.id
GROUP BY s.id HAVING s.current_qty IS DISTINCT FROM round(COALESCE(sum(w.current_qty),0),2);
SELECT b.* FROM public.warehouse_stocks b
JOIN public.warehouses w ON w.id=b.warehouse_id JOIN public.stock_items s ON s.id=b.stock_item_id
WHERE b.domain_id<>w.domain_id OR b.domain_id<>s.domain_id OR b.current_qty<0;
-- Recette avec données de test :
-- 1. Entrée 10 dans A, 5 dans B : total 15, historique indiquant A/B.
-- 2. Demande sortie 6 de B, validée par un autre utilisateur : exécution refusée.
--    Soldes et état de la demande inchangés.
-- 3. Sortie validée 4 de B : A=10, B=1, total=11.
-- 4. Deux sorties simultanées de 1 de B : une seule réussit, B=0.
-- 5. Seuil B=2 : alerte B, pas A ; seuil persistant après rechargement.
-- 6. Identifiant d'entrepôt d'un autre client : entrée/sortie/seuil refusés.
