# NAPS Platform — React Component Map

## Overview

React components organized by page. Shared/reusable components are listed first, then components are grouped by the screen they appear on (matching `docs/screens.md` numbering).

---

## Shared / Layout Components

These appear across multiple pages.

| Component             | Description                                                        |
|-----------------------|--------------------------------------------------------------------|
| `AppLayout`           | Top-level layout with sidebar nav + main content area. Wraps all dashboard pages (2.x, 3.x). |
| `Sidebar`             | Persistent navigation sidebar. Shows nav links based on user role. Admin users see extra items (3.x). |
| `ProtectedRoute`      | Route guard that checks authentication + role. Redirects to login if unauthenticated, or blocks if wrong role. |
| `StatCard`            | Reusable card showing a label + number (e.g., "Participants: 24"). Used on overview pages. |
| `DataTable`           | Sortable, filterable table with pagination. Used for participant lists, trial data preview, lab overview. |
| `StatusBadge`         | Colored badge showing status (e.g., "Completed", "In Progress", "Not Started"). |
| `ConfirmDialog`       | Modal dialog for confirming actions (e.g., launching a session).   |
| `LoadingSpinner`      | Loading state indicator.                                           |
| `EmptyState`          | Placeholder shown when a list/table has no data yet.               |

---

## 1. Authentication

### 1.1 Login Page — `/login`

| Component        | Description                                                           |
|------------------|-----------------------------------------------------------------------|
| `LoginPage`      | Page container. Centered card layout, no sidebar.                     |
| `LoginForm`      | Email + password fields, submit button, error display.                |

---

## 2. Lab Staff Dashboard

All pages below render inside `AppLayout` with `Sidebar`.

### 2.1 Home / Overview — `/dashboard`

| Component              | Description                                                      |
|------------------------|------------------------------------------------------------------|
| `DashboardPage`        | Page container.                                                  |
| `StatCard` (×3–4)      | Participant count, sessions completed, completion progress, etc. |
| `ImageCacheStatus`     | Shows Service Worker image cache progress. Displays "All images cached" (green) or "Caching: 142/320" with progress bar. Blocks session launch until complete. |
| `QuickActions`         | Links/buttons: "New Participant", "Start Session", "View Data".  |
| `RecentActivity`       | List of recent sessions/uploads for this lab.                    |

### 2.2 Participants — `/participants`

#### List View — `/participants`

| Component                | Description                                                    |
|--------------------------|----------------------------------------------------------------|
| `ParticipantListPage`    | Page container.                                                |
| `DataTable`              | Table of participants (code, condition order, age, gender, session count). Rows are clickable. |
| `CreateParticipantButton`| Button that opens the create form/modal.                       |

#### Create — `/participants/new`

| Component                | Description                                                    |
|--------------------------|----------------------------------------------------------------|
| `CreateParticipantPage`  | Page container (or modal over list view).                      |
| `ParticipantForm`        | Form with fields: participant code, condition order (radio: Sleep first / Wake first), age, gender, language (dropdown). Validates uniqueness of code within lab. |

#### Detail — `/participants/:id`

| Component                  | Description                                                  |
|----------------------------|--------------------------------------------------------------|
| `ParticipantDetailPage`    | Page container.                                              |
| `ParticipantHeader`        | Demographics summary (code, age, gender, condition order, language). |
| `SessionStatusTable`       | Table showing all 6 possible sessions (2 days × 3 types) with status badges. Each row links to start/resume. Session count is derived from the `session_type` enum, not hardcoded. |
| `TimingAuditSummary`       | Per-session card showing timing QA data from `sessions.timing_metadata`: refresh rate, mean image duration, dropped frame count, number of flagged trials. Expandable to show per-trial detail. Highlighted in red/yellow if any trials are flagged. |
| `SleepDataSummary`         | Card showing entered sleep scores per day, or "Not entered" state. Links to sleep data entry. |
| `FileList`                 | List of uploaded files (EDF, etc.) with download links.      |
| `QuestionnaireStatusList`  | Checklist of questionnaire types with completion status per instrument. |

### 2.3 Start Session — `/sessions/start`

| Component              | Description                                                      |
|------------------------|------------------------------------------------------------------|
| `StartSessionPage`     | Page container.                                                  |
| `SessionConfigForm`    | Form: select participant (dropdown/search), lab day (1 or 2), session type (encoding / test1 / test2). **Session type dropdown enforces strict protocol ordering**: encoding must be completed before test1; test1 must be completed before test2 (same day). Already-completed sessions show a checkmark and are not selectable. |
| `SessionSummary`       | Read-only confirmation panel: shows participant code, condition (auto-derived), language, session type. |
| `LaunchButton`         | "Launch Experiment" button. Opens `ConfirmDialog` for final confirmation, then generates a client-side UUID, triggers fullscreen, and loads the experiment runner. |

### 2.4 Data Browser — `/data`

| Component              | Description                                                      |
|------------------------|------------------------------------------------------------------|
| `DataBrowserPage`      | Page container.                                                  |
| `FolderTree`           | Left panel: hierarchical tree — participant → lab day → session. |
| `TrialDataPreview`     | Right panel: `DataTable` showing trial-level data for the selected session (read-only). |
| `DownloadToolbar`      | Buttons: "Download CSV", "Download Excel". Options for per-session, per-participant, or bulk. |

### 2.5 Sleep Data Entry — `/participants/:id/sleep`

| Component              | Description                                                      |
|------------------------|------------------------------------------------------------------|
| `SleepDataPage`        | Page container.                                                  |
| `DayTabs`              | Tab switcher: Day 1 / Day 2.                                     |
| `SleepScoreForm`       | Fields: total sleep time, N1, N2, N3, REM, WASO, SOL (all in minutes), notes textarea. Pre-filled if data exists. |
| `EdfUpload`            | Drag-and-drop / file picker for EDF files. Supports chunked upload for files up to 2 GB. Shows upload progress bar and list of previously uploaded files. |

### 2.6 Questionnaire Entry — `/participants/:id/questionnaires`

| Component                  | Description                                                  |
|----------------------------|--------------------------------------------------------------|
| `QuestionnairePage`        | Page container.                                              |
| `QuestionnaireSelector`    | Dropdown or tab bar to pick instrument type (KSS, STAI, MEQ, sleep diary, depression, anxiety). |
| `KssForm`                  | Single 1–9 scale input. Session selector (which session this KSS is tied to). |
| `StaiForm`                 | 20-item Likert form. Toggle for State vs. Trait.             |
| `MeqForm`                  | Morningness-Eveningness questionnaire items.                 |
| `SleepDiaryForm`           | Fields for habitual sleep patterns (bed time, wake time, sleep quality, etc.). |
| `GenericScaleForm`         | Configurable form for depression/anxiety scales that vary by lab. Reads instrument config (name, item count, response scale range, item labels) from the lab's settings. Renders N Likert items dynamically. Admin sets up the config per lab via Lab Management (3.4). |
| `QuestionnaireHistory`     | List of previously completed questionnaires for this participant, with timestamps. Each entry has an "Edit" button to correct data entry errors (questionnaire data is staff-entered and editable, unlike trial data). |

---

## 3. Admin Dashboard

Admin pages also render inside `AppLayout`. The `Sidebar` shows additional admin-only nav items.

### 3.1 All Labs Overview — `/admin/labs`

| Component              | Description                                                      |
|------------------------|------------------------------------------------------------------|
| `LabsOverviewPage`     | Page container.                                                  |
| `DataTable`            | Table of all labs: lab number, name, participant count, session counts. |
| `ProgressBar`          | Inline progress indicator per lab (sessions completed / expected). |

### 3.2 All Participants — `/admin/participants`

| Component              | Description                                                      |
|------------------------|------------------------------------------------------------------|
| `AllParticipantsPage`  | Page container.                                                  |
| `DataTable`            | Same as lab participant table, plus lab name/number column. Filterable by lab. |
| `LabFilter`            | Dropdown to filter by lab.                                       |

### 3.3 All Data Export — `/admin/export`

| Component              | Description                                                      |
|------------------------|------------------------------------------------------------------|
| `DataExportPage`       | Page container.                                                  |
| `ExportFilters`        | Filter controls: lab (multi-select), condition (sleep/wake/both), session type. |
| `ExportFormatSelector` | Radio: single combined file vs. per-lab files.                   |
| `ExportButton`         | Triggers CSV generation and download. Shows progress for large exports. |

### 3.4 Lab Management — `/admin/manage`

| Component              | Description                                                      |
|------------------------|------------------------------------------------------------------|
| `LabManagementPage`    | Page container.                                                  |
| `CreateLabForm`        | Fields: lab number, lab name.                                    |
| `CreateUserForm`       | Fields: email, password, assign to lab (dropdown).               |
| `UserTable`            | Table of existing users with lab assignment and role. Reset password action. |

---

## 4. Experiment Runner

Separate from the dashboard — renders fullscreen with no `AppLayout`/`Sidebar`. Black background. All text localized via i18n.

### Container

| Component              | Description                                                      |
|------------------------|------------------------------------------------------------------|
| `ExperimentRunner`     | Top-level container. Manages fullscreen mode, session state machine, offline data storage (IndexedDB), and crash recovery. Receives session config (participant, day, session type, condition, image assignments, UUID) as props/params. |
| `SyncIndicator`        | Small status icon (visible to experimenter, not participant) showing data sync state: green=synced, yellow=pending, spinning=syncing, grey=offline, red=error. |
| `CrashRecoveryPrompt`  | Shown on load if IndexedDB contains an in-progress session. Displays which session was interrupted and at what trial. "Resume" or "Discard" buttons. |

### 4.0 Practice

| Component              | Description                                                      |
|------------------------|------------------------------------------------------------------|
| `PracticeIntro`        | "This is a practice round" instruction screen. Experimenter presses Q to start. |
| `PracticeComplete`     | "Practice complete" message. Shows timing QA results from practice (mean deviation). If deviation > 20ms, shows a warning. Experimenter presses Q to proceed to real session. |

Practice reuses the same trial components below (FixationCross, ImageDisplay, etc.) via `TrialEngine` in `mode='practice'`. For encoding practice: 6 static neutral images. For test practice: 6 static neutral images (3 PracticeOld + 3 PracticeNew), enabling the memory judgment phase. No data saved to IndexedDB.

### 4.1 Encoding Session & 4.2 Test Session

These share a common trial engine. The test session adds extra steps (MemoryJudgment + PostMemoryGap).

| Component              | Description                                                      |
|------------------------|------------------------------------------------------------------|
| `TrialEngine`          | State machine that sequences trial phases for a full session. Accepts `mode` (`'practice'` or `'real'`) and `sessionType` (`'encoding'`, `'test1'`, `'test2'`). In practice mode: runs 6 trials, no IndexedDB writes. In real mode: runs 80 trials, writes to IndexedDB after each. Uses rAF loop + `performance.now()` for timing. Reads presentation order from image assignments. All keyboard input matched via `event.code` (physical key position). |
| `FixationCross`        | White "+" on black background. Displayed for 2.75s, then 0.25s blank. |
| `ImageDisplay`         | Shows stimulus image centered on black background for 0.75s. Records `image_actual_ms`, `image_frame_count`, and `dropped_frames`. |
| `MemoryJudgment`       | "Old or New?" prompt with configurable key hints (default: W / P on QWERTY). Keys and labels read from backend `INPUT` config and update dynamically per lab. 3s timeout. Only rendered in test sessions. |
| `PostMemoryGap`        | 1s blank/black screen between memory judgment and valence rating. Prevents carry-over keypresses. Only rendered in test sessions. |
| `RatingScale`          | 1–9 horizontal scale with key labels. Used for both valence and arousal. Configurable prompt text and timeout (4s). Disappears immediately on keypress. Input via `Digit1`–`Digit9` key codes. |
| `InterRatingGap`       | 1s blank/black screen between valence and arousal ratings.       |
| `PauseScreen`          | 60-second countdown timer. Displayed after trial 40. Resumes on Q keypress (not Space). |
| `ImageLoadError`       | Full-screen error panel shown if images fail to load after 3 retries. Lists failed images. "Retry" and "Abort" buttons. |

### 4.3 Session Complete

| Component              | Description                                                      |
|------------------------|------------------------------------------------------------------|
| `SessionComplete`      | "Session complete" message. Shows sync status. Experimenter can exit fullscreen / return to dashboard. |

---

## Component Tree Summary

```
App
├── LoginPage
│   └── LoginForm
│
├── AppLayout (authenticated)
│   ├── Sidebar
│   │
│   ├── DashboardPage
│   │   ├── StatCard (×N)
│   │   ├── ImageCacheStatus
│   │   ├── QuickActions
│   │   └── RecentActivity
│   │
│   ├── ParticipantListPage
│   │   ├── DataTable
│   │   └── CreateParticipantButton
│   │
│   ├── CreateParticipantPage
│   │   └── ParticipantForm
│   │
│   ├── ParticipantDetailPage
│   │   ├── ParticipantHeader
│   │   ├── SessionStatusTable
│   │   ├── TimingAuditSummary (per completed session)
│   │   ├── SleepDataSummary
│   │   ├── FileList
│   │   └── QuestionnaireStatusList
│   │
│   ├── StartSessionPage
│   │   ├── SessionConfigForm (with protocol ordering validation)
│   │   ├── SessionSummary
│   │   ├── LaunchButton → ConfirmDialog
│   │   └── (generates client-side UUID on confirm)
│   │
│   ├── DataBrowserPage
│   │   ├── FolderTree
│   │   ├── TrialDataPreview
│   │   └── DownloadToolbar
│   │
│   ├── SleepDataPage
│   │   ├── DayTabs
│   │   ├── SleepScoreForm
│   │   └── EdfUpload (chunked, up to 2 GB)
│   │
│   ├── QuestionnairePage
│   │   ├── QuestionnaireSelector
│   │   ├── KssForm / StaiForm / MeqForm / SleepDiaryForm / GenericScaleForm
│   │   └── QuestionnaireHistory (with Edit action)
│   │
│   ├── LabsOverviewPage (admin)
│   │   ├── DataTable
│   │   └── ProgressBar
│   │
│   ├── AllParticipantsPage (admin)
│   │   ├── DataTable
│   │   └── LabFilter
│   │
│   ├── DataExportPage (admin)
│   │   ├── ExportFilters
│   │   ├── ExportFormatSelector
│   │   └── ExportButton
│   │
│   └── LabManagementPage (admin)
│       ├── CreateLabForm
│       ├── CreateUserForm
│       └── UserTable
│
└── ExperimentRunner (fullscreen, no AppLayout)
    ├── SyncIndicator
    ├── CrashRecoveryPrompt (if interrupted session found)
    ├── PracticeIntro
    ├── TrialEngine (mode: practice | real)
    │   ├── FixationCross
    │   ├── ImageDisplay (records actual_ms, frame_count, dropped_frames)
    │   ├── MemoryJudgment (test sessions only, configurable keys)
    │   ├── PostMemoryGap (test sessions only)
    │   ├── RatingScale (×2: valence + arousal, via event.code)
    │   ├── InterRatingGap
    │   ├── PauseScreen
    │   └── ImageLoadError (if pre-load fails)
    ├── PracticeComplete (with timing QA results)
    └── SessionComplete
```
