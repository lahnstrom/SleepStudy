-- Fix C1: Test session ordering (targets + foils must be combined and randomized)
-- Fix C2: Encoding must use balanced halves (20 neg + 20 neu before/after pause)

-- Add column for combined test session ordering
ALTER TABLE participant_image_assignments ADD COLUMN IF NOT EXISTS test_position INTEGER;

-- Replace generate_image_assignments with fixed version
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

        -- Build encoding items (80 total: 40 neg + 40 neutral)
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

        -- FIX C2: Use balanced halves (TRUE) so pause splits 20 neg + 20 neu per half
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

        -- Build test1 foil items
        v_test1_foil_items := ARRAY[]::JSONB[];
        FOR v_i IN 1..20 LOOP
            v_test1_foil_items := v_test1_foil_items || jsonb_build_object(
                'image_id', v_day_neg[40 + v_i], 'emo', 'negative', 'role', 'test1_foil');
        END LOOP;
        FOR v_i IN 1..20 LOOP
            v_test1_foil_items := v_test1_foil_items || jsonb_build_object(
                'image_id', v_day_neu[40 + v_i], 'emo', 'neutral', 'role', 'test1_foil');
        END LOOP;

        -- Insert foils with their own presentation_position (for reference)
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

        -- FIX C1: Generate combined test1 ordering (40 targets + 40 foils = 80)
        v_test1_items := ARRAY[]::JSONB[];
        -- Add targets (encoding_test1_target)
        FOR v_i IN 1..40 LOOP
            v_test1_items := v_test1_items || jsonb_build_object(
                'image_id', (v_ordered[v_i]->>'image_id'),
                'emo', (v_ordered[v_i]->>'emo'),
                'role', 'encoding_test1_target');
        END LOOP;
        -- Only first 40 of v_ordered are test1 targets (items with role encoding_test1_target)
        -- Actually we need to pick the encoding_test1_target items from v_ordered
        -- Let's rebuild from the inserted assignments instead
        v_test1_items := ARRAY[]::JSONB[];
        FOR v_i IN 1..80 LOOP
            IF (v_ordered[v_i]->>'role') = 'encoding_test1_target' THEN
                v_test1_items := v_test1_items || jsonb_build_object(
                    'image_id', (v_ordered[v_i]->>'image_id'),
                    'emo', (v_ordered[v_i]->>'emo'));
            END IF;
        END LOOP;
        -- Add foils
        FOR v_i IN 1..40 LOOP
            v_test1_items := v_test1_items || jsonb_build_object(
                'image_id', (v_test1_foil_items[v_i]->>'image_id'),
                'emo', (v_test1_foil_items[v_i]->>'emo'));
        END LOOP;
        -- Randomize combined 80 with balanced halves
        v_test1_items := _order_with_constraints(v_test1_items, TRUE);
        -- Update test_position for all test1 items
        FOR v_i IN 1..80 LOOP
            UPDATE participant_image_assignments
            SET test_position = v_i
            WHERE participant_id = p_participant_id
              AND lab_day = v_day
              AND image_id = (v_test1_items[v_i]->>'image_id')::INTEGER
              AND image_role IN ('encoding_test1_target', 'test1_foil');
        END LOOP;

        -- Build test2 foil items
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

        -- FIX C1: Generate combined test2 ordering
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
