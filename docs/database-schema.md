# NAPS Platform — Database Schema Design

## Overview

PostgreSQL schema for the NAPS (Nap And memory: a Pre-registered multi-lab Study) multicenter sleep study platform. Supports lab authentication, participant management, experiment session tracking, per-trial data recording, sleep scoring, file uploads, and questionnaire responses.

---

## Entity-Relationship Summary

```
labs
 ├── users (lab staff / admins)
 ├── participants
 │    ├── participant_image_assignments (randomization)
 │    ├── sessions
 │    │    ├── trials (core behavioral data)
 │    │    └── questionnaire_responses (optional session link)
 │    ├── sleep_data (PSG summaries)
 │    ├── file_uploads (EDF files, etc.)
 │    └── questionnaire_responses
 └── (images — standalone master list, referenced by assignments + trials)
```

**Key relationships:**
- A **lab** has many **users** and many **participants**
- A **participant** belongs to one lab and has two lab days (crossover design)
- Each participant has 320 **image assignments** (160 per lab day)
- A **session** is one experiment phase (encoding/test1/test2) on one lab day
- Each session contains 80 **trials** (one per image presentation)
- **Sleep data**, **file uploads**, and **questionnaire responses** attach to participants (and optionally to sessions/lab days)

---

## Tables

### 1. `labs`

Core entity for each collaborating research site (KI, Born, Cairney, Wamsley, Lipinska, Simor, etc.).

```sql
CREATE TABLE labs (
    id            SERIAL PRIMARY KEY,
    lab_number    INTEGER UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT now()
);
```

| Column     | Type        | Notes                                  |
|------------|-------------|----------------------------------------|
| id         | SERIAL PK   | Internal surrogate key                 |
| lab_number | INTEGER     | Unique lab identifier used in data export |
| name       | TEXT        | Human-readable lab name                |
| created_at | TIMESTAMPTZ | Row creation timestamp                 |

---

### 2. `users`

Lab staff who log in to run experiments and view data. Admins (Per, Gustav) have cross-lab visibility.

```sql
CREATE TYPE user_role AS ENUM ('lab_user', 'admin');

CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    lab_id        INTEGER REFERENCES labs(id),
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          user_role NOT NULL DEFAULT 'lab_user',
    created_at    TIMESTAMPTZ DEFAULT now()
);
```

| Column        | Type      | Notes                                      |
|---------------|-----------|--------------------------------------------|
| id            | SERIAL PK | Internal surrogate key                     |
| lab_id        | FK → labs | NULL for admins (they see all labs)         |
| email         | TEXT      | Login identifier, unique across system      |
| password_hash | TEXT      | bcrypt or argon2 hash                       |
| role          | ENUM      | `lab_user` (default) or `admin`            |
| created_at    | TIMESTAMPTZ | Row creation timestamp                   |

**Access rules:**
- `lab_user` can only see/manage participants and data for their own `lab_id`
- `admin` can view all labs, all data, and manage lab accounts

---

### 3. `images`

Master list of all 320 stimulus images. Loaded once at setup from the image database manifest. Referenced by image assignments and trials.

```sql
CREATE TYPE emotion AS ENUM ('neutral', 'negative');

CREATE TABLE images (
    id              SERIAL PRIMARY KEY,
    filename        TEXT UNIQUE NOT NULL,
    database_source TEXT NOT NULL,
    emotion         emotion NOT NULL,
    image_size      TEXT
);
```

| Column          | Type      | Notes                                       |
|-----------------|-----------|---------------------------------------------|
| id              | SERIAL PK | Internal surrogate key                      |
| filename        | TEXT      | Path relative to image root, e.g. `"Images/EM1181.jpg"` |
| database_source | TEXT      | Source database: IAPS, GAPED, Nencki, EmoMadrid, or OASIS |
| emotion         | ENUM      | `neutral` or `negative`                     |
| image_size      | TEXT      | Original size metadata from source, e.g. `"(0.8, 0.6)"` |

**Counts:** 320 total — 160 negative, 160 neutral.

---

### 4. `participants`

One row per participant. Tracks demographics and counterbalancing assignment.

```sql
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
```

| Column           | Type      | Notes                                      |
|------------------|-----------|--------------------------------------------|
| id               | SERIAL PK | Internal surrogate key                     |
| lab_id           | FK → labs | Which lab this participant belongs to       |
| participant_code | TEXT      | Lab-assigned ID (unique within lab)         |
| condition_order  | INTEGER   | `0` = Sleep first, `1` = Wake first        |
| age              | INTEGER   | Participant age                             |
| gender           | TEXT      | Free-text to accommodate lab conventions    |
| language         | TEXT      | Language code for i18n, default `'en'`      |
| created_at       | TIMESTAMPTZ | Row creation timestamp                   |

**Constraint:** `(lab_id, participant_code)` is unique — different labs may reuse participant codes.

---

### 5. `participant_image_assignments`

Stores the full randomization for each participant: which images go where across both lab days. Generated when a participant is created. This is the source of truth for stimulus presentation order and role.

```sql
CREATE TYPE image_role AS ENUM (
    'encoding_test1_target',
    'encoding_test2_target',
    'test1_foil',
    'test2_foil'
);

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
```

| Column                  | Type      | Notes                                        |
|-------------------------|-----------|----------------------------------------------|
| id                      | SERIAL PK | Internal surrogate key                       |
| participant_id          | FK → participants | Which participant this assignment is for |
| image_id                | FK → images | Which image                                |
| lab_day                 | INTEGER   | `1` or `2`                                   |
| image_role              | ENUM      | Determines when/how the image appears        |
| presentation_position   | INTEGER   | Position within the session this image appears in (1–80). Encoding images have two positions: one for encoding, one for the test where they reappear as targets. This column stores the encoding position for `encoding_test1_target`/`encoding_test2_target` roles, and the test position for `test1_foil`/`test2_foil` roles. |

**Per-participant breakdown (320 rows total, 160 per lab day):**

| Role                    | Count per day | Description                                |
|-------------------------|---------------|--------------------------------------------|
| `encoding_test1_target` | 40            | Shown in encoding, reappears as target in Test 1 |
| `encoding_test2_target` | 40            | Shown in encoding, reappears as target in Test 2 |
| `test1_foil`            | 40            | New image, only appears as foil in Test 1  |
| `test2_foil`            | 40            | New image, only appears as foil in Test 2  |

Each role category contains 20 negative + 20 neutral images (balanced by emotion).

**Encoding composition:** 80 images per day = 40 `encoding_test1_target` + 40 `encoding_test2_target`
**Test 1 composition:** 80 images = 40 targets (`encoding_test1_target`) + 40 foils (`test1_foil`)
**Test 2 composition:** 80 images = 40 targets (`encoding_test2_target`) + 40 foils (`test2_foil`)

**Constraint:** Each image is used exactly once per participant (`UNIQUE (participant_id, image_id)`), ensuring no image appears across both lab days.

**Presentation order is stored server-side** via `presentation_position`. This is the canonical source of trial ordering. The experiment runner reads the assignments at session start and presents images in this order. If the client crashes and IndexedDB is lost, the order can be reconstructed from the database. The randomization algorithm that generates these positions enforces two constraints:

1. **No more than 3 consecutive images of the same emotion.** Applies to all sessions.
2. **Balanced halves for test sessions.** The first 40 trials and last 40 trials each contain exactly 20 negative and 20 neutral images. This prevents the mid-session pause from confounding emotion effects.

### Image day-split algorithm

When a participant is created, the 320 images are divided into two sets of 160 (80 negative + 80 neutral each). The split is **randomized per participant** — each participant gets a different random partition. This prevents stimulus-set effects from confounding with day effects across the sample. The algorithm:

1. Shuffle the 160 negative images randomly. Assign the first 80 to Day 1, the remaining 80 to Day 2.
2. Shuffle the 160 neutral images randomly. Assign the first 80 to Day 1, the remaining 80 to Day 2.
3. Within each day's 160 images, randomly assign roles (40 `encoding_test1_target`, 40 `encoding_test2_target`, 40 `test1_foil`, 40 `test2_foil`), balanced by emotion (20 neg + 20 neu per role).
4. Generate `presentation_position` values for each session, respecting the ordering constraints above.
5. Write all 320 rows to `participant_image_assignments`.

---

### 6. `sessions`

One row per experiment session run. A participant has up to 6 sessions total (3 per lab day: encoding + test1 + test2).

```sql
CREATE TYPE session_type AS ENUM ('encoding', 'test1', 'test2');
CREATE TYPE condition_type AS ENUM ('sleep', 'wake');

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
```

| Column           | Type           | Notes                                      |
|------------------|----------------|--------------------------------------------|
| id               | UUID PK        | Client-generated UUID (see Offline ID Strategy below) |
| participant_id   | FK → participants | Which participant                        |
| lab_day          | INTEGER        | `1` or `2`                                 |
| session_type     | ENUM           | `encoding`, `test1`, or `test2`            |
| condition        | ENUM           | `sleep` or `wake` — **computed at creation, not editable** (see Condition Integrity below) |
| started_at       | TIMESTAMPTZ    | When the session began (NULL if not started)|
| completed_at     | TIMESTAMPTZ    | When the session finished (NULL if incomplete) |
| timing_metadata  | JSONB          | Post-session timing audit (see below)      |

**Condition derivation logic:**
- If `condition_order = 0` (Sleep first): Day 1 = `sleep`, Day 2 = `wake`
- If `condition_order = 1` (Wake first): Day 1 = `wake`, Day 2 = `sleep`

**Condition integrity:** The `condition` value is computed once at session creation from the participant's `condition_order` and `lab_day`. If a participant's `condition_order` needs correction, any existing session rows must also be updated (application-level check) or deleted and re-created. The application must enforce this — no `condition_order` change is allowed if sessions already exist for that participant.

**Offline ID strategy:** Session IDs are UUIDs generated client-side (`crypto.randomUUID()`). This allows the experiment runner to create a session locally (in IndexedDB) even when offline, with no server round-trip. When data syncs to the server, the client-generated UUID is used as the primary key — no ID reconciliation needed.

**`timing_metadata` JSONB structure** (written after session completes):
```json
{
    "refresh_rate_hz": 59.94,
    "total_trials": 80,
    "dropped_frames_total": 2,
    "image_duration": {
        "intended_ms": 750,
        "mean_ms": 750.12,
        "min_ms": 733.4,
        "max_ms": 766.8,
        "sd_ms": 0.8
    },
    "fixation_duration": { "intended_ms": 2750, "mean_ms": 2750.3, "...": "..." },
    "flagged_trials": [34, 67],
    "user_agent": "Mozilla/5.0 ...",
    "screen_resolution": "1920x1080"
}
```

**Protocol ordering:** The application must enforce session ordering within each lab day. A session cannot be started unless its prerequisites are complete:
- `encoding` has no prerequisites
- `test1` requires `encoding` on the same day to be completed
- `test2` requires `test1` on the same day to be completed (the protocol sequence is: encoding → Test 1 → 2-hour delay → Test 2)

---

### 7. `trials`

The core behavioral data table. One row per image presentation per session (80 per session). This is the primary table for data analysis and CSV export.

```sql
CREATE TABLE trials (
    id                  SERIAL PRIMARY KEY,
    session_id          UUID NOT NULL REFERENCES sessions(id),
    trial_number        INTEGER NOT NULL CHECK (trial_number BETWEEN 1 AND 80),
    image_id            INTEGER NOT NULL REFERENCES images(id),

    -- Ratings (NULL = timeout / no response)
    valence_rating      INTEGER CHECK (valence_rating BETWEEN 1 AND 9),
    arousal_rating      INTEGER CHECK (arousal_rating BETWEEN 1 AND 9),

    -- Memory test fields (only for test sessions, NULL for encoding)
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
```

| Column           | Type        | Notes                                          |
|------------------|-------------|-------------------------------------------------|
| id               | SERIAL PK   | Internal surrogate key                          |
| session_id       | FK → sessions (UUID) | Which session this trial belongs to     |
| trial_number     | INTEGER     | Presentation order within session (1–80)        |
| image_id         | FK → images | Which image was shown                           |
| valence_rating   | INTEGER     | 1–9 scale, NULL if participant timed out (4s)   |
| arousal_rating   | INTEGER     | 1–9 scale, NULL if participant timed out (4s)   |
| target_foil      | INTEGER     | `0` = Target (old), `1` = Foil (new). NULL for encoding sessions |
| memory_response  | INTEGER     | `0` = "Old", `1` = "New". NULL for encoding or timeout |
| correct          | INTEGER     | `1` = correct, `0` = wrong. Computed: Old→Target or New→Foil = correct. NULL if no response |
| valence_rt_ms    | INTEGER     | Reaction time for valence rating (ms)           |
| arousal_rt_ms    | INTEGER     | Reaction time for arousal rating (ms)           |
| memory_rt_ms     | INTEGER     | Reaction time for old/new judgment (ms). NULL for encoding |
| presented_at     | TIMESTAMPTZ | Wall-clock timestamp of image onset. Computed client-side as `new Date(performance.timeOrigin + performanceNowValue)`. |
| image_actual_ms  | NUMERIC     | Actual measured image display duration (ms) via `performance.now()` delta |
| image_frame_count| INTEGER     | Number of rAF ticks the image was visible       |
| dropped_frames   | INTEGER     | Number of dropped frames detected during this trial (0 = no drops) |

**`presented_at` conversion:** The runtime measures timing with `performance.now()` (monotonic, high-resolution). For storage, it converts to wall-clock via `performance.timeOrigin + performance.now()` → `new Date(...)`. This gives a TIMESTAMPTZ with ~ms precision. The high-resolution `actual_ms` and `frame_count` columns preserve the sub-millisecond timing accuracy separately.

**Volume:** ~80 trials × up to 6 sessions × hundreds of participants = tens of thousands of rows. Well within PostgreSQL's capabilities.

---

### 8. `sleep_data`

PSG summary scores entered by labs after sleep scoring. Only relevant for sleep-condition days, but the table allows entry for either day.

```sql
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
```

| Column                     | Type    | Notes                                |
|----------------------------|---------|--------------------------------------|
| id                         | SERIAL PK | Internal surrogate key             |
| participant_id             | FK → participants | Which participant              |
| lab_day                    | INTEGER | `1` or `2`                           |
| total_sleep_min            | NUMERIC | Total sleep time in minutes          |
| n1_min                     | NUMERIC | NREM Stage 1 duration (minutes)      |
| n2_min                     | NUMERIC | NREM Stage 2 duration (minutes)      |
| n3_min                     | NUMERIC | NREM Stage 3 / slow-wave sleep (minutes) |
| rem_min                    | NUMERIC | REM sleep duration (minutes)         |
| wake_after_sleep_onset_min | NUMERIC | WASO (minutes)                       |
| sleep_onset_latency_min    | NUMERIC | SOL (minutes)                        |
| notes                      | TEXT    | Free-text notes from sleep scorer    |

These columns directly address **RQ2** (association between specific sleep stages and memory consolidation).

---

### 9. `file_uploads`

Tracks EDF (polysomnography) files and any other uploaded files. Files are stored on disk or S3; this table tracks metadata.

```sql
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
```

| Column        | Type        | Notes                                       |
|---------------|-------------|---------------------------------------------|
| id            | SERIAL PK   | Internal surrogate key                      |
| participant_id| FK → participants | Which participant's data                |
| lab_day       | INTEGER     | Which day (NULL if not day-specific)         |
| file_type     | TEXT        | `'edf'`, `'other'`, etc.                    |
| original_name | TEXT        | Original filename as uploaded               |
| storage_path  | TEXT        | Server-side path or S3 key                  |
| uploaded_by   | FK → users  | Which lab user uploaded this file            |
| uploaded_at   | TIMESTAMPTZ | Upload timestamp                             |

**Upload limits:** EDF files from 2-hour PSG recordings can be 200 MB–2 GB. The application must support chunked uploads with resume capability. Maximum file size: 2 GB per file. Storage backend (disk or S3) must be configured with adequate capacity per lab.

---

### 10. `questionnaire_responses`

Flexible storage for the various psychometric instruments. Uses JSONB since each questionnaire has a different structure and number of items.

```sql
CREATE TABLE questionnaire_responses (
    id                  SERIAL PRIMARY KEY,
    participant_id      INTEGER NOT NULL REFERENCES participants(id),
    questionnaire_type  TEXT NOT NULL,
    session_id          UUID REFERENCES sessions(id),
    lab_day             INTEGER CHECK (lab_day IN (1, 2)),
    responses           JSONB NOT NULL,
    completed_at        TIMESTAMPTZ DEFAULT now()
);
```

| Column             | Type        | Notes                                       |
|--------------------|-------------|---------------------------------------------|
| id                 | SERIAL PK   | Internal surrogate key                      |
| participant_id     | FK → participants | Which participant                       |
| questionnaire_type | TEXT        | Instrument identifier (see below)            |
| session_id         | FK → sessions | Optional link to specific session          |
| lab_day            | INTEGER     | Which day (NULL if not day-specific)         |
| responses          | JSONB       | Instrument-specific response payload         |
| completed_at       | TIMESTAMPTZ | When the questionnaire was completed         |

**Supported questionnaire types:**

| Type           | Description                              | Timing                          |
|----------------|------------------------------------------|---------------------------------|
| `kss`          | Karolinska Sleepiness Scale              | Before encoding + before each test |
| `stai`         | State-Trait Anxiety Inventory            | Per lab protocol                |
| `meq`          | Morningness-Eveningness Questionnaire    | Once (chronotype)               |
| `sleep_diary`  | Habitual sleep patterns                  | Per lab protocol                |
| `depression`   | Depression scale (instrument varies by lab) | Per lab protocol             |
| `anxiety`      | Anxiety scale (instrument varies by lab) | Per lab protocol                |

**JSONB examples:**
```json
// KSS
{"score": 5}

// STAI (State form, 20 items)
{"items": [3, 2, 1, 4, ...], "total": 45, "form": "state"}

// MEQ
{"items": [4, 3, 2, ...], "total": 52, "chronotype": "intermediate"}
```

---

## CSV Export Mapping

The primary data export joins `trials` → `sessions` → `participants` → `labs` + `images` and produces the exact column structure specified in the experiment protocol.

### Export Query Mapping

| Spec Column      | SQL Source                                                            |
|------------------|-----------------------------------------------------------------------|
| TrialNumber      | `trials.trial_number`                                                 |
| ImageFile        | `images.filename`                                                     |
| Emotion          | `images.emotion` → `'Neutral'` / `'Negative'`                        |
| ValenceRating    | `trials.valence_rating` (blank if NULL)                               |
| ArousalRating    | `trials.arousal_rating` (blank if NULL)                               |
| ParticipantID    | `participants.participant_code`                                       |
| LabNumber        | `labs.lab_number`                                                     |
| LabDay           | `sessions.lab_day`                                                    |
| Session          | `sessions.session_type` → `0` (encoding), `1` (test1), `2` (test2) |
| WakeSleep        | `sessions.condition` → `0` (wake), `1` (sleep)                       |
| Order            | `participants.condition_order`                                        |
| Age              | `participants.age`                                                    |
| Gender           | `participants.gender`                                                 |
| TargetFoil       | `trials.target_foil` (blank for encoding sessions)                    |
| Response         | `trials.memory_response` (blank for encoding or timeout)              |
| Correct          | `trials.correct` (blank for encoding or no response)                  |
| ValenceRT        | `trials.valence_rt_ms` (blank if timeout)                             |
| ArousalRT        | `trials.arousal_rt_ms` (blank if timeout)                             |
| MemoryRT         | `trials.memory_rt_ms` (blank for encoding or timeout)                 |
| TotalSleepMin    | `sleep_data.total_sleep_min` (blank if no sleep data for this day)    |
| N1Min            | `sleep_data.n1_min`                                                   |
| N2Min            | `sleep_data.n2_min`                                                   |
| N3Min            | `sleep_data.n3_min`                                                   |
| REMMin           | `sleep_data.rem_min`                                                  |
| WASOMin          | `sleep_data.wake_after_sleep_onset_min`                               |
| SOLMin           | `sleep_data.sleep_onset_latency_min`                                  |

### Reference Export Query

```sql
SELECT
    t.trial_number                                          AS "TrialNumber",
    i.filename                                              AS "ImageFile",
    INITCAP(i.emotion::TEXT)                                AS "Emotion",
    t.valence_rating                                        AS "ValenceRating",
    t.arousal_rating                                        AS "ArousalRating",
    p.participant_code                                      AS "ParticipantID",
    l.lab_number                                            AS "LabNumber",
    s.lab_day                                               AS "LabDay",
    CASE s.session_type
        WHEN 'encoding' THEN 0
        WHEN 'test1'    THEN 1
        WHEN 'test2'    THEN 2
    END                                                     AS "Session",
    CASE s.condition
        WHEN 'wake'  THEN 0
        WHEN 'sleep' THEN 1
    END                                                     AS "WakeSleep",
    p.condition_order                                       AS "Order",
    p.age                                                   AS "Age",
    p.gender                                                AS "Gender",
    t.target_foil                                           AS "TargetFoil",
    t.memory_response                                       AS "Response",
    t.correct                                               AS "Correct",
    t.valence_rt_ms                                         AS "ValenceRT",
    t.arousal_rt_ms                                         AS "ArousalRT",
    t.memory_rt_ms                                          AS "MemoryRT",
    sd.total_sleep_min                                      AS "TotalSleepMin",
    sd.n1_min                                               AS "N1Min",
    sd.n2_min                                               AS "N2Min",
    sd.n3_min                                               AS "N3Min",
    sd.rem_min                                              AS "REMMin",
    sd.wake_after_sleep_onset_min                           AS "WASOMin",
    sd.sleep_onset_latency_min                              AS "SOLMin"
FROM trials t
JOIN sessions s     ON s.id = t.session_id
JOIN participants p ON p.id = s.participant_id
JOIN labs l         ON l.id = p.lab_id
JOIN images i       ON i.id = t.image_id
LEFT JOIN sleep_data sd ON sd.participant_id = p.id AND sd.lab_day = s.lab_day
ORDER BY
    l.lab_number,
    p.participant_code,
    s.lab_day,
    CASE s.session_type
        WHEN 'encoding' THEN 0
        WHEN 'test1'    THEN 1
        WHEN 'test2'    THEN 2
    END,
    t.trial_number;
```

The `LEFT JOIN sleep_data` attaches PSG scoring data to every trial row for the matching participant and day. Sleep data columns will be NULL for encoding/test sessions where no sleep data has been entered yet, and for wake-condition days where no PSG was performed. This denormalized structure (repeating sleep data across all trials for a given day) matches Per's specification that sleep data should appear on each export row.

This can be filtered per-lab (`WHERE l.id = ?`) for the lab dashboard, or run unfiltered for the admin view.

---

## Indexes

Performance indexes beyond the primary keys and unique constraints:

```sql
-- Trial lookups by session (core query path)
CREATE INDEX idx_trials_session_id ON trials(session_id);

-- Session lookups by participant (dashboard, export)
CREATE INDEX idx_sessions_participant_id ON sessions(participant_id);

-- Participant lookups by lab (lab dashboard filtering)
CREATE INDEX idx_participants_lab_id ON participants(lab_id);

-- Image assignment lookups (experiment runner fetches day's stimulus set)
CREATE INDEX idx_assignments_participant ON participant_image_assignments(participant_id, lab_day);

-- Questionnaire lookups by participant
CREATE INDEX idx_questionnaires_participant ON questionnaire_responses(participant_id);
```

These cover the primary access patterns:
1. **Experiment runner**: participant → assignments (by day) → images
2. **Trial recording**: session → trials (insert path, covered by FK)
3. **Data export**: lab → participants → sessions → trials (covered by chain of indexes)
4. **Lab dashboard**: lab → participants → sessions/questionnaires/sleep_data

---

## Design Decisions

### Why ENUM types for roles, emotions, conditions?
PostgreSQL ENUMs enforce valid values at the database level, preventing data corruption. The set of valid values (e.g., `neutral`/`negative`, `sleep`/`wake`) is fixed by the experiment protocol and will not change.

### Why JSONB for questionnaire responses?
The various psychometric instruments (KSS, STAI, MEQ, sleep diary, depression/anxiety scales) have fundamentally different structures — from a single score (KSS) to 20+ items (STAI). A normalized table per instrument would create excessive schema complexity. JSONB allows flexible storage while still supporting indexed queries if needed.

### Why store `correct` as a column instead of computing it?
While `correct` can be derived from `memory_response` and `target_foil`, storing it directly:
- Simplifies export queries
- Avoids recomputing on every read
- Matches the PsychoPy pilot output format
- The application computes it at write time, ensuring consistency

### Why `participant_image_assignments` as a separate table?
The randomization must be generated once and remain stable across all sessions on both lab days. Storing it explicitly (rather than re-randomizing) ensures:
- Targets in tests reference exactly the images shown during encoding
- The assignment survives browser crashes and session restarts
- Offline-mode can load the full assignment at session start

### Why INTEGER for target_foil/memory_response/correct instead of BOOLEAN?
The experiment spec uses `0`/`1` coding throughout (matching the PsychoPy pilot output). Using INTEGER preserves this convention and simplifies CSV export without type casting.

---

## Data Integrity

### Trial data immutability
Trial data (the `trials` table) must never be modified after creation. The application enforces this — there are no UPDATE endpoints for trials. For database-level protection, a PostgreSQL trigger can deny UPDATE/DELETE on the `trials` table:

```sql
CREATE OR REPLACE FUNCTION prevent_trial_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Trial data is immutable and cannot be modified';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trials_immutable
    BEFORE UPDATE OR DELETE ON trials
    FOR EACH ROW EXECUTE FUNCTION prevent_trial_modification();
```

### Questionnaire data editability
Questionnaire responses are **staff-entered** data, not participant-collected behavioral data. Labs may need to correct data entry errors. Therefore questionnaire responses are editable (UPDATE allowed), but each modification is logged with a timestamp. The `completed_at` column reflects the latest edit. For a full audit trail, consider adding an `updated_at` column and/or a separate `questionnaire_audit_log` table if required.

### Session data
Session rows are created at launch and updated only to set `completed_at` and `timing_metadata` when the session finishes. No other updates are permitted.

---

## Known Limitations & Future Work

1. **No explicit EDF ↔ sleep_data link.** Both `file_uploads` and `sleep_data` reference `(participant_id, lab_day)`, which serves as a natural join key. If a participant ever has multiple EDF uploads for the same day, there is no FK linking a specific file to its scoring row. This can be added later if needed (e.g., a `file_upload_id` column on `sleep_data`).

2. **Lab "test day" selection is implicit.** When a lab starts a session, they select the test day (1 or 2). This choice is captured in `sessions.lab_day` when the session row is created. There is no separate "session setup" table — the application handles this as part of the session creation flow.

3. **Practice images are not in the `images` table.** Practice uses ~6 neutral images from a separate set. These are bundled as static assets, not stored in the database. They are the same across all labs.

---

## Psych-DS Compatibility Notes

For eventual sharing on the Open Science Framework (OSF), the exported data should include:
- A `dataset_description.json` file following the Psych-DS standard
- Column descriptions matching the spec above
- Participant metadata in a `participants.tsv` sidecar file
- Clear separation of raw data (trials) and derived data (computed scores)

The schema is designed so that the CSV export query produces a flat file that maps directly to the Psych-DS tabular data format.

---

## Open Questions for Per

The following items need clarification before implementation. They do not block the schema design but will affect the application layer and static assets.

1. **Image display sizing.** Per noted in the Specc that image sizing needs discussion. The 320 images come from 5 databases with different native resolutions/aspect ratios (the PsychoPy pilot had 3 distinct sizes: 1024×768, 800×600, 1024×576). Options: scale all to a fixed size, fit within a max bounding box preserving aspect ratio, or pad with black bars. This affects the `ImageDisplay` component but not the database.

2. **Fixation cross dimensions.** The Specc specifies a white "+" on black background but does not define its size (in pixels or visual degrees). PsychoPy typically uses height-based units. We need a target size for the web implementation.

3. **Lab numbering scheme.** How should labs be numbered? Sequential integers (1, 2, 3...) or a specific assignment? The `labs.lab_number` field supports any integer.

4. **Pre-visit questionnaires.** The Specc mentions some questionnaires (MEQ, sleep diary) should be completed before the lab visit. Should the platform support a self-service participant portal for pre-visit surveys, or are these handled outside the platform (paper, email)?

5. **Nencki database image variants.** The Nencki AFFECTIVE database has both horizontal (`Nencki_h`) and vertical (`Nencki_v`) images. Are both used? If so, how should vertical images be handled in a horizontal display context?

6. **Practice session time limits.** The registered report draft (Background and Methods 1.1) explicitly states: "There will be no time limits for responding during the practice sessions." Our current design uses the same timing as real sessions. Which is correct? No time limits would mean rating prompts stay on screen until the participant responds.

7. **Post-memory gap duration.** The registered report says 0.5s blank between memory judgment and valence rating. Our docs use 1.0s (matching the inter-rating gap). The Specc is silent on this. Which value?

8. **Post-delay compliance questionnaire.** The registered report says participants fill in a short questionnaire after the delay interval asking whether they fell asleep (asked in both conditions). Should the platform include this as a questionnaire type, or is it handled on paper?
