CREATE TABLE IF NOT EXISTS questionnaire_responses (
    id                  SERIAL PRIMARY KEY,
    participant_id      INTEGER NOT NULL REFERENCES participants(id),
    questionnaire_type  TEXT NOT NULL,
    lab_day             INTEGER CHECK (lab_day IN (1, 2)),
    responses           JSONB NOT NULL,
    completed_at        TIMESTAMPTZ DEFAULT now(),
    UNIQUE (participant_id, questionnaire_type, lab_day)
);

CREATE INDEX IF NOT EXISTS idx_questionnaire_participant ON questionnaire_responses(participant_id);
