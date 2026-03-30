# NAPS Platform — Experiment Runtime Architecture

## Problem

The experiment runner must display stimuli with millisecond-level timing accuracy and survive any failure (network loss, browser crash, power outage) without losing data. Standard browser APIs like `setTimeout` are inadequate — they are throttled, drifting, and not synchronized to the display refresh cycle. We need frame-accurate presentation and bulletproof state recovery.

---

## 1. Timing Architecture

### Why `setTimeout` fails

`setTimeout(fn, 750)` does **not** guarantee execution at 750ms. The callback is placed in the macrotask queue and may fire 5–50ms late depending on main thread load, tab throttling, and OS scheduling. For a 750ms image presentation, that is a potential 7% error — unacceptable for a psychophysics experiment.

### Core approach: `requestAnimationFrame` + `performance.now()`

All timing in the experiment runner is driven by a single `requestAnimationFrame` (rAF) loop. rAF callbacks fire once per display refresh (vsync), giving us the finest granularity the browser can offer:

- **60 Hz display** → callback every ~16.67ms (1 frame)
- **120 Hz display** → callback every ~8.33ms
- **144 Hz display** → callback every ~6.94ms

The loop uses `performance.now()` (microsecond resolution) to measure elapsed time and decide when to transition between trial phases.

```
┌──────────────────────────────────────────────────────────┐
│  rAF loop (runs every frame for the entire session)      │
│                                                          │
│  1. timestamp = performance.now()                        │
│  2. elapsed = timestamp - phaseStartTime                 │
│  3. if elapsed >= phaseDuration → transition to next     │
│     phase, record actual timestamp                       │
│  4. requestAnimationFrame(loop)                          │
└──────────────────────────────────────────────────────────┘
```

### Frame-aligned transitions

When we need to show an image for exactly 750ms:

1. On the rAF tick where the image first paints, record `phaseStartTime = timestamp`.
2. On each subsequent tick, check `elapsed >= 750`.
3. On the first tick where this is true, hide the image and record the **actual** display duration.

At 60 Hz, 750ms = 45 frames. The actual duration will be a multiple of ~16.67ms (e.g., 750.0ms rounds to frame 45 = 750.05ms). This is the best precision a browser can achieve — identical to how PsychoPy operates on standard displays.

### Recording actual vs. intended timing

Every trial records both:

| Field              | Description                                         |
|--------------------|-----------------------------------------------------|
| `image_actual_ms`  | The measured image display duration via `performance.now()` delta |
| `image_frame_count`| Number of rAF ticks the image was visible            |
| `dropped_frames`   | Number of detected frame drops during this trial     |
| `presented_at`     | Wall-clock timestamp of image onset (see conversion below) |

This allows post-hoc verification of timing accuracy across all trials and detection of any dropped frames or anomalies.

### `presented_at` — converting `performance.now()` to wall-clock

The runtime measures timing with `performance.now()` (monotonic, not subject to clock skew). For database storage as `TIMESTAMPTZ`, we convert:

```javascript
const wallClockMs = performance.timeOrigin + performance.now();
const presentedAt = new Date(wallClockMs);  // → TIMESTAMPTZ
```

`performance.timeOrigin` is the high-resolution timestamp of the page's time origin (when the document was created). This gives us a wall-clock time with ~ms precision. The high-resolution deltas (`image_actual_ms`, `image_frame_count`) are stored in separate columns to preserve sub-millisecond accuracy for timing analysis.

### Detecting and adapting to refresh rate

At session start, the runtime measures the display refresh rate:

```
1. Run 120 rAF callbacks, recording performance.now() each tick
2. Compute median inter-frame interval
3. Derive refresh rate (e.g., 16.67ms → 60 Hz)
4. Store as sessionMetadata.refreshRate
5. Log warning if refresh rate is unusual (<50 Hz or >165 Hz)
```

This metadata is saved with the session data so researchers can filter or flag trials from displays with non-standard refresh rates.

### Handling dropped frames

If the browser skips a frame (garbage collection, GPU stall, OS interrupt), the rAF timestamp will jump by ~2× the normal interval. The runtime:

1. Detects the gap: `delta > 1.5 × expectedFrameInterval`
2. Logs it as a `dropped_frame` event with the gap duration
3. Does **not** try to compensate — the `performance.now()` check still transitions at the correct elapsed time
4. The dropped frame count is saved per trial for analysis

---

## 2. Trial State Machine

Each trial is a finite state machine with strict phase ordering:

**Encoding sessions:**
```
FIXATION_VISIBLE (2750ms)
    → FIXATION_BLANK (250ms)
    → IMAGE (750ms)
    → VALENCE_RATING (4000ms)
    → INTER_RATING_GAP (1000ms)
    → AROUSAL_RATING (4000ms)
    → TRIAL_COMPLETE (instant → save data, advance)
```

**Test sessions (test1, test2):**
```
FIXATION_VISIBLE (2750ms)
    → FIXATION_BLANK (250ms)
    → IMAGE (750ms)
    → MEMORY_JUDGMENT (3000ms)
    → POST_MEMORY_GAP (1000ms)
    → VALENCE_RATING (4000ms)
    → INTER_RATING_GAP (1000ms)
    → AROUSAL_RATING (4000ms)
    → TRIAL_COMPLETE (instant → save data, advance)
```

The `POST_MEMORY_GAP` provides a 1s visual break between the memory judgment and the valence rating, matching the `INTER_RATING_GAP` between valence and arousal. This prevents carry-over keypresses from the memory judgment (W/P) accidentally registering as a valence rating (1–9) and gives the participant a consistent rhythm between all prompts.

The state machine is the single source of truth for what is displayed. The rAF loop reads the current state and renders accordingly. State transitions only happen inside the rAF callback, ensuring they are aligned to frame boundaries.

### Keyboard input handling

Key events are captured via `keydown` listeners but **processed** inside the rAF loop:

1. `keydown` handler stores the event in a buffer: `{ code, key, timestamp: performance.now() }`
2. On the next rAF tick, the loop reads the buffer and processes valid inputs
3. This ensures input timestamps are accurate (captured at event time) while state transitions remain frame-aligned

**Key matching uses `event.code` (physical key position), not `event.key` (character).** This ensures consistent behavior across keyboard layouts (QWERTY, AZERTY, QWERTZ). For example, `event.code === 'KeyW'` always refers to the same physical key regardless of locale.

For rating scales: the first valid keypress (`Digit1`–`Digit9` for ratings, memory keys for old/new) records the reaction time as `keyTimestamp - phaseStartTime` and immediately triggers the phase to end on the current frame.

### Memory judgment key configuration

The memory judgment keys are part of the timing/input config, not hardcoded:

```javascript
const INPUT = {
    memoryOldKey: 'KeyW',    // physical key for "Old" response
    memoryNewKey: 'KeyP',    // physical key for "New" response
    resumeKey:    'KeyQ',    // experimenter resume key
    ratingKeys:   ['Digit1', 'Digit2', ..., 'Digit9'],
};
```

This config is served from the backend alongside timing parameters. If a partner lab uses a non-QWERTY layout and the physical positions are awkward, the keys can be remapped per-lab without code changes. The on-screen prompts ("W = Old, P = New") update dynamically from this config — they display the character produced by the physical key in the participant's keyboard layout.

---

## 3. Image Pre-loading

All images must be loaded before the first trial starts. Any loading during the session would cause unpredictable delays.

### Pre-load strategy

1. When a session is launched, fetch the participant's image assignments for this lab day and session type.
2. Create `Image()` objects for all 80 images (+ ~6 practice images).
3. Wait for all `onload` events to fire before showing the first trial.
4. Show a progress bar during loading ("Loading images: 34/80").
5. If any image fails to load, retry 3 times, then show the `ImageLoadError` component (a full-screen error panel listing which images failed). The experimenter can retry or abort — the experiment does not proceed with missing images.

### Cache-first with Service Worker

A Service Worker pre-caches all 320 images at first login, so subsequent sessions load from disk cache instantly:

```
Initial setup (first time lab uses the platform):
    → Service Worker installs
    → Fetches all 320 images into Cache Storage
    → ~50-100 MB total (depends on image resolution)
    → Dashboard shows progress bar: "Caching images: 142/320"
    → If interrupted (tab closed, network drops), resumes on next visit
      (tracks which images are already cached, only fetches missing ones)

Session start:
    → Image requests hit SW cache → instant
    → No network dependency during experiment
```

The initial cache population only needs to happen once per browser. The dashboard home page (2.1) shows a cache status indicator — if images are not fully cached, it warns the experimenter before they can launch a session.

---

## 4. Practice Mode

Before each real session, a short practice run familiarizes the participant with the trial flow.

### Practice images

Practice uses **6 neutral images** from a separate set (not part of the 320 experimental images). These are:
- Bundled as static assets with the frontend (not stored in the `images` database table)
- The same across all labs and all participants
- Fixed (non-randomized) presentation order
- Neutral only — no negative images in practice

**Encoding practice**: All 6 images are presented identically (fixation → image → valence → arousal).

**Test practice**: The 6 images are split into 3 PracticeOld + 3 PracticeNew. The TrialEngine assigns `target_foil` values so the `MemoryJudgment` phase functions correctly — participants practice responding "Old" or "New" before the real test. (In the PsychoPy pilot, these were labeled `PracticeOld` and `PracticeNew` in the stimulus list.)

### Practice-to-real transition

The `TrialEngine` accepts a `mode` parameter: `'practice'` or `'real'`.

In practice mode:
- The trial state machine is identical to the real session (same phases, same timing)
- The session type determines whether `MEMORY_JUDGMENT` + `POST_MEMORY_GAP` phases are included
- For test practice, 3 images are marked Old and 3 New so the memory judgment works correctly
- **No data is written to IndexedDB** and no trial rows are synced to the server
- Timing data is still measured (used for the pre-session timing verification)

The full practice flow:

```
1. PracticeIntro screen — instructions, experimenter presses Q to start
2. TrialEngine runs 6 trials in practice mode
   (timing is measured but not saved)
3. PracticeComplete screen — timing check results shown to experimenter
   If mean timing deviation > 20ms: warning displayed
   Experimenter presses Q to proceed to real session
4. TrialEngine switches to real mode, runs 80 trials
```

---

## 5. Offline Resilience & Crash Recovery

### Principle: the experiment never depends on the network

Once a session is launched, **zero** network calls are made during the experiment. All data is written locally. Sync happens after the session completes (or on reconnect).

### Offline session creation

Session IDs are UUIDs generated client-side via `crypto.randomUUID()`. This allows session creation even when the network is down:

```
1. Lab staff clicks "Launch Experiment" on the dashboard
2. Client generates UUID for the new session
3. Session config (participant, day, type, condition, image assignments)
   is written to IndexedDB
4. If online: session row is also POST'd to the server immediately
5. If offline: session row is queued in "pendingSync" and POST'd later
6. Experiment starts immediately — no server round-trip required
```

The image assignments (including presentation order) are fetched from the server when the participant is loaded on the Start Session page — **before** the session is launched. These are cached in IndexedDB so they survive offline session creation. The canonical presentation order lives in the `participant_image_assignments` table on the server; the client holds a local copy.

### Per-trial persistence (IndexedDB)

After each trial completes (state = `TRIAL_COMPLETE`), the trial data is written to IndexedDB immediately:

```
IndexedDB schema:
    store: "sessions"
        key: sessionId (UUID)
        value: { config, imageAssignments, metadata, status }

    store: "trials"
        key: [sessionId, trialNumber]
        value: { trialNumber, imageId, ratings, timing, ... }

    store: "pendingSync"
        key: auto-increment
        value: { type: "trial" | "session", data, createdAt }
```

IndexedDB writes are transactional and survive:
- Tab close
- Browser crash
- Power loss (data is fsynced to disk)
- Network loss (no network involved)

### Session state checkpointing

The full session state is checkpointed to IndexedDB after every trial:

```json
{
    "sessionId": "a1b2c3d4-...",
    "participantId": 42,
    "labDay": 1,
    "sessionType": "encoding",
    "currentTrialIndex": 34,
    "completedTrials": 34,
    "status": "in_progress",
    "startedAt": "2026-03-15T13:45:00.000Z"
}
```

Note: the presentation order is **not** stored in the checkpoint. It is stored in the `imageAssignments` field of the session record (copied from the server's `participant_image_assignments` table at session creation). This means even if the checkpoint is lost, the order can be reconstructed from the server.

### Crash recovery flow

When the experiment runner loads, before starting anything:

```
1. Check IndexedDB for any session with status = "in_progress"
2. If found:
   a. Show recovery prompt to experimenter:
      "A previous session was interrupted at trial 34/80.
       Resume or discard?"
   b. If resume: load the session record (includes image assignments
      with presentation order), skip to trial 35
   c. If discard: mark session as "abandoned", start fresh
3. If not found: proceed normally
```

This means a power outage at trial 60 loses **only** the interrupted trial. The previous 59 trials are intact.

### What if IndexedDB is lost?

If IndexedDB is cleared (e.g., different browser, cache purge) while a session is in progress:

1. The client has no local state to recover from.
2. The server has the session row (if it was synced) and any trials that were synced before the loss.
3. The presentation order is always recoverable from `participant_image_assignments` on the server.
4. The experimenter must re-launch the session. Any unsynced trials from the lost IndexedDB are gone — but this scenario (IndexedDB lost AND network was down so trials weren't synced) is extremely unlikely.

### What is NOT recoverable

- The trial that was actively running when the crash occurred. Partial timing data for a mid-trial crash is discarded (incomplete trial = no valid data).

---

## 6. Data Sync

### When sync happens

1. **After session completes**: all trial data is POST'd to the server.
2. **On reconnect**: if the session completed while offline, a background sync fires when connectivity returns.
3. **Never during the experiment**: no network I/O between trial 1 and trial 80.

### Sync mechanism

```
1. Read all entries from "pendingSync" store
2. POST each to /api/sessions/:id/trials (batch endpoint)
3. On success: delete from "pendingSync", update session status
4. On failure: leave in "pendingSync", retry on next sync attempt
5. Exponential backoff for repeated failures
```

### Sync status indicator

The `SyncIndicator` component (visible to the experimenter, not the participant) shows:

| State       | Display                          |
|-------------|----------------------------------|
| Synced      | Green dot — all data uploaded    |
| Pending     | Yellow dot — data queued locally |
| Syncing     | Spinning — upload in progress    |
| Offline     | Grey dot — no connection         |
| Error       | Red dot — sync failed, will retry|

---

## 7. Session Safeguards

### Preventing accidental exit

- `beforeunload` event handler warns if a session is in progress: "An experiment session is running. Leaving will interrupt the session."
- Fullscreen exit triggers a prominent "You have exited fullscreen" overlay with a button to re-enter — the experiment pauses until fullscreen is restored.

### Preventing interference

- **Wake Lock API**: prevents the screen from dimming or the device from sleeping during the session.
- **Keyboard capture**: during trials, all keypresses except valid response keys (matched by `event.code`) are suppressed. No browser shortcuts (Ctrl+W, Cmd+Q) can silently close the tab without the `beforeunload` warning.
- **No context menu**: right-click is disabled during the experiment.
- **Cursor hidden**: CSS `cursor: none` on the experiment container. No pointer lock (which changes mouse behavior and could cause confusion if the experiment needs to be interrupted).

### Fullscreen management

```
1. On launch: request fullscreen via Fullscreen API
2. If denied (user or browser policy): show warning but proceed —
   fullscreen is preferred but not required
3. On exit: pause experiment, show re-enter prompt
4. CSS: experiment container is always 100vw × 100vh with black
   background regardless of fullscreen state
```

---

## 8. Timing Configuration

All timing values are in a single config object, loaded at session start. Values are in milliseconds:

```javascript
const TIMING = {
    fixationVisible:    2750,
    fixationBlank:       250,
    imageDisplay:        750,
    memoryTimeout:      3000,
    postMemoryGap:      1000,   // gap between memory judgment and valence rating
    ratingTimeout:      4000,
    interRatingGap:     1000,   // gap between valence and arousal ratings
    pauseDuration:     60000,
    pauseTrialIndex:      40,   // pause after this trial number
};
```

These values are served from the backend config endpoint alongside the `INPUT` key config, making them adjustable during piloting without redeploying the frontend.

---

## 9. Timing Validation & QA

### Built-in timing audit

After each session completes, the runtime computes summary statistics:

```json
{
    "refreshRate": 59.94,
    "totalTrials": 80,
    "droppedFrames": 2,
    "imageDuration": {
        "intended": 750,
        "mean": 750.12,
        "min": 733.4,
        "max": 766.8,
        "sd": 0.8
    },
    "fixationDuration": { ... },
    "ratingDurations": { ... }
}
```

This is saved to the `sessions.timing_metadata` JSONB column (see database schema doc) and displayed in the participant detail page on the lab dashboard. If any trial's actual duration deviates from the intended by more than one frame interval (e.g., >17ms at 60 Hz), it is flagged in `flagged_trials`.

### Pre-session timing test

Before the first real trial, the practice phase doubles as a timing verification:

1. During practice, the runtime measures actual display durations for all practice images.
2. If the mean deviation exceeds a threshold (e.g., >20ms), a warning is shown to the experimenter: "Display timing may be inaccurate on this device. Mean deviation: Xms."
3. The experimenter can proceed or abort.

---

## Summary

| Concern                | Solution                                                     |
|------------------------|--------------------------------------------------------------|
| Display timing         | rAF loop + `performance.now()`, frame-aligned transitions    |
| Timing verification    | `image_actual_ms` + `image_frame_count` per trial, `timing_metadata` per session |
| Timestamp storage      | `performance.timeOrigin + performance.now()` → wall-clock `TIMESTAMPTZ` |
| Image loading delays   | Pre-load all 80+6 images before session; Service Worker cache with progress |
| Network dependency     | Zero network calls during experiment; client-generated UUIDs  |
| Data persistence       | IndexedDB write after every trial                            |
| Crash recovery         | Session checkpoint in IndexedDB; presentation order from server DB |
| Data sync              | Background sync after session; retry with backoff            |
| Accidental exit        | `beforeunload` warning, fullscreen pause/restore             |
| Screen dimming         | Wake Lock API                                                |
| Keyboard handling      | `event.code` for physical keys; configurable key mapping per lab |
| Inter-prompt gaps      | 1s gap after memory judgment + 1s gap after valence (consistent rhythm) |
| Practice mode          | Same trial engine, no data saved, timing used for QA check   |
| Configurable timing    | Central config served from backend, no frontend redeploy     |
