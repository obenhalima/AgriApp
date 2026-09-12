-- Lecture seule après recette ; doit retourner zéro ligne.
SELECT t.id,t.status,count(m.id) AS movements
FROM public.stock_transfers t LEFT JOIN public.stock_movements m ON m.transfer_id=t.id
GROUP BY t.id
HAVING count(m.id)<>CASE t.status WHEN 'en_transit' THEN 1 WHEN 'receptionnee' THEN 2 ELSE 0 END;
SELECT m.id FROM public.stock_movements m JOIN public.stock_transfers t ON t.id=m.transfer_id
WHERE m.domain_id<>t.domain_id OR m.stock_item_id<>t.stock_item_id OR m.quantity<>t.quantity
 OR (m.movement_type='sortie' AND m.warehouse_id<>t.source_id)
 OR (m.movement_type='entree' AND m.warehouse_id<>t.destination_id);
-- Recette transactionnelle à exécuter sur les données de test :
-- A=10, B=0, transfert 3 : soumission et validation sans changement de stock.
-- Auto-validation du demandeur : refus, aucune décision enregistrée.
-- Deux niveaux : N1 ne permet pas d'expédier ; même valideur N2 refusé.
-- Après dernier niveau : expédition A=7 B=0, 3 en transit ; réception A=7 B=3.
-- Répéter expédition/réception : refus, aucune quantité comptée deux fois.
-- Stock source consommé entre demande et expédition : refus et rollback complet.
-- Deux expéditions concurrentes dépassant A : une échoue, jamais de solde négatif.
-- Entrepôt autre client : refus. Source=destination : refus.
-- Validation désactivée : décision automatique tracée, expédition autorisée.
-- Annulation avant expédition : aucun mouvement ; après expédition : refus.
