-- =============================================================================
-- 003_functions.sql
-- Server-side PostgreSQL functions for participant creation, image
-- randomization, and session creation with protocol validation.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- _shuffle_jsonb_array()
-- Fisher-Yates shuffle for a JSONB array
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- _enforce_no_consecutive()
-- Ensures no more than 3 consecutive same-emotion items in the array.
-- Uses a greedy swap approach.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION _enforce_no_consecutive(arr JSONB[])
RETURNS JSONB[] AS $$
DECLARE
    v_len INTEGER := array_length(arr, 1);
    v_i INTEGER;
    v_j INTEGER;
    v_temp JSONB;
    v_run INTEGER;
    v_emo TEXT;
    v_prev_emo TEXT;
    v_passes INTEGER := 0;
    v_max_passes INTEGER := 50;
    v_valid BOOLEAN;
BEGIN
    IF v_len IS NULL OR v_len <= 3 THEN
        RETURN arr;
    END IF;

    LOOP
        v_valid := TRUE;
        v_run := 1;
        v_prev_emo := arr[1]->>'emo';

        FOR v_i IN 2..v_len LOOP
            v_emo := arr[v_i]->>'emo';
            IF v_emo = v_prev_emo THEN
                v_run := v_run + 1;
            ELSE
                v_run := 1;
            END IF;
            v_prev_emo := v_emo;

            IF v_run > 3 THEN
                v_valid := FALSE;
                FOR v_j IN (v_i + 1)..v_len LOOP
                    IF arr[v_j]->>'emo' != v_emo THEN
                        v_temp := arr[v_i];
                        arr[v_i] := arr[v_j];
                        arr[v_j] := v_temp;
                        EXIT;
                    END IF;
                END LOOP;
                EXIT;  -- restart validation
            END IF;
        END LOOP;

        IF v_valid THEN
            RETURN arr;
        END IF;

        v_passes := v_passes + 1;
        IF v_passes >= v_max_passes THEN
            RAISE EXCEPTION 'Could not enforce no-3-consecutive constraint after % passes', v_max_passes;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- _order_with_constraints()
--
-- Takes 80 items (as JSONB[] of {image_id, emo}), applies:
-- - If balanced_halves: first 40 = 20neg+20neu, last 40 = 20neg+20neu
-- - No >3 consecutive same emotion
-- Returns ordered JSONB[] with positions 1-80 implicit from array index.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION _order_with_constraints(
    p_items JSONB[],
    p_balanced_halves BOOLEAN
)
RETURNS JSONB[] AS $$
DECLARE
    v_neg JSONB[];
    v_neu JSONB[];
    v_half1 JSONB[];
    v_half2 JSONB[];
    v_i INTEGER;
BEGIN
    IF array_length(p_items, 1) != 80 THEN
        RAISE EXCEPTION 'Expected 80 items, got %', coalesce(array_length(p_items, 1), 0);
    END IF;

    IF p_balanced_halves THEN
        -- Split by emotion
        v_neg := ARRAY[]::JSONB[];
        v_neu := ARRAY[]::JSONB[];
        FOR v_i IN 1..80 LOOP
            IF p_items[v_i]->>'emo' = 'negative' THEN
                v_neg := v_neg || p_items[v_i];
            ELSE
                v_neu := v_neu || p_items[v_i];
            END IF;
        END LOOP;

        -- Build balanced halves: 20 neg + 20 neu each
        v_half1 := v_neg[1:20] || v_neu[1:20];
        v_half2 := v_neg[21:40] || v_neu[21:40];

        v_half1 := _shuffle_jsonb_array(v_half1);
        v_half2 := _shuffle_jsonb_array(v_half2);

        v_half1 := _enforce_no_consecutive(v_half1);
        v_half2 := _enforce_no_consecutive(v_half2);

        RETURN v_half1 || v_half2;
    ELSE
        p_items := _shuffle_jsonb_array(p_items);
        RETURN _enforce_no_consecutive(p_items);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- generate_image_assignments(participant_id)
--
-- Randomization algorithm:
-- 1. Shuffle 160 negative images → 80 to Day 1, 80 to Day 2
-- 2. Shuffle 160 neutral images  → 80 to Day 1, 80 to Day 2
-- 3. Within each day's 80 per emotion, assign roles:
--    20 encoding_test1_target, 20 encoding_test2_target,
--    20 test1_foil, 20 test2_foil
-- 4. Generate presentation_position per row:
--    - For encoding targets: position within encoding session
--    - For test foils: position within their test session
-- 5. Insert all 320 rows with final positions.
--
-- Per the schema doc, presentation_position stores:
--   encoding_test1_target / encoding_test2_target → position in encoding
--   test1_foil / test2_foil → position in their respective test session
-- The experiment runner composes session orderings at runtime by querying
-- the appropriate roles and sorting by presentation_position.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION generate_image_assignments(p_participant_id INTEGER)
RETURNS VOID AS $$
DECLARE
    v_neg_ids INTEGER[];
    v_neu_ids INTEGER[];
    v_day INTEGER;
    v_day_neg INTEGER[];
    v_day_neu INTEGER[];
    v_role image_role;
    v_roles image_role[] := ARRAY[
        'encoding_test1_target', 'encoding_test2_target',
        'test1_foil', 'test2_foil'
    ];
    v_role_idx INTEGER;
    v_img_id INTEGER;
    v_i INTEGER;

    -- For position assignment
    v_encoding_items JSONB[];
    v_test1_foil_items JSONB[];
    v_test2_foil_items JSONB[];
    v_ordered JSONB[];

    -- Temporary storage: image_id → (role, emotion) before position assignment
    v_role_images JSONB;  -- keyed by role name, each value is array of {image_id, emo}
    v_role_name TEXT;
    v_emo TEXT;
BEGIN
    -- Load all image IDs by emotion, shuffled
    SELECT array_agg(id ORDER BY random()) INTO v_neg_ids
    FROM images WHERE emotion = 'negative';

    SELECT array_agg(id ORDER BY random()) INTO v_neu_ids
    FROM images WHERE emotion = 'neutral';

    IF coalesce(array_length(v_neg_ids, 1), 0) < 160
       OR coalesce(array_length(v_neu_ids, 1), 0) < 160 THEN
        RAISE EXCEPTION 'Need at least 160 negative and 160 neutral images, found % neg and % neu',
            coalesce(array_length(v_neg_ids, 1), 0),
            coalesce(array_length(v_neu_ids, 1), 0);
    END IF;

    FOR v_day IN 1..2 LOOP
        -- Split: Day 1 gets first 80, Day 2 gets next 80
        IF v_day = 1 THEN
            v_day_neg := v_neg_ids[1:80];
            v_day_neu := v_neu_ids[1:80];
        ELSE
            v_day_neg := v_neg_ids[81:160];
            v_day_neu := v_neu_ids[81:160];
        END IF;

        -- Build per-role item arrays (20 neg + 20 neu per role)
        -- encoding_test1_target: neg[1:20] + neu[1:20]
        -- encoding_test2_target: neg[21:40] + neu[21:40]
        -- test1_foil: neg[41:60] + neu[41:60]
        -- test2_foil: neg[61:80] + neu[61:80]

        -- Encoding session: encoding_test1_target (pos 1-40) + encoding_test2_target (pos 41-80)
        -- But we need to order all 80 together with constraints, then assign positions.
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

        -- Order encoding with constraints (no balanced halves for encoding)
        v_ordered := _order_with_constraints(v_encoding_items, FALSE);

        -- Insert encoding target rows with final positions
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

        -- Test 1 foils: need positions 1-80 for the test1 session
        -- But test1 also includes the 40 encoding_test1_target images as targets.
        -- Foils get their own position in the test. The experiment runner will
        -- interleave targets and foils at runtime.
        -- For foils, we assign positions 1-40 (their ordering among foils).
        -- Actually, per the schema doc, presentation_position is 1-80 within the
        -- session the image "belongs to." For foils, that's their test session.
        -- The experiment runner queries both targets and foils for a test session
        -- and merges them by position. So foils need positions 1-80 interleaved
        -- with the target positions... but targets already have encoding positions.
        --
        -- Re-reading the schema doc more carefully: "This column stores the
        -- encoding position for encoding targets, and the test position for foils."
        -- The experiment runner must build the test session order itself by
        -- taking the 40 targets + 40 foils and ordering them together.
        -- The foil positions are just the ordering among foils (1-40).
        -- Actually the check constraint says BETWEEN 1 AND 80, so foils could
        -- also be 1-80. Let's keep it simple: foils get positions 1-40 ordered
        -- with the no-consecutive constraint. The experiment runner will merge
        -- targets and foils into a final 80-trial order at session start.

        v_test1_foil_items := ARRAY[]::JSONB[];
        FOR v_i IN 1..20 LOOP
            v_test1_foil_items := v_test1_foil_items || jsonb_build_object(
                'image_id', v_day_neg[40 + v_i], 'emo', 'negative', 'role', 'test1_foil');
        END LOOP;
        FOR v_i IN 1..20 LOOP
            v_test1_foil_items := v_test1_foil_items || jsonb_build_object(
                'image_id', v_day_neu[40 + v_i], 'emo', 'neutral', 'role', 'test1_foil');
        END LOOP;

        -- Shuffle foils with no-consecutive constraint
        v_test1_foil_items := _shuffle_jsonb_array(v_test1_foil_items);
        v_test1_foil_items := _enforce_no_consecutive(v_test1_foil_items);

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
        v_test2_foil_items := _enforce_no_consecutive(v_test2_foil_items);

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
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- create_participant()
-- Inserts a participant and generates all 320 image assignments.
-- ---------------------------------------------------------------------------

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- create_session()
-- Derives condition from order + day, validates protocol ordering,
-- and inserts the session.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_session(
    p_session_id UUID,
    p_participant_id INTEGER,
    p_lab_day INTEGER,
    p_session_type session_type
) RETURNS sessions AS $$
DECLARE
    v_condition condition_type;
    v_order INTEGER;
    new_session sessions;
BEGIN
    -- Get participant's condition order
    SELECT condition_order INTO v_order
    FROM participants WHERE id = p_participant_id;

    IF v_order IS NULL THEN
        RAISE EXCEPTION 'Participant % not found', p_participant_id;
    END IF;

    -- Derive condition: order 0 = Sleep first, order 1 = Wake first
    IF (v_order = 0 AND p_lab_day = 1) OR (v_order = 1 AND p_lab_day = 2) THEN
        v_condition := 'sleep';
    ELSE
        v_condition := 'wake';
    END IF;

    -- Validate protocol ordering
    IF p_session_type = 'test1' THEN
        IF NOT EXISTS (
            SELECT 1 FROM sessions
            WHERE participant_id = p_participant_id
              AND lab_day = p_lab_day
              AND session_type = 'encoding'
              AND completed_at IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'Encoding must be completed before test1';
        END IF;
    END IF;

    IF p_session_type = 'test2' THEN
        IF NOT EXISTS (
            SELECT 1 FROM sessions
            WHERE participant_id = p_participant_id
              AND lab_day = p_lab_day
              AND session_type = 'test1'
              AND completed_at IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'Test1 must be completed before test2';
        END IF;
    END IF;

    -- Insert session (ON CONFLICT on natural key for idempotency)
    INSERT INTO sessions (id, participant_id, lab_day, session_type, condition, started_at)
    VALUES (p_session_id, p_participant_id, p_lab_day, p_session_type, v_condition, now())
    ON CONFLICT (participant_id, lab_day, session_type) DO NOTHING
    RETURNING * INTO new_session;

    RETURN new_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
