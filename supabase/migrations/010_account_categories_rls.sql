-- ============================================================
-- RLS POLICIES pour account_categories — Phase 2.1
-- Lecture publique (nécessaire pour les selects partout dans l'app)
-- Écriture réservée aux utilisateurs connectés (durcir en 'admin' plus tard)
-- ============================================================

ALTER TABLE account_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ac_read"  ON account_categories;
DROP POLICY IF EXISTS "ac_write" ON account_categories;

CREATE POLICY "ac_read"  ON account_categories FOR SELECT USING (TRUE);
CREATE POLICY "ac_write" ON account_categories FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
