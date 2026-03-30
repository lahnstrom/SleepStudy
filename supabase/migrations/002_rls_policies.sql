-- =============================================================================
-- 002_rls_policies.sql
-- Enables Row Level Security on all tables and creates access policies.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions (extract claims from JWT)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_lab_id()
RETURNS INTEGER AS $$
    SELECT (auth.jwt()->'user_metadata'->>'lab_id')::INTEGER;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
    SELECT auth.jwt()->'user_metadata'->>'role';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- labs — everyone reads, admins write
-- ---------------------------------------------------------------------------

ALTER TABLE labs ENABLE ROW LEVEL SECURITY;

CREATE POLICY labs_read ON labs
    FOR SELECT USING (true);

CREATE POLICY labs_admin_write ON labs
    FOR INSERT WITH CHECK (current_user_role() = 'admin');

CREATE POLICY labs_admin_update ON labs
    FOR UPDATE USING (current_user_role() = 'admin')
    WITH CHECK (current_user_role() = 'admin');

CREATE POLICY labs_admin_delete ON labs
    FOR DELETE USING (current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- users — admins read/write all, lab users read self only
-- ---------------------------------------------------------------------------

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select ON users
    FOR SELECT USING (
        current_user_role() = 'admin'
        OR id = auth.uid()
    );

CREATE POLICY users_admin_insert ON users
    FOR INSERT WITH CHECK (current_user_role() = 'admin');

CREATE POLICY users_admin_update ON users
    FOR UPDATE USING (current_user_role() = 'admin')
    WITH CHECK (current_user_role() = 'admin');

CREATE POLICY users_admin_delete ON users
    FOR DELETE USING (current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- images — everyone reads
-- ---------------------------------------------------------------------------

ALTER TABLE images ENABLE ROW LEVEL SECURITY;

CREATE POLICY images_read ON images
    FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- participants — lab users: own lab read/write; admins: all
-- ---------------------------------------------------------------------------

ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY participants_select ON participants
    FOR SELECT USING (
        current_user_role() = 'admin'
        OR lab_id = current_user_lab_id()
    );

CREATE POLICY participants_insert ON participants
    FOR INSERT WITH CHECK (
        current_user_role() = 'admin'
        OR lab_id = current_user_lab_id()
    );

CREATE POLICY participants_update ON participants
    FOR UPDATE USING (
        current_user_role() = 'admin'
        OR lab_id = current_user_lab_id()
    ) WITH CHECK (
        current_user_role() = 'admin'
        OR lab_id = current_user_lab_id()
    );

CREATE POLICY participants_delete ON participants
    FOR DELETE USING (
        current_user_role() = 'admin'
    );

-- ---------------------------------------------------------------------------
-- sessions — scoped through participant's lab
-- ---------------------------------------------------------------------------

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY sessions_select ON sessions
    FOR SELECT USING (
        current_user_role() = 'admin'
        OR participant_id IN (
            SELECT id FROM participants WHERE lab_id = current_user_lab_id()
        )
    );

CREATE POLICY sessions_insert ON sessions
    FOR INSERT WITH CHECK (
        participant_id IN (
            SELECT id FROM participants WHERE lab_id = current_user_lab_id()
        )
    );

CREATE POLICY sessions_update ON sessions
    FOR UPDATE USING (
        current_user_role() = 'admin'
        OR participant_id IN (
            SELECT id FROM participants WHERE lab_id = current_user_lab_id()
        )
    ) WITH CHECK (
        current_user_role() = 'admin'
        OR participant_id IN (
            SELECT id FROM participants WHERE lab_id = current_user_lab_id()
        )
    );

-- ---------------------------------------------------------------------------
-- trials — SELECT + INSERT only (immutable), scoped through session → participant → lab
-- ---------------------------------------------------------------------------

ALTER TABLE trials ENABLE ROW LEVEL SECURITY;

CREATE POLICY trials_select ON trials
    FOR SELECT USING (
        current_user_role() = 'admin'
        OR session_id IN (
            SELECT s.id FROM sessions s
            JOIN participants p ON p.id = s.participant_id
            WHERE p.lab_id = current_user_lab_id()
        )
    );

CREATE POLICY trials_insert ON trials
    FOR INSERT WITH CHECK (
        session_id IN (
            SELECT s.id FROM sessions s
            JOIN participants p ON p.id = s.participant_id
            WHERE p.lab_id = current_user_lab_id()
        )
    );

-- ---------------------------------------------------------------------------
-- participant_image_assignments — read-only, scoped through participant's lab
-- ---------------------------------------------------------------------------

ALTER TABLE participant_image_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY assignments_select ON participant_image_assignments
    FOR SELECT USING (
        current_user_role() = 'admin'
        OR participant_id IN (
            SELECT id FROM participants WHERE lab_id = current_user_lab_id()
        )
    );

-- ---------------------------------------------------------------------------
-- sleep_data — lab users: own lab read/write; admins: read
-- ---------------------------------------------------------------------------

ALTER TABLE sleep_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY sleep_data_select ON sleep_data
    FOR SELECT USING (
        current_user_role() = 'admin'
        OR participant_id IN (
            SELECT id FROM participants WHERE lab_id = current_user_lab_id()
        )
    );

CREATE POLICY sleep_data_insert ON sleep_data
    FOR INSERT WITH CHECK (
        participant_id IN (
            SELECT id FROM participants WHERE lab_id = current_user_lab_id()
        )
    );

CREATE POLICY sleep_data_update ON sleep_data
    FOR UPDATE USING (
        participant_id IN (
            SELECT id FROM participants WHERE lab_id = current_user_lab_id()
        )
    ) WITH CHECK (
        participant_id IN (
            SELECT id FROM participants WHERE lab_id = current_user_lab_id()
        )
    );

-- ---------------------------------------------------------------------------
-- file_uploads — lab users: own lab read/insert; admins: read
-- ---------------------------------------------------------------------------

ALTER TABLE file_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY file_uploads_select ON file_uploads
    FOR SELECT USING (
        current_user_role() = 'admin'
        OR participant_id IN (
            SELECT id FROM participants WHERE lab_id = current_user_lab_id()
        )
    );

CREATE POLICY file_uploads_insert ON file_uploads
    FOR INSERT WITH CHECK (
        participant_id IN (
            SELECT id FROM participants WHERE lab_id = current_user_lab_id()
        )
    );

-- ---------------------------------------------------------------------------
-- questionnaire_responses — lab users: own lab read/write; admins: read
-- ---------------------------------------------------------------------------

ALTER TABLE questionnaire_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY questionnaires_select ON questionnaire_responses
    FOR SELECT USING (
        current_user_role() = 'admin'
        OR participant_id IN (
            SELECT id FROM participants WHERE lab_id = current_user_lab_id()
        )
    );

CREATE POLICY questionnaires_insert ON questionnaire_responses
    FOR INSERT WITH CHECK (
        participant_id IN (
            SELECT id FROM participants WHERE lab_id = current_user_lab_id()
        )
    );

CREATE POLICY questionnaires_update ON questionnaire_responses
    FOR UPDATE USING (
        participant_id IN (
            SELECT id FROM participants WHERE lab_id = current_user_lab_id()
        )
    ) WITH CHECK (
        participant_id IN (
            SELECT id FROM participants WHERE lab_id = current_user_lab_id()
        )
    );

-- ---------------------------------------------------------------------------
-- config — everyone reads
-- ---------------------------------------------------------------------------

ALTER TABLE config ENABLE ROW LEVEL SECURITY;

CREATE POLICY config_read ON config
    FOR SELECT USING (true);
