# NAPS - Multicenter Sleep & Memory Experiment Platform

## Project Overview

Web platform for **NAPS** (Nap And memory: a Pre-registered multi-lab Study), a large-scale multicenter sleep study. The project is an MSCA Postdoctoral Fellowship (HORIZON-MSCA-2022-PF-01) led by Per Davidsson, supervised by Gustav Nilsonne at Karolinska Institutet (KI).

The experiment investigates how a daytime nap affects emotional memory consolidation using a cross-over design at unprecedented scale. Multiple labs worldwide (Jan Born, Scott Cairney, Erin Wamsley, Gosia Lipinska, Peter Simor, and others) run the same protocol; this platform handles experiment delivery, data collection, and lab administration.

### Research Questions
- **RQ1**: Does a daytime nap benefit memory consolidation?
- **RQ2**: Are any particular sleep stages especially associated with memory consolidation?
- **RQ3**: Is sleep-dependent consolidation stronger for emotional stimuli vs. neutral?
- **RQ4**: Does sleep decrease emotional reactivity to previously seen negative stimuli?

### Key Analysis Metrics
- **Memory performance**: Hits (correctly identifying old images) minus False Alarms (incorrectly calling new images old)
- **Statistical method**: Mixed-effects models with random intercepts/slopes for participants nested in centers, crossed random intercepts for stimuli
- **Primary interactions**: Condition (Sleep/Wake) x Time (Test 1/Test 2/Test 3) and Condition x Time x Valence (Neutral/Negative)

## Tech Stack

- **Backend**: Node.js server (Express or Fastify) + PostgreSQL
- **Frontend**: React (Vite)
- **Database**: PostgreSQL on university-provisioned servers
- **File Storage**: S3 bucket for sleep data (EDF files)
- **Hosting**: University infrastructure (data sovereignty / GDPR compliance)

> **Architecture decision (2026-03-29):** Originally planned for Supabase Cloud, switched to self-hosted PostgreSQL on university servers due to GDPR/data sensitivity concerns (health-adjacent data, EU-funded study at KI). Questionnaire data handled out-of-band via secure channels between labs and researchers. Sleep data uploaded to S3.

## Experiment Design

### Participants
- Healthy adults, 18-55 years old
- No psychiatric or sleep disorders
- Target: hundreds of participants across all labs (each lab collects at least ~20)

### Conditions & Schedule
Cross-over design — each participant does **two lab days** (counterbalanced):
- **Sleep condition**: 2-hour nap opportunity monitored with polysomnography (PSG)
- **Wake condition**: 2 hours of passive rest (minimal new information/physical activity)
- Counterbalancing: randomized whether sleep or wake comes first (Order: 0=Sleep first, 1=Wake first)
- Day schedule: arrive ~13:00 → Encoding → Test 1 (immediate) → 2-hour delay (nap/wake) → wait 30 min (sleep inertia) → Test 2 (~17:00)
- **Test 3**: Performed online the next day with a third subset of images (tests longevity of sleep effects)

### Stimuli
- **320 images** total from multiple databases (IAPS, GAPED, Nencki, EmoMadrid, OASIS)
- 160 negative, 160 neutral
- Split into two sets of 160 (80 neg + 80 neutral) — one per lab day
- Each set is further divided for encoding (80 images) and test phases (targets + foils)

### Sessions (3 in-lab per day + 1 online next day, all repeated for both conditions)

**Session 0 — Encoding:**
- 80 images (40 negative, 40 neutral), random order
- Each image: shown 0.75s on black background
- Fixation cross between images (2.75s visible + 0.25s blank = 3s ISI)
- After each image: Valence rating (1-9, 4s limit) then Arousal rating (1-9, 4s limit)
- 1s gap between rating prompts; prompts disappear immediately on keypress
- 1-minute pause after 40 images (countdown timer, experimenter resumes with Q key)
- Constraint: avoid >3 consecutive images of same emotion

**Session 1 — Test 1 (immediate, before delay):**
- 80 images: 20 old negative + 20 old neutral (targets from encoding) + 20 new negative + 20 new neutral (foils)
- Same display timing as encoding
- Additional question before ratings: "Old or New?" (W=Old, P=New, 3s limit)
- Then Valence + Arousal ratings as before
- 1-minute pause after 40 images (balanced: 20 per emotion before/after pause)
- Purpose: controls for differences in initial learning between conditions

**Session 2 — Test 2 (after 2-hour delay + 30 min sleep inertia wait):**
- Identical structure to Test 1
- Uses the remaining 40 targets from encoding + 40 new foils not shown in Test 1
- This is the primary test for sleep-dependent consolidation effects

**Session 3 — Test 3 (online, next day):**
- Tests longevity of any sleep-related effects
- Uses a third subset of images (details TBD — grant mentions this but the implementation spec doesn't yet cover it)
- Performed remotely by the participant

### Practice Sessions
- Short training before each session (~6 images, neutral only, fixed/non-randomized)
- Uses separate image set; no data saved

### Key Timing Parameters (all preliminary — must be easily configurable)
- Image display: 0.75s
- Fixation cross: 2.75s visible + 0.25s blank
- Rating time limit: 4s per rating
- Gap between ratings: 1s
- Memory response time limit: 3s
- Pause duration: 60s (countdown)
- Resume key: Q (not Space — to prevent accidental participant input)

## Data Output

### Per-trial columns (CSV/Excel):
**All sessions:**
- TrialNumber (1-80, presentation order)
- ImageFile (filename for traceability)
- Emotion (Neutral/Negative — from master image list)
- ValenceRating (1-9, blank if timeout)
- ArousalRating (1-9, blank if timeout)
- ParticipantID
- LabNumber
- Session (0=Encoding, 1=Test 1, 2=Test 2)
- WakeSleep (0=Wake, 1=Sleep)
- Order (0=Sleep first, 1=Wake first)
- Age
- Gender

**Test sessions (1 & 2) additionally:**
- TargetFoil (0=Target, 1=Foil)
- Response (0=Old, 1=New, blank if timeout/invalid)
- Correct (1 if Old→Target or New→Foil, 0 if wrong, blank if no valid response)

### Data aggregation
- All trials for one participant across both days and all sessions in a single file
- Eventually: combined file across all participants for analysis

## Multi-Center / Lab Features

### Lab setup
- Each lab has login credentials and a lab number
- Lab selects: participant ID, condition order (0/1), test day (1 or 2), language
- Experiment should work offline once loaded (resilient to bad internet)
- Data uploads to server after session (or continuously if connection allows)

### Lab dashboard
- Labs can **view** (read-only) their own collected data
- Google Drive-like file browser interface
- Download to Excel for local editing
- Upload sleep data: EDF files + sleep scoring to S3 bucket
- Questionnaire data handled outside this platform (sent via secure channel by labs)

### Admin view (researchers)
- View all data across all labs
- Basic stats: participants per lab, collection progress

## Internationalization (i18n)
- All participant-facing text must support multiple languages
- Initial: Swedish + English (built by us)
- Additional languages (e.g., German) provided by partner labs as translation files
- Language selected by lab at session start

## Open Science Requirements
- Study is a **registered report** (methods/analysis pre-registered and accepted by journal before data collection)
- All anonymized data and analysis code shared on Open Science Framework (OSF)
- Follows **Psych-DS** standard for metadata and data reusability
- Target journal: Nature Human Behaviour
- All outputs use CRediT taxonomy for contributor attribution

## Prior Work
- PsychoPy pilot exists (see `BackgroundInfo/B2_NAPS_Pilot_TEST2_*.csv` for data format reference)
- The CSV shows the PsychoPy prototype's output structure — our web version should produce cleaner, more structured output
- Grant proposal: `BackgroundInfo/B1 Submitted.docx.txt` — full scientific rationale and methodology

## Development Guidelines

- Keep timing parameters in a central config — they will change during piloting
- Image randomization logic must enforce constraints (no >3 same emotion in a row, balanced blocks)
- Offline-first for the experiment runner; sync when connection is available
- Data integrity is critical — never allow labs to edit collected data through the platform
- All experiment state and responses must be recoverable if browser crashes mid-session
- Data output should be compatible with Psych-DS standards for eventual OSF sharing
- Plan for Test 3 (online next-day test) — needs remote/self-service participant access
