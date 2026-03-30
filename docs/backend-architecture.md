# NAPS Platform — Backend Architecture

## Tech Stack

| Layer              | Choice                                  | Rationale                                           |
|--------------------|-----------------------------------------|-----------------------------------------------------|
| Platform           | **Supabase**                            | Managed PostgreSQL + Auth + Storage + Edge Functions. One platform for the entire backend. |
| Database           | **PostgreSQL 15** (Supabase-managed)    | Schema defined in `docs/database-schema.md`. ENUMs, JSONB, UUIDs. |
| Auth               | **Supabase Auth** (GoTrue)              | Built-in email/password auth, JWT handling, token refresh — no custom auth code. |
| Lab isolation      | **Row Level Security (RLS)**            | Lab data boundaries enforced at the database level, not just in application code. |
| File storage       | **Supabase Storage**                    | EDF files up to 2 GB. Bucket-level policies for lab isolation. Resumable uploads. |
| Server-side logic  | **PostgreSQL functions** + **Supabase Edge Functions** | Randomization, protocol validation, and CSV export run server-side. |
| Frontend client    | **@supabase/supabase-js**               | React frontend talks directly to Supabase for CRUD, auth, and file operations. |
| Validation         | **zod** (client-side) + **PostgreSQL constraints** (server-side) | Defense in depth — validate in the browser, enforce in the database. |

### Why Supabase instead of Express + pg?

The original architecture had a custom Express server handling auth, authorization, routing, and database access. Supabase replaces most of this:

| Concern                | Express approach             | Supabase approach                |
|------------------------|------------------------------|----------------------------------|
| Authentication         | Custom JWT + bcrypt          | Built-in, zero custom code       |
| Token refresh          | Custom refresh endpoint      | Handled by client library        |
| Lab data isolation     | Middleware checks             | RLS policies (database-enforced) |
| CRUD endpoints         | ~15 Express routes           | Direct client-to-database via PostgREST |
| File upload            | Custom chunked upload server | Supabase Storage (resumable)     |
| Password reset         | Custom admin endpoint        | `supabase.auth.admin.updateUserById()` |

What remains as custom server-side code:
- **Image randomization** (PostgreSQL function — runs when participant is created)
- **Protocol ordering validation** (PostgreSQL function — runs on session INSERT)
- **Condition derivation** (PostgreSQL function — computes sleep/wake from order + day)
- **CSV export** (Edge Function — streams large result sets)

### No Express server

The React frontend uses `@supabase/supabase-js` to interact directly with Supabase. There is no Express server to build, deploy, or maintain. Server-side logic lives in PostgreSQL functions (called via `supabase.rpc()`) and Supabase Edge Functions (Deno runtime, for operations that need HTTP streaming).

---

## Project Structure

```
client/                           # React frontend (Vite)
├── src/
│   ├── lib/
│   │   └── supabase.ts          # Supabase client singleton
│   ├── hooks/
│   │   ├── useAuth.ts           # Auth state, login, logout
│   │   ├── useParticipants.ts   # Participant CRUD
│   │   └── ...
│   ├── components/              # As defined in docs/components.md
│   └── ...

supabase/                         # Supabase project config
├── migrations/                   # SQL migration files (sequential)
│   ├── 001_create_tables.sql    # Schema from database-schema.md
│   ├── 002_rls_policies.sql     # Row Level Security policies
│   ├── 003_functions.sql        # Randomization, validation, derivation
│   └── 004_seed_images.sql      # 320 image records
├── functions/                    # Edge Functions (Deno)
│   └── export-csv/
│       └── index.ts             # CSV export with streaming
└── config.toml                   # Supabase project settings
```

---

## Authentication

### How it works

Supabase Auth provides email/password authentication out of the box. It handles password hashing (bcrypt), JWT generation, token refresh, and session management. We write zero auth logic.

### How users are created

There is **no self-registration**. An admin creates accounts via the Lab Management page (screen 3.4). The admin client uses the Supabase service role key to create users:

```
Admin creates user → supabase.auth.admin.createUser({
    email, password,
    user_metadata: { lab_id, role }
})
→ Supabase hashes password, creates auth.users row
→ Database trigger copies lab_id and role to our public.users table
```

The `users` table in our schema mirrors the relevant fields from Supabase's `auth.users` for use in RLS policies and application queries:

```sql
CREATE TABLE public.users (
    id          UUID PRIMARY KEY REFERENCES auth.users(id),
    lab_id      INTEGER REFERENCES labs(id),
    email       TEXT UNIQUE NOT NULL,
    role        user_role NOT NULL DEFAULT 'lab_user',
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Trigger to sync from auth.users on creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, lab_id, role)
    VALUES (
        NEW.id,
        NEW.email,
        (NEW.raw_user_meta_data->>'lab_id')::INTEGER,
        (NEW.raw_user_meta_data->>'role')::user_role
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Login flow

```
┌─────────────┐     supabase.auth.signInWithPassword()     ┌──────────────┐
│  LoginForm   │  ──────────────────────────────────────▶   │  Supabase    │
│  (React)     │     { email, password }                    │  Auth        │
│              │                                            │              │
│              │  ◀──────────────────────────────────────   │  1. Verify   │
│  Session     │   { session: { access_token, refresh_token,│     bcrypt   │
│  stored      │     user: { id, email, user_metadata } } } │  2. Sign JWT │
│  automatically│                                           │  3. Return   │
└─────────────┘                                             └──────────────┘
```

1. User submits email + password on the login page.
2. Client calls `supabase.auth.signInWithPassword({ email, password })`.
3. Supabase verifies credentials, returns a session with access + refresh tokens.
4. The Supabase client library **automatically** stores the session and handles token refresh.
5. Client reads `user.user_metadata.role` to determine redirect destination:
   - `lab_user` → lab dashboard
   - `admin` → admin dashboard

### Token management

The Supabase client library handles all token lifecycle automatically:

| Concern            | How Supabase handles it                                     |
|--------------------|-------------------------------------------------------------|
| Token storage      | `localStorage` by default (configurable). Supabase's tokens are safe here because all data access is gated by RLS, not just the token. |
| Token refresh      | Automatic — the client refreshes before expiration.         |
| Session persistence| Survives page refresh (tokens in localStorage).             |
| Logout             | `supabase.auth.signOut()` — clears tokens.                  |

**Why localStorage is OK here (unlike the original design):** In the original Express architecture, the access token was the sole gate to data access, so storing it in localStorage was risky (XSS could steal it and access data directly). With Supabase, **RLS policies** are the real security boundary — even a stolen token can only access data that the user's RLS policies allow. The token is a key, but the lock is in the database.

### Password reset

Admins reset passwords for lab users via the Lab Management page:

```js
// Admin client (uses service role key, bypasses RLS)
await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: newPassword
});
```

There is no self-service password reset. This is a controlled lab environment.

### Auth state in React

```js
// useAuth hook (simplified)
const { data: { session } } = await supabase.auth.getSession();
const user = session?.user;
const labId = user?.user_metadata?.lab_id;
const role = user?.user_metadata?.role;

// Listen for auth state changes (login, logout, token refresh)
supabase.auth.onAuthStateChange((event, session) => {
    // Update React state
});
```

---

## Authorization via Row Level Security (RLS)

### Why RLS?

In the original design, lab isolation was enforced by Express middleware adding `WHERE lab_id = ?` to every query. This is fragile — one missed filter in one route handler exposes another lab's data.

With RLS, the database itself enforces access rules. Even if application code has a bug, the database will not return unauthorized data. This is the single biggest security improvement from using Supabase.

### RLS policy design

Every table that contains lab-scoped data has RLS enabled. The policies use the JWT claims (extracted via `auth.jwt()`) to determine what the user can access.

**Helper function — get current user's lab_id:**

```sql
CREATE OR REPLACE FUNCTION public.current_user_lab_id()
RETURNS INTEGER AS $$
    SELECT (auth.jwt()->'user_metadata'->>'lab_id')::INTEGER;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
    SELECT auth.jwt()->'user_metadata'->>'role';
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

**Participants table — lab users see only their lab:**

```sql
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

-- Lab users: can read/write participants in their own lab
CREATE POLICY participants_lab_user ON participants
    FOR ALL
    USING (
        current_user_role() = 'admin'
        OR lab_id = current_user_lab_id()
    )
    WITH CHECK (
        lab_id = current_user_lab_id()
    );
```

**Sessions table — scoped through participant's lab:**

```sql
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY sessions_lab_user ON sessions
    FOR ALL
    USING (
        current_user_role() = 'admin'
        OR participant_id IN (
            SELECT id FROM participants WHERE lab_id = current_user_lab_id()
        )
    )
    WITH CHECK (
        participant_id IN (
            SELECT id FROM participants WHERE lab_id = current_user_lab_id()
        )
    );
```

**Trials table — scoped through session → participant → lab:**

```sql
ALTER TABLE trials ENABLE ROW LEVEL SECURITY;

CREATE POLICY trials_lab_user ON trials
    FOR SELECT
    USING (
        current_user_role() = 'admin'
        OR session_id IN (
            SELECT s.id FROM sessions s
            JOIN participants p ON p.id = s.participant_id
            WHERE p.lab_id = current_user_lab_id()
        )
    );

-- INSERT only (trials are immutable — no UPDATE/DELETE policy)
CREATE POLICY trials_insert ON trials
    FOR INSERT
    WITH CHECK (
        session_id IN (
            SELECT s.id FROM sessions s
            JOIN participants p ON p.id = s.participant_id
            WHERE p.lab_id = current_user_lab_id()
        )
    );
```

**Same pattern for:** `sleep_data`, `file_uploads`, `questionnaire_responses`, `participant_image_assignments`.

**Admin-only tables:**

```sql
ALTER TABLE labs ENABLE ROW LEVEL SECURITY;

-- Labs: everyone can read, only admins can write
CREATE POLICY labs_read ON labs FOR SELECT USING (true);
CREATE POLICY labs_admin_write ON labs FOR INSERT
    WITH CHECK (current_user_role() = 'admin');

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users: admins can read all, lab users can read only themselves
CREATE POLICY users_read ON users FOR SELECT
    USING (
        current_user_role() = 'admin'
        OR id = auth.uid()
    );
```

### RLS summary matrix

| Table                          | lab_user (own lab) | lab_user (other lab) | admin     |
|--------------------------------|--------------------|----------------------|-----------|
| `participants`                 | read/write         | invisible            | read/write|
| `sessions`                     | read/write         | invisible            | read      |
| `trials`                       | read/insert        | invisible            | read      |
| `participant_image_assignments`| read               | invisible            | read      |
| `sleep_data`                   | read/write         | invisible            | read      |
| `file_uploads`                 | read/insert        | invisible            | read      |
| `questionnaire_responses`      | read/write         | invisible            | read      |
| `labs`                         | read               | read                 | read/write|
| `users`                        | read self only     | invisible            | read/write|
| `images`                       | read               | read                 | read      |

---

## Data Access from the Frontend

With RLS in place, the React frontend calls Supabase directly. No Express middleware needed.

### Examples

**List participants (lab user sees only their own lab automatically):**
```js
const { data, error } = await supabase
    .from('participants')
    .select('*, sessions(id, session_type, completed_at)')
    .order('created_at', { ascending: false });
// RLS automatically filters to current user's lab
```

**Create participant (triggers randomization via database function):**
```js
const { data, error } = await supabase.rpc('create_participant', {
    p_lab_id: labId,
    p_code: participantCode,
    p_condition_order: conditionOrder,
    p_age: age,
    p_gender: gender,
    p_language: language
});
// The PostgreSQL function inserts the participant AND generates
// all 320 image assignments in a single transaction
```

**Create session (with protocol validation and condition derivation):**
```js
const { data, error } = await supabase.rpc('create_session', {
    p_session_id: crypto.randomUUID(),  // client-generated UUID
    p_participant_id: participantId,
    p_lab_day: labDay,
    p_session_type: sessionType
});
// The PostgreSQL function:
// 1. Derives condition from participant.condition_order + lab_day
// 2. Validates protocol ordering (encoding → test1 → test2)
// 3. Inserts the session row
// Returns error if ordering violated
```

**Sync trials after session (batch insert):**
```js
const { error } = await supabase
    .from('trials')
    .upsert(trialBatch, {
        onConflict: 'session_id,trial_number',
        ignoreDuplicates: true
    });
// Idempotent: duplicates are silently skipped
```

**Get image assignments (for experiment runner):**
```js
const { data } = await supabase
    .from('participant_image_assignments')
    .select('*, images(filename, emotion)')
    .eq('participant_id', participantId)
    .eq('lab_day', labDay)
    .order('presentation_position');
```

---

## Server-Side Logic (PostgreSQL Functions)

These operations require server-side logic and run as PostgreSQL functions, called via `supabase.rpc()`.

### 1. Participant creation + image randomization

```sql
CREATE OR REPLACE FUNCTION create_participant(
    p_lab_id INTEGER,
    p_code TEXT,
    p_condition_order INTEGER,
    p_age INTEGER,
    p_gender TEXT,
    p_language TEXT
) RETURNS participants AS $$
DECLARE
    new_participant participants;
BEGIN
    -- Insert participant
    INSERT INTO participants (lab_id, participant_code, condition_order, age, gender, language)
    VALUES (p_lab_id, p_code, p_condition_order, p_age, p_gender, p_language)
    RETURNING * INTO new_participant;

    -- Generate image assignments (320 rows)
    -- Algorithm: shuffle all 320 images, split into day 1 / day 2 sets,
    -- assign roles (encoding targets, test foils), assign presentation positions
    PERFORM generate_image_assignments(new_participant.id);

    RETURN new_participant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 2. Session creation with validation

```sql
CREATE OR REPLACE FUNCTION create_session(
    p_session_id UUID,
    p_participant_id INTEGER,
    p_lab_day INTEGER,
    p_session_type session_type
) RETURNS sessions AS $$
DECLARE
    v_condition condition_type;
    v_order INTEGER;
    new_session sessions;
BEGIN
    -- Get participant's condition order
    SELECT condition_order INTO v_order
    FROM participants WHERE id = p_participant_id;

    -- Derive condition: order 0 = Sleep first, order 1 = Wake first
    IF (v_order = 0 AND p_lab_day = 1) OR (v_order = 1 AND p_lab_day = 2) THEN
        v_condition := 'sleep';
    ELSE
        v_condition := 'wake';
    END IF;

    -- Validate protocol ordering
    IF p_session_type = 'test1' THEN
        IF NOT EXISTS (
            SELECT 1 FROM sessions
            WHERE participant_id = p_participant_id
              AND lab_day = p_lab_day
              AND session_type = 'encoding'
              AND completed_at IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'Encoding must be completed before test1';
        END IF;
    END IF;

    IF p_session_type = 'test2' THEN
        IF NOT EXISTS (
            SELECT 1 FROM sessions
            WHERE participant_id = p_participant_id
              AND lab_day = p_lab_day
              AND session_type = 'test1'
              AND completed_at IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'Test1 must be completed before test2';
        END IF;
    END IF;

    -- Insert session
    INSERT INTO sessions (id, participant_id, lab_day, session_type, condition, started_at)
    VALUES (p_session_id, p_participant_id, p_lab_day, p_session_type, v_condition, now())
    ON CONFLICT (id) DO NOTHING
    RETURNING * INTO new_session;

    RETURN new_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3. CSV export (Edge Function)

The export query is complex (6-table join + sleep data) and the result can be large. This runs as a Supabase Edge Function that streams CSV rows:

```
supabase/functions/export-csv/index.ts

- Receives: lab_id (optional), condition filter, session_type filter
- Authenticates via the request's JWT (Supabase passes it automatically)
- Checks role (admin for cross-lab, lab_user for own lab only)
- Runs the export query from database-schema.md
- Streams results as CSV with appropriate Content-Disposition header
```

The frontend calls this via:
```js
const response = await supabase.functions.invoke('export-csv', {
    body: { labId, condition, sessionType }
});
```

---

## File Storage (EDF Uploads)

Supabase Storage handles file uploads, including large files (up to 5 GB with resumable uploads).

### Bucket setup

```sql
-- Create a storage bucket for EDF files
INSERT INTO storage.buckets (id, name, public)
VALUES ('edf-files', 'edf-files', false);
```

### Storage policies (lab isolation)

```sql
-- Lab users can upload to their own lab's folder
CREATE POLICY edf_upload ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'edf-files'
        AND (storage.foldername(name))[1] = current_user_lab_id()::TEXT
    );

-- Lab users can read their own lab's files; admins can read all
CREATE POLICY edf_read ON storage.objects FOR SELECT
    USING (
        bucket_id = 'edf-files'
        AND (
            current_user_role() = 'admin'
            OR (storage.foldername(name))[1] = current_user_lab_id()::TEXT
        )
    );
```

### Upload flow

Files are organized as `{lab_id}/{participant_id}/day{lab_day}/{filename}`:

```js
const filePath = `${labId}/${participantId}/day${labDay}/${file.name}`;
const { data, error } = await supabase.storage
    .from('edf-files')
    .upload(filePath, file, {
        // Resumable upload for large files (up to 2 GB)
        // Supabase uses the TUS protocol for resumable uploads
    });
```

The `file_uploads` table row is created separately to track metadata:
```js
await supabase.from('file_uploads').insert({
    participant_id: participantId,
    lab_day: labDay,
    file_type: 'edf',
    original_name: file.name,
    storage_path: filePath,
    uploaded_by: user.id
});
```

---

## Image Serving & Caching

The 320 experiment images are stored in a **public** Supabase Storage bucket (they are not sensitive — they come from published image databases).

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('experiment-images', 'experiment-images', true);
```

### Service Worker strategy

```
1. On first dashboard load, Service Worker registers
2. SW fetches image list from Supabase: supabase.from('images').select('filename')
3. SW pre-caches each image from the public bucket URL
4. Dashboard shows progress via ImageCacheStatus component
5. During experiment: all image requests hit the SW cache (zero network)
```

Public bucket URLs are stable and cacheable:
```
https://<project>.supabase.co/storage/v1/object/public/experiment-images/EM1181.jpg
```

---

## Offline Sync Protocol

The offline sync design from `docs/experiment-runtime.md` remains unchanged. The key difference is that sync uses `@supabase/supabase-js` instead of raw `fetch` calls:

### Sync flow

```
Session launch (online or offline):
1. Client generates UUID for session
2. Client writes session config to IndexedDB
3. Client calls supabase.rpc('create_session', ...) — queued if offline

During experiment (no network):
4. Each trial writes to IndexedDB immediately on completion

Session complete:
5. Client calls supabase.from('trials').upsert(trialBatch, ...)
6. Client calls supabase.from('sessions').update({ completed_at, timing_metadata })
7. On success: clear pendingSync entries from IndexedDB
8. On failure: leave in pendingSync, retry with exponential backoff
```

### Idempotency guarantees

Same as before — `ON CONFLICT DO NOTHING` for session creation and trial inserts. The database is the source of truth.

### Offline session token concern

The Supabase auth token may expire during a long session (encoding + delay + test = several hours). The experiment runner must:
1. **Cache the auth token before going offline** — store it alongside the session data in IndexedDB
2. **Refresh the token after the session** — call `supabase.auth.refreshSession()` before syncing
3. **If refresh fails** (token expired beyond recovery) — data stays in IndexedDB and syncs when the user logs in again. The pending sync queue handles this gracefully.

---

## Environment Configuration

```bash
# .env (not committed to git)
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>

# Only used by admin scripts / Edge Functions (never exposed to the browser)
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

The Supabase anon key is safe to expose in the frontend — it is a **public** key. All security comes from RLS policies, not from the key.

### Experiment timing configuration

Timing parameters are stored in a `config` table:

```sql
CREATE TABLE config (
    key   TEXT PRIMARY KEY,
    value JSONB NOT NULL
);

INSERT INTO config (key, value) VALUES ('timing', '{
    "fixationVisible": 2750,
    "fixationBlank": 250,
    "imageDisplay": 750,
    "memoryTimeout": 3000,
    "postMemoryGap": 1000,
    "ratingTimeout": 4000,
    "interRatingGap": 1000,
    "pauseDuration": 60000,
    "pauseTrialIndex": 40
}');
```

The frontend fetches this once at session start:
```js
const { data } = await supabase.from('config').select('value').eq('key', 'timing').single();
```

This allows changing timing without redeploying anything.

---

## Supabase Client Setup

```js
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

For admin operations (user creation, password reset), an admin client uses the service role key. This client is only used in the admin pages and the service role key is **never** exposed in the browser bundle — it is passed through an Edge Function:

```
supabase/functions/admin-actions/index.ts

- Called by admin pages via supabase.functions.invoke('admin-actions', ...)
- Creates the Supabase admin client server-side using SUPABASE_SERVICE_ROLE_KEY
- Handles: createUser, resetPassword, createLab
- Verifies the caller is an admin before executing
```

---

## What This Document Does Not Cover

- **Deployment** — Supabase handles database and auth hosting; frontend needs static hosting (Vercel, Netlify, or Supabase's own hosting)
- **Monitoring/logging** — Supabase provides built-in dashboard, logs, and metrics
- **Testing strategy** — to be documented separately
- **Rate limiting** — Supabase has built-in rate limiting on auth endpoints; not needed for data endpoints in a controlled lab environment
- **Database backups** — Supabase provides automatic daily backups on paid plans
