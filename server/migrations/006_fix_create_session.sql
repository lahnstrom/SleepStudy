-- Prevent re-use of completed sessions and guard trial insertion
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
    -- Check for existing completed session
    SELECT * INTO v_existing FROM sessions
    WHERE participant_id = p_participant_id AND lab_day = p_lab_day AND session_type = p_session_type;

    IF v_existing.id IS NOT NULL AND v_existing.completed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Session already completed for this participant/day/type';
    END IF;

    -- If session exists but not completed, return it (crash recovery)
    IF v_existing.id IS NOT NULL THEN
        RETURN v_existing;
    END IF;

    -- Get participant for condition derivation
    SELECT * INTO v_participant FROM participants WHERE id = p_participant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Participant not found';
    END IF;

    -- Protocol ordering validation
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

    -- Derive condition
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
