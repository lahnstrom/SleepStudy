-- =============================================================================
-- 001_create_tables.sql
-- Creates all ENUM types, tables, indexes, triggers, and seed config
-- for the NAPS multicenter sleep study platform.
-- Adapted from Supabase version: standalone PostgreSQL (no auth.users).
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
-- 1. labs
-- ---------------------------------------------------------------------------

CREATE TABLE labs (
    id            SERIAL PRIMARY KEY,
    lab_number    INTEGER UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. users (standalone — password_hash for bcrypt, SERIAL PK)
-- ---------------------------------------------------------------------------

CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    lab_id          INTEGER REFERENCES labs(id),
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    role            user_role NOT NULL DEFAULT 'lab_user',
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. images
-- ---------------------------------------------------------------------------

CREATE TABLE images (
    id              SERIAL PRIMARY KEY,
    filename        TEXT UNIQUE NOT NULL,
    database_source TEXT NOT NULL,
    emotion         emotion NOT NULL,
    image_size      TEXT
);

-- ---------------------------------------------------------------------------
-- 4. participants
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 5. participant_image_assignments
-- ---------------------------------------------------------------------------

CREATE TABLE participant_image_assignments (
    id                      SERIAL PRIMARY KEY,
    participant_id          INTEGER NOT NULL REFERENCES participants(id),
    image_id                INTEGER NOT NULL REFERENCES images(id),
    lab_day                 INTEGER NOT NULL CHECK (lab_day IN (1, 2)),
    image_role              image_role NOT NULL,
    presentation_position   INTEGER NOT NULL CHECK (presentation_position BETWEEN 1 AND 80),
    UNIQUE (participant_id, image_id),
    UNIQUE (participant_id, lab_day, image_role, presentation_position)
);

-- ---------------------------------------------------------------------------
-- 6. sessions
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 7. trials
-- ---------------------------------------------------------------------------

CREATE TABLE trials (
    id                  SERIAL PRIMARY KEY,
    session_id          UUID NOT NULL REFERENCES sessions(id),
    trial_number        INTEGER NOT NULL CHECK (trial_number BETWEEN 1 AND 80),
    image_id            INTEGER NOT NULL REFERENCES images(id),

    -- Ratings (NULL = timeout / no response)
    valence_rating      INTEGER CHECK (valence_rating BETWEEN 1 AND 9),
    arousal_rating      INTEGER CHECK (arousal_rating BETWEEN 1 AND 9),

    -- Memory test fields (NULL for encoding sessions)
    target_foil         INTEGER CHECK (target_foil IN (0, 1)),
    memory_response     INTEGER CHECK (memory_response IN (0, 1)),
    correct             INTEGER CHECK (correct IN (0, 1)),

    -- Reaction times (ms)
    valence_rt_ms       INTEGER,
    arousal_rt_ms       INTEGER,
    memory_rt_ms        INTEGER,

    -- Timing verification
    presented_at        TIMESTAMPTZ,
    image_actual_ms     NUMERIC,
    image_frame_count   INTEGER,
    dropped_frames      INTEGER DEFAULT 0,

    UNIQUE (session_id, trial_number)
);

-- ---------------------------------------------------------------------------
-- 8. sleep_data
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 9. file_uploads
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 10. config (key-value store for timing parameters etc.)
-- ---------------------------------------------------------------------------

CREATE TABLE config (
    key   TEXT PRIMARY KEY,
    value JSONB NOT NULL
);

-- ---------------------------------------------------------------------------
-- Performance indexes
-- ---------------------------------------------------------------------------

CREATE INDEX idx_trials_session_id ON trials(session_id);
CREATE INDEX idx_sessions_participant_id ON sessions(participant_id);
CREATE INDEX idx_participants_lab_id ON participants(lab_id);
CREATE INDEX idx_assignments_participant ON participant_image_assignments(participant_id, lab_day);

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
-- Seed timing config
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
