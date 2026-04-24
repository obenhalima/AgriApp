-- ============================================================
-- RLS POLICIES — budget_versions + budget_lines (Phase 2.2)
-- Lecture publique, écriture auth (durcir en 'admin' plus tard)
-- ============================================================

ALTER TABLE budget_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_lines    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bv_read"  ON budget_versions;
DROP POLICY IF EXISTS "bv_write" ON budget_versions;
DROP POLICY IF EXISTS "bl_read"  ON budget_lines;
DROP POLICY IF EXISTS "bl_write" ON budget_lines;

CREATE POLICY "bv_read"  ON budget_versions FOR SELECT USING (TRUE);
CREATE POLICY "bv_write" ON budget_versions FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "bl_read"  ON budget_lines FOR SELECT USING (TRUE);
CREATE POLICY "bl_write" ON budget_lines FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
