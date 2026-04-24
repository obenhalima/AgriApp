-- ============================================================
-- RLS POLICIES pour le moteur de workflow — Phase 1
-- Paramétrage TEMPORAIRE (tant que l'auth réelle n'est pas en place).
-- Une fois l'auth opérationnelle, durcir en restreignant les writes
-- à un rôle "admin".
-- ============================================================

-- ----- Définitions, états, transitions : lisibles par tous -----
DROP POLICY IF EXISTS "wf_def_read"   ON workflow_definitions;
DROP POLICY IF EXISTS "wf_state_read" ON workflow_states;
DROP POLICY IF EXISTS "wf_tr_read"    ON workflow_transitions;

CREATE POLICY "wf_def_read"   ON workflow_definitions FOR SELECT USING (TRUE);
CREATE POLICY "wf_state_read" ON workflow_states      FOR SELECT USING (TRUE);
CREATE POLICY "wf_tr_read"    ON workflow_transitions FOR SELECT USING (TRUE);

-- ----- Écriture réservée aux utilisateurs connectés (temporaire) -----
DROP POLICY IF EXISTS "wf_def_write"   ON workflow_definitions;
DROP POLICY IF EXISTS "wf_state_write" ON workflow_states;
DROP POLICY IF EXISTS "wf_tr_write"    ON workflow_transitions;

CREATE POLICY "wf_def_write"   ON workflow_definitions FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "wf_state_write" ON workflow_states      FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "wf_tr_write"    ON workflow_transitions FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- ----- Historique : lecture pour connectés, écriture via service_role (Edge Function) -----
DROP POLICY IF EXISTS "wf_hist_read"  ON workflow_history;
DROP POLICY IF EXISTS "wf_hist_write" ON workflow_history;

-- Pendant la phase de dev (sans auth), on autorise la lecture à tous
CREATE POLICY "wf_hist_read"  ON workflow_history FOR SELECT USING (TRUE);
-- L'Edge Function utilise le service_role, qui bypasse RLS — pas besoin de policy INSERT.
-- Mais on en ajoute une quand même pour debugging via le client direct.
CREATE POLICY "wf_hist_write" ON workflow_history FOR INSERT TO authenticated WITH CHECK (TRUE);
