-- Add neutral-only mode config key
INSERT INTO config (key, value) VALUES ('neutral_only_mode', 'false') ON CONFLICT (key) DO NOTHING;

-- Simplify create_participant: assignment generation moves to TypeScript
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
    RETURN new_participant;
END;
$$ LANGUAGE plpgsql;

-- Drop old plpgsql randomization functions (logic now in TypeScript)
DROP FUNCTION IF EXISTS generate_image_assignments(INTEGER);
DROP FUNCTION IF EXISTS _order_with_constraints(JSONB[], BOOLEAN);
DROP FUNCTION IF EXISTS _shuffle_jsonb_array(JSONB[]);
