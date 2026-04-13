-- =============================================================================
-- 001_init.sql
-- Complete schema, functions, and seed config for the NAPS platform.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ENUM types
-- ---------------------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('lab_user', 'admin');
CREATE TYPE emotion AS ENUM ('neutral', 'negative');
CREATE TYPE image_role AS ENUM (
    'encoding_test1_target',
    'encoding_test2_target',
    'test1_foil',
    'test2_foil'
);
CREATE TYPE session_type AS ENUM ('encoding', 'test1', 'test2');
CREATE TYPE condition_type AS ENUM ('sleep', 'wake');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE labs (
    id            SERIAL PRIMARY KEY,
    lab_number    INTEGER UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    lab_id          INTEGER REFERENCES labs(id),
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    role            user_role NOT NULL DEFAULT 'lab_user',
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE images (
    id              SERIAL PRIMARY KEY,
    filename        TEXT UNIQUE NOT NULL,
    database_source TEXT NOT NULL,
    emotion         emotion NOT NULL,
    image_size      TEXT
);

CREATE TABLE participants (
    id               SERIAL PRIMARY KEY,
    lab_id           INTEGER NOT NULL REFERENCES labs(id),
    participant_code TEXT NOT NULL,
    condition_order  INTEGER NOT NULL CHECK (condition_order IN (0, 1)),
    age              INTEGER,
    gender           TEXT,
    language         TEXT NOT NULL DEFAULT 'en',
    created_at       TIMESTAMPTZ DEFAULT now(),
    UNIQUE (lab_id, participant_code)
);

CREATE TABLE participant_image_assignments (
    id                      SERIAL PRIMARY KEY,
    participant_id          INTEGER NOT NULL REFERENCES participants(id),
    image_id                INTEGER NOT NULL REFERENCES images(id),
    lab_day                 INTEGER NOT NULL CHECK (lab_day IN (1, 2)),
    image_role              image_role NOT NULL,
    presentation_position   INTEGER NOT NULL CHECK (presentation_position BETWEEN 1 AND 80),
    test_position           INTEGER,
    UNIQUE (participant_id, image_id),
    UNIQUE (participant_id, lab_day, image_role, presentation_position)
);

CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id  INTEGER NOT NULL REFERENCES participants(id),
    lab_day         INTEGER NOT NULL CHECK (lab_day IN (1, 2)),
    session_type    session_type NOT NULL,
    condition       condition_type NOT NULL,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    timing_metadata JSONB,
    UNIQUE (participant_id, lab_day, session_type)
);

CREATE TABLE trials (
    id                  SERIAL PRIMARY KEY,
    session_id          UUID NOT NULL REFERENCES sessions(id),
    trial_number        INTEGER NOT NULL CHECK (trial_number BETWEEN 1 AND 80),
    image_id            INTEGER NOT NULL REFERENCES images(id),
    valence_rating      INTEGER CHECK (valence_rating BETWEEN 1 AND 9),
    arousal_rating      INTEGER CHECK (arousal_rating BETWEEN 1 AND 9),
    target_foil         INTEGER CHECK (target_foil IN (0, 1)),
    memory_response     INTEGER CHECK (memory_response IN (0, 1)),
    correct             INTEGER CHECK (correct IN (0, 1)),
    valence_rt_ms       INTEGER,
    arousal_rt_ms       INTEGER,
    memory_rt_ms        INTEGER,
    presented_at        TIMESTAMPTZ,
    image_actual_ms     NUMERIC,
    image_frame_count   INTEGER,
    dropped_frames      INTEGER DEFAULT 0,
    UNIQUE (session_id, trial_number)
);

CREATE TABLE sleep_data (
    id                          SERIAL PRIMARY KEY,
    participant_id              INTEGER NOT NULL REFERENCES participants(id),
    lab_day                     INTEGER NOT NULL CHECK (lab_day IN (1, 2)),
    total_sleep_min             NUMERIC,
    n1_min                      NUMERIC,
    n2_min                      NUMERIC,
    n3_min                      NUMERIC,
    rem_min                     NUMERIC,
    wake_after_sleep_onset_min  NUMERIC,
    sleep_onset_latency_min     NUMERIC,
    notes                       TEXT,
    UNIQUE (participant_id, lab_day)
);

CREATE TABLE file_uploads (
    id              SERIAL PRIMARY KEY,
    participant_id  INTEGER NOT NULL REFERENCES participants(id),
    lab_day         INTEGER,
    file_type       TEXT NOT NULL DEFAULT 'edf',
    original_name   TEXT NOT NULL,
    storage_path    TEXT NOT NULL,
    uploaded_by     INTEGER REFERENCES users(id),
    uploaded_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE config (
    key   TEXT PRIMARY KEY,
    value JSONB NOT NULL
);

CREATE TABLE questionnaire_responses (
    id                  SERIAL PRIMARY KEY,
    participant_id      INTEGER NOT NULL REFERENCES participants(id),
    questionnaire_type  TEXT NOT NULL,
    lab_day             INTEGER CHECK (lab_day IN (1, 2)),
    responses           JSONB NOT NULL,
    completed_at        TIMESTAMPTZ DEFAULT now(),
    UNIQUE (participant_id, questionnaire_type, lab_day)
);

-- Express session store (connect-pg-simple)
CREATE TABLE "session" (
    "sid"     VARCHAR NOT NULL COLLATE "default",
    "sess"    JSON NOT NULL,
    "expire"  TIMESTAMP(6) NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX idx_trials_session_id ON trials(session_id);
CREATE INDEX idx_sessions_participant_id ON sessions(participant_id);
CREATE INDEX idx_participants_lab_id ON participants(lab_id);
CREATE INDEX idx_assignments_participant ON participant_image_assignments(participant_id, lab_day);
CREATE INDEX "IDX_session_expire" ON "session" ("expire");
CREATE INDEX idx_questionnaire_participant ON questionnaire_responses(participant_id);

-- ---------------------------------------------------------------------------
-- Trial immutability trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_trial_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Trial data is immutable and cannot be modified';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trials_immutable
    BEFORE UPDATE OR DELETE ON trials
    FOR EACH ROW EXECUTE FUNCTION prevent_trial_modification();

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Fisher-Yates shuffle for a JSONB array
CREATE OR REPLACE FUNCTION _shuffle_jsonb_array(arr JSONB[])
RETURNS JSONB[] AS $$
DECLARE
    v_len INTEGER := array_length(arr, 1);
    v_i INTEGER;
    v_j INTEGER;
    v_temp JSONB;
BEGIN
    IF v_len IS NULL OR v_len <= 1 THEN
        RETURN arr;
    END IF;
    FOR v_i IN REVERSE v_len..2 LOOP
        v_j := floor(random() * v_i + 1)::INTEGER;
        v_temp := arr[v_i];
        arr[v_i] := arr[v_j];
        arr[v_j] := v_temp;
    END LOOP;
    RETURN arr;
END;
$$ LANGUAGE plpgsql;

-- Order 80 items with optional balanced halves (20 neg + 20 neu each half)
CREATE OR REPLACE FUNCTION _order_with_constraints(
    p_items JSONB[],
    p_balanced_halves BOOLEAN
)
RETURNS JSONB[] AS $$
DECLARE
    v_neg JSONB[];
    v_neu JSONB[];
    v_i INTEGER;
BEGIN
    IF array_length(p_items, 1) != 80 THEN
        RAISE EXCEPTION 'Expected 80 items, got %', coalesce(array_length(p_items, 1), 0);
    END IF;

    IF p_balanced_halves THEN
        v_neg := ARRAY[]::JSONB[];
        v_neu := ARRAY[]::JSONB[];
        FOR v_i IN 1..80 LOOP
            IF p_items[v_i]->>'emo' = 'negative' THEN
                v_neg := v_neg || p_items[v_i];
            ELSE
                v_neu := v_neu || p_items[v_i];
            END IF;
        END LOOP;

        RETURN _shuffle_jsonb_array(v_neg[1:20] || v_neu[1:20])
            || _shuffle_jsonb_array(v_neg[21:40] || v_neu[21:40]);
    ELSE
        RETURN _shuffle_jsonb_array(p_items);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Generate all 320 image assignments for a participant
CREATE OR REPLACE FUNCTION generate_image_assignments(p_participant_id INTEGER)
RETURNS VOID AS $$
DECLARE
    v_neg_ids INTEGER[];
    v_neu_ids INTEGER[];
    v_day INTEGER;
    v_day_neg INTEGER[];
    v_day_neu INTEGER[];
    v_encoding_items JSONB[];
    v_test1_items JSONB[];
    v_test2_items JSONB[];
    v_test1_foil_items JSONB[];
    v_test2_foil_items JSONB[];
    v_ordered JSONB[];
    v_i INTEGER;
BEGIN
    SELECT array_agg(id ORDER BY random()) INTO v_neg_ids
    FROM images WHERE emotion = 'negative';
    SELECT array_agg(id ORDER BY random()) INTO v_neu_ids
    FROM images WHERE emotion = 'neutral';

    IF array_length(v_neg_ids, 1) < 160 OR array_length(v_neu_ids, 1) < 160 THEN
        RAISE EXCEPTION 'Need at least 160 negative and 160 neutral images';
    END IF;

    FOR v_day IN 1..2 LOOP
        IF v_day = 1 THEN
            v_day_neg := v_neg_ids[1:80];
            v_day_neu := v_neu_ids[1:80];
        ELSE
            v_day_neg := v_neg_ids[81:160];
            v_day_neu := v_neu_ids[81:160];
        END IF;

        -- Encoding: 80 items (40 neg + 40 neu), balanced halves for pause split
        v_encoding_items := ARRAY[]::JSONB[];
        FOR v_i IN 1..20 LOOP
            v_encoding_items := v_encoding_items || jsonb_build_object(
                'image_id', v_day_neg[v_i], 'emo', 'negative', 'role', 'encoding_test1_target');
        END LOOP;
        FOR v_i IN 1..20 LOOP
            v_encoding_items := v_encoding_items || jsonb_build_object(
                'image_id', v_day_neu[v_i], 'emo', 'neutral', 'role', 'encoding_test1_target');
        END LOOP;
        FOR v_i IN 1..20 LOOP
            v_encoding_items := v_encoding_items || jsonb_build_object(
                'image_id', v_day_neg[20 + v_i], 'emo', 'negative', 'role', 'encoding_test2_target');
        END LOOP;
        FOR v_i IN 1..20 LOOP
            v_encoding_items := v_encoding_items || jsonb_build_object(
                'image_id', v_day_neu[20 + v_i], 'emo', 'neutral', 'role', 'encoding_test2_target');
        END LOOP;

        v_ordered := _order_with_constraints(v_encoding_items, TRUE);

        FOR v_i IN 1..80 LOOP
            INSERT INTO participant_image_assignments
                (participant_id, image_id, lab_day, image_role, presentation_position)
            VALUES (
                p_participant_id,
                (v_ordered[v_i]->>'image_id')::INTEGER,
                v_day,
                (v_ordered[v_i]->>'role')::image_role,
                v_i
            );
        END LOOP;

        -- Test 1 foils
        v_test1_foil_items := ARRAY[]::JSONB[];
        FOR v_i IN 1..20 LOOP
            v_test1_foil_items := v_test1_foil_items || jsonb_build_object(
                'image_id', v_day_neg[40 + v_i], 'emo', 'negative', 'role', 'test1_foil');
        END LOOP;
        FOR v_i IN 1..20 LOOP
            v_test1_foil_items := v_test1_foil_items || jsonb_build_object(
                'image_id', v_day_neu[40 + v_i], 'emo', 'neutral', 'role', 'test1_foil');
        END LOOP;

        v_test1_foil_items := _shuffle_jsonb_array(v_test1_foil_items);
        FOR v_i IN 1..40 LOOP
            INSERT INTO participant_image_assignments
                (participant_id, image_id, lab_day, image_role, presentation_position)
            VALUES (
                p_participant_id,
                (v_test1_foil_items[v_i]->>'image_id')::INTEGER,
                v_day,
                'test1_foil',
                v_i
            );
        END LOOP;

        -- Combined test1 ordering (40 targets + 40 foils)
        v_test1_items := ARRAY[]::JSONB[];
        FOR v_i IN 1..80 LOOP
            IF (v_ordered[v_i]->>'role') = 'encoding_test1_target' THEN
                v_test1_items := v_test1_items || jsonb_build_object(
                    'image_id', (v_ordered[v_i]->>'image_id'),
                    'emo', (v_ordered[v_i]->>'emo'));
            END IF;
        END LOOP;
        FOR v_i IN 1..40 LOOP
            v_test1_items := v_test1_items || jsonb_build_object(
                'image_id', (v_test1_foil_items[v_i]->>'image_id'),
                'emo', (v_test1_foil_items[v_i]->>'emo'));
        END LOOP;
        v_test1_items := _order_with_constraints(v_test1_items, TRUE);
        FOR v_i IN 1..80 LOOP
            UPDATE participant_image_assignments
            SET test_position = v_i
            WHERE participant_id = p_participant_id
              AND lab_day = v_day
              AND image_id = (v_test1_items[v_i]->>'image_id')::INTEGER
              AND image_role IN ('encoding_test1_target', 'test1_foil');
        END LOOP;

        -- Test 2 foils
        v_test2_foil_items := ARRAY[]::JSONB[];
        FOR v_i IN 1..20 LOOP
            v_test2_foil_items := v_test2_foil_items || jsonb_build_object(
                'image_id', v_day_neg[60 + v_i], 'emo', 'negative', 'role', 'test2_foil');
        END LOOP;
        FOR v_i IN 1..20 LOOP
            v_test2_foil_items := v_test2_foil_items || jsonb_build_object(
                'image_id', v_day_neu[60 + v_i], 'emo', 'neutral', 'role', 'test2_foil');
        END LOOP;

        v_test2_foil_items := _shuffle_jsonb_array(v_test2_foil_items);
        FOR v_i IN 1..40 LOOP
            INSERT INTO participant_image_assignments
                (participant_id, image_id, lab_day, image_role, presentation_position)
            VALUES (
                p_participant_id,
                (v_test2_foil_items[v_i]->>'image_id')::INTEGER,
                v_day,
                'test2_foil',
                v_i
            );
        END LOOP;

        -- Combined test2 ordering
        v_test2_items := ARRAY[]::JSONB[];
        FOR v_i IN 1..80 LOOP
            IF (v_ordered[v_i]->>'role') = 'encoding_test2_target' THEN
                v_test2_items := v_test2_items || jsonb_build_object(
                    'image_id', (v_ordered[v_i]->>'image_id'),
                    'emo', (v_ordered[v_i]->>'emo'));
            END IF;
        END LOOP;
        FOR v_i IN 1..40 LOOP
            v_test2_items := v_test2_items || jsonb_build_object(
                'image_id', (v_test2_foil_items[v_i]->>'image_id'),
                'emo', (v_test2_foil_items[v_i]->>'emo'));
        END LOOP;
        v_test2_items := _order_with_constraints(v_test2_items, TRUE);
        FOR v_i IN 1..80 LOOP
            UPDATE participant_image_assignments
            SET test_position = v_i
            WHERE participant_id = p_participant_id
              AND lab_day = v_day
              AND image_id = (v_test2_items[v_i]->>'image_id')::INTEGER
              AND image_role IN ('encoding_test2_target', 'test2_foil');
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create participant and generate assignments
CREATE OR REPLACE FUNCTION create_participant(
    p_lab_id INTEGER,
    p_code TEXT,
    p_condition_order INTEGER,
    p_age INTEGER DEFAULT NULL,
    p_gender TEXT DEFAULT NULL,
    p_language TEXT DEFAULT 'en'
) RETURNS participants AS $$
DECLARE
    new_participant participants;
BEGIN
    INSERT INTO participants (lab_id, participant_code, condition_order, age, gender, language)
    VALUES (p_lab_id, p_code, p_condition_order, p_age, p_gender, p_language)
    RETURNING * INTO new_participant;

    PERFORM generate_image_assignments(new_participant.id);

    RETURN new_participant;
END;
$$ LANGUAGE plpgsql;

-- Create session with protocol validation and crash recovery
CREATE OR REPLACE FUNCTION create_session(
    p_session_id UUID,
    p_participant_id INTEGER,
    p_lab_day INTEGER,
    p_session_type session_type
) RETURNS sessions AS $$
DECLARE
    v_condition condition_type;
    v_participant participants%ROWTYPE;
    v_existing sessions%ROWTYPE;
    v_result sessions%ROWTYPE;
BEGIN
    SELECT * INTO v_existing FROM sessions
    WHERE participant_id = p_participant_id AND lab_day = p_lab_day AND session_type = p_session_type;

    IF v_existing.id IS NOT NULL AND v_existing.completed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Session already completed for this participant/day/type';
    END IF;

    IF v_existing.id IS NOT NULL THEN
        RETURN v_existing;
    END IF;

    SELECT * INTO v_participant FROM participants WHERE id = p_participant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Participant not found';
    END IF;

    IF p_session_type = 'test1' THEN
        IF NOT EXISTS (SELECT 1 FROM sessions WHERE participant_id = p_participant_id
                       AND lab_day = p_lab_day AND session_type = 'encoding' AND completed_at IS NOT NULL) THEN
            RAISE EXCEPTION 'Encoding must be completed before test1';
        END IF;
    ELSIF p_session_type = 'test2' THEN
        IF NOT EXISTS (SELECT 1 FROM sessions WHERE participant_id = p_participant_id
                       AND lab_day = p_lab_day AND session_type = 'test1' AND completed_at IS NOT NULL) THEN
            RAISE EXCEPTION 'Test1 must be completed before test2';
        END IF;
    END IF;

    IF (v_participant.condition_order = 0 AND p_lab_day = 1)
       OR (v_participant.condition_order = 1 AND p_lab_day = 2) THEN
        v_condition := 'sleep';
    ELSE
        v_condition := 'wake';
    END IF;

    INSERT INTO sessions (id, participant_id, lab_day, session_type, condition, started_at)
    VALUES (p_session_id, p_participant_id, p_lab_day, p_session_type, v_condition, now())
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Seed config
-- ---------------------------------------------------------------------------

INSERT INTO config (key, value) VALUES ('timing', '{
    "fixationVisible": 2750,
    "fixationBlank": 250,
    "imageDisplay": 750,
    "memoryTimeout": 3000,
    "postMemoryGap": 1000,
    "ratingTimeout": 4000,
    "interRatingGap": 1000,
    "pauseDuration": 60000,
    "pauseTrialIndex": 40
}');

INSERT INTO config (key, value) VALUES ('input', '{
    "memoryOldKey": "KeyW",
    "memoryNewKey": "KeyP",
    "resumeKey": "KeyQ",
    "ratingKeys": ["Digit1","Digit2","Digit3","Digit4","Digit5","Digit6","Digit7","Digit8","Digit9"]
}') ON CONFLICT (key) DO NOTHING;
