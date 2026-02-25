# SleepStudy - Multicenter Sleep & Memory Experiment Platform

## Project Overview

Web platform for a multicenter sleep study led by Per Davidsson. The experiment investigates how sleep vs. wakefulness affects emotional memory consolidation. Multiple labs worldwide run the same protocol; this platform handles experiment delivery, data collection, and lab administration.

## Tech Stack

- **Backend**: Node.js (Express)
- **Frontend**: React
- **Database**: TBD (needs to store participant data, session results, lab accounts)

## Experiment Design

### Conditions
Each participant does **two lab days** (counterbalanced across sleep/wake):
- **Sleep condition**: Participant sleeps between encoding and test
- **Wake condition**: Participant stays awake between encoding and test
- Counterbalancing: randomized whether sleep or wake comes first (Order: 0=Wake first, 1=Sleep first)

### Stimuli
- **320 images** total from multiple databases (IAPS, GAPED, Nencki, EmoMadrid, OASIS)
- 160 negative, 160 neutral
- Split into two sets of 160 (80 neg + 80 neutral) — one per lab day
- Each set is further divided for encoding (80 images) and test phases (targets + foils)

### Sessions (3 per lab day, 6 total per participant)

**Session 0 — Encoding:**
- 80 images (40 negative, 40 neutral), random order
- Each image: shown 0.75s on black background
- Fixation cross between images (2.75s visible + 0.25s blank = 3s ISI)
- After each image: Valence rating (1-9, 4s limit) then Arousal rating (1-9, 4s limit)
- 1s gap between rating prompts; prompts disappear immediately on keypress
- 1-minute pause after 40 images (countdown timer, experimenter resumes with Q key)
- Constraint: avoid >3 consecutive images of same emotion

**Session 1 — Test 1:**
- 80 images: 20 old negative + 20 old neutral (targets from encoding) + 20 new negative + 20 new neutral (foils)
- Same display timing as encoding
- Additional question before ratings: "Old or New?" (W=Old, P=New, 3s limit)
- Then Valence + Arousal ratings as before
- 1-minute pause after 40 images (balanced: 20 per emotion before/after pause)

**Session 2 — Test 2:**
- Identical structure to Test 1
- Uses the remaining 40 targets from encoding + 40 new foils not shown in Test 1

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
- Order (0=Wake first, 1=Sleep first)
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
- Upload sleep data: EDF files + sleep scoring (total sleep time, time per sleep stage)
- Optional: questionnaire data entry (depression/anxiety scales)

### Admin view (researchers)
- View all data across all labs
- Basic stats: participants per lab, collection progress

## Internationalization (i18n)
- All participant-facing text must support multiple languages
- Initial: Swedish + English (built by us)
- Additional languages (e.g., German) provided by partner labs as translation files
- Language selected by lab at session start

## Prior Work
- PsychoPy pilot exists (see `BackgroundInfo/B2_NAPS_Pilot_TEST2_*.csv` for data format reference)
- The CSV shows the PsychoPy prototype's output structure — our web version should produce cleaner, more structured output

## Development Guidelines

- Keep timing parameters in a central config — they will change during piloting
- Image randomization logic must enforce constraints (no >3 same emotion in a row, balanced blocks)
- Offline-first for the experiment runner; sync when connection is available
- Data integrity is critical — never allow labs to edit collected data through the platform
- All experiment state and responses must be recoverable if browser crashes mid-session
