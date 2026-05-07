-- Fix: array_length returns NULL (not 0) when array is empty, so < 160 silently passed.
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

    IF coalesce(array_length(v_neg_ids, 1), 0) < 160 OR coalesce(array_length(v_neu_ids, 1), 0) < 160 THEN
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
