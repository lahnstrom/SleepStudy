# NAPS Platform — Screen Inventory

## Overview

All screens in the NAPS web platform, organized by user context. The platform has two distinct interfaces: the **lab staff dashboard** (authenticated) and the **experiment runner** (fullscreen, participant-facing).

---

## 1. Authentication

### 1.1 Login
- Email + password form
- On success: redirect to lab dashboard (lab_user) or admin dashboard (admin)
- No self-registration — accounts created by admins

---

## 2. Lab Staff Dashboard

Accessible after login. Lab users see only their own lab's data. All screens share a persistent sidebar/nav.

### 2.1 Home / Overview
- Summary stats: number of participants, sessions completed, collection progress
- Quick links to start a new session or view data
- **Image cache status**: indicator showing whether all 320 images are cached locally via Service Worker. If not fully cached, shows progress and blocks session launch until complete.

### 2.2 Participants
- **List view**: Table of all participants for this lab (code, condition order, age, gender, sessions completed)
- **Create participant**: Form with fields:
  - Participant code (lab-assigned ID)
  - Condition order (0 = Sleep first, 1 = Wake first)
  - Age, gender
  - Language (dropdown)
- On creation: triggers image randomization (populates `participant_image_assignments`)
- **Participant detail**: Per-participant view showing:
  - Demographics
  - Session status (which sessions are completed, in progress, or not started)
  - Links to start/resume sessions
  - **Timing QA summary** per completed session: refresh rate, mean image duration, dropped frames, flagged trials. Expandable for detail. Data from `sessions.timing_metadata`.
  - Sleep data summary (if entered)
  - Uploaded files
  - Questionnaire completion status

### 2.3 Start Session
- Lab selects: participant, lab day (1 or 2), session type
- **Session ordering validation**: session type dropdown enforces strict protocol ordering on the same day. Encoding must be completed before test1 can be started; test1 must be completed before test2 can be started. Already-completed sessions are shown as disabled with a checkmark.
- Condition (sleep/wake) is derived automatically from participant's condition order + lab day and displayed for confirmation
- Language shown (inherited from participant record)
- **Confirmation dialog** before launch: shows participant code, day, session type, condition — experimenter must confirm before proceeding
- "Launch Experiment" button → generates client-side UUID for the session, opens experiment runner in fullscreen

### 2.4 Data Browser
- Google Drive-like file browser (read-only view of collected data)
- Organized by participant → lab day → session
- Preview trial data in-browser (table view)
- Download as Excel/CSV (per participant, per session, or bulk)
- No editing of collected trial data through this interface

### 2.5 Sleep Data Entry
- Form per participant per lab day:
  - Total sleep time (min)
  - N1, N2, N3, REM durations (min)
  - WASO, SOL (min)
  - Free-text notes
- EDF file upload (drag-and-drop or file picker). Supports chunked upload for large files (up to 2 GB). Shows upload progress bar.
- Shows previously entered data if re-visiting

### 2.6 Questionnaire Entry
- Select participant and questionnaire type
- Instrument-specific forms:
  - **KSS**: Single 1–9 scale. Linked to a session (before encoding / before each test)
  - **STAI**: 20-item State or Trait form
  - **MEQ**: Morningness-Eveningness items
  - **Sleep diary**: Habitual sleep pattern fields
  - **Depression/Anxiety scales**: Configurable per lab — admin sets the instrument name, number of items, and response scale range. Labs then see a form matching their chosen instrument.
- Shows completion status per participant
- Questionnaire responses are **editable** (unlike trial data) since they are staff-entered. Previously submitted responses can be corrected with an "Edit" action.

---

## 3. Admin Dashboard

Same navigation as lab dashboard, plus cross-lab views. Only accessible to users with `admin` role.

### 3.1 All Labs Overview
- Table of all labs: lab number, name, participant count, session completion counts
- Progress bars or counts showing collection status per lab

### 3.2 All Participants
- Filterable table across all labs
- Same columns as lab participant list, plus lab name/number column
- Click through to participant detail (read-only)

### 3.3 All Data Export
- Bulk CSV export across all labs (uses the reference export query from database schema doc)
- Filter options: by lab, by condition, by session type
- Download as single combined file or per-lab files

### 3.4 Lab Management
- Create new lab (lab number, name)
- Create user accounts (email, password, assign to lab)
- Reset passwords

---

## 4. Experiment Runner

Fullscreen, participant-facing interface. Launched from the lab dashboard (Section 2.3). No navigation chrome — just the experiment. All text is displayed in the participant's selected language.

### 4.0 Practice
- Shown before each session type (encoding or test)
- **Encoding practice**: 6 neutral images from a separate set (static assets, not in the image database). Same trial flow as encoding (fixation → image → valence → arousal).
- **Test practice**: 6 neutral images — 3 labeled "Old" (PracticeOld) + 3 labeled "New" (PracticeNew). Same trial flow as test sessions (fixation → image → memory judgment → gap → valence → arousal). Allows participants to practice the Old/New judgment.
- All practice images are the same across all labs. Fixed (non-randomized) image order. No data saved.
- Timing is measured during practice as a pre-session QA check
- Ends with "Practice complete" screen showing timing check results. If timing deviation is high, a warning is shown. Experimenter presses Q to proceed to real session.

### 4.1 Encoding Session (Session 0)

Sequential flow, 80 trials:

```
┌─────────────────────────┐
│   Fixation Cross (+)    │  2.75s visible + 0.25s blank = 3s ISI
├─────────────────────────┤
│   Image Display         │  0.75s on black background
├─────────────────────────┤
│   Valence Rating        │  "How pleasant/unpleasant?" 1-9 scale, 4s limit
│                         │  Disappears immediately on keypress
├─────────────────────────┤
│   1s gap                │
├─────────────────────────┤
│   Arousal Rating        │  "How calm/excited?" 1-9 scale, 4s limit
│                         │  Disappears immediately on keypress
├─────────────────────────┤
│   → next trial          │
└─────────────────────────┘
```

- **Pause screen** after trial 40: 60-second countdown timer. Experimenter presses Q to resume (not Space, to prevent accidental participant input).
- Constraint: no more than 3 consecutive images of the same emotion.

### 4.2 Test Session (Sessions 1 & 2)

Same flow as encoding, but with an additional memory judgment before ratings:

```
┌─────────────────────────┐
│   Fixation Cross (+)    │  2.75s visible + 0.25s blank = 3s ISI
├─────────────────────────┤
│   Image Display         │  0.75s on black background
├─────────────────────────┤
│   Memory Judgment       │  "Old or New?" W=Old, P=New, 3s limit
├─────────────────────────┤
│   1s gap                │  (post-memory gap, matches inter-rating gap)
├─────────────────────────┤
│   Valence Rating        │  1-9 scale, 4s limit
├─────────────────────────┤
│   1s gap                │  (inter-rating gap)
├─────────────────────────┤
│   Arousal Rating        │  1-9 scale, 4s limit
├─────────────────────────┤
│   → next trial          │
└─────────────────────────┘
```

Memory judgment keys are configurable per lab (default: W=Old, P=New on QWERTY). Key prompts update dynamically based on the configured key mapping.

- 80 images: 40 targets (from encoding) + 40 foils (new)
- **Pause screen** after trial 40 (balanced: 20 per emotion before/after pause)
- Same Q-key resume as encoding

### 4.3 Session Complete
- "Session complete" message
- Data upload begins (or queued if offline)
- Experimenter exits fullscreen / returns to dashboard

### 4.4 Image Load Error
- Shown if any images fail to load after 3 retries during pre-session loading
- Full-screen error panel listing which images failed
- "Retry" button to re-attempt loading
- "Abort" button to return to dashboard without starting the session

### 4.5 Offline Behavior
- Experiment runs fully client-side once loaded
- All trial data stored in IndexedDB after each trial
- Session ID is a client-generated UUID — no server round-trip needed to start
- Sync to server when connection is available (after session completes or on reconnect)
- Visual indicator of sync status (uploaded / pending / offline / error)

---

## Screen Summary Table

| #    | Screen                  | User          | Purpose                                  |
|------|-------------------------|---------------|------------------------------------------|
| 1.1  | Login                   | All           | Authentication                           |
| 2.1  | Home / Overview         | Lab staff     | Summary stats, quick links, image cache status |
| 2.2  | Participants            | Lab staff     | List, create, view participant details + timing QA |
| 2.3  | Start Session           | Lab staff     | Configure, validate ordering, confirm and launch |
| 2.4  | Data Browser            | Lab staff     | View and download collected data          |
| 2.5  | Sleep Data Entry        | Lab staff     | Enter PSG scores, upload EDF files (up to 2 GB) |
| 2.6  | Questionnaire Entry     | Lab staff     | Enter/edit psychometric instrument data   |
| 3.1  | All Labs Overview       | Admin         | Cross-lab progress tracking               |
| 3.2  | All Participants        | Admin         | Cross-lab participant view                |
| 3.3  | All Data Export         | Admin         | Bulk CSV export (includes RTs, LabDay, sleep data) |
| 3.4  | Lab Management          | Admin         | Create labs and user accounts             |
| 4.0  | Practice                | Participant   | Training + timing QA check                |
| 4.1  | Encoding Session        | Participant   | Image viewing + valence/arousal ratings   |
| 4.2  | Test Session            | Participant   | Old/new judgment + gaps + ratings         |
| 4.3  | Session Complete        | Participant   | Completion message + data sync            |
| 4.4  | Image Load Error        | Experimenter  | Error recovery for failed image loading   |
