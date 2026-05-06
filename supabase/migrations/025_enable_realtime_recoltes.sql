-- ============================================================
-- Active Supabase Realtime sur les tables du cycle récoltes
-- pour que /recoltes se mette à jour automatiquement quand
-- une saisie arrive via le chatbot Telegram (ou tout autre canal).
-- ============================================================

-- Idempotent : on ignore l'erreur si déjà ajouté
DO $$
BEGIN
  -- harvests
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE harvests;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- harvest_lots
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE harvest_lots;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- harvest_lot_sources (créée en migration 024)
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE harvest_lot_sources;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- alerts (pour journées sans récolte)
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ============================================================
-- Pour vérifier ce qui est dans la publication :
--   SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
-- ============================================================
