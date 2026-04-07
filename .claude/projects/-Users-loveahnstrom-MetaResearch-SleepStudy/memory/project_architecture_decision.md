---
name: Architecture switch from Supabase to self-hosted
description: Switched from Supabase Cloud to self-hosted PostgreSQL on university servers for GDPR compliance. Questionnaire data out of scope. Sleep data to S3.
type: project
---

**Decision date:** 2026-03-29

Switched from Supabase Cloud to self-hosted PostgreSQL on university-provisioned servers because:
- Experiment data is health-adjacent (sleep EEG, depression/anxiety questionnaires)
- GDPR applies (EU-funded MSCA fellowship at KI)
- KI likely requires data on university-approved infrastructure

New architecture:
- **Database**: Plain PostgreSQL on university servers
- **Backend**: Node.js server (Express/Fastify) handling auth, API, authorization
- **Sleep data**: Uploaded to S3 bucket
- **Questionnaire data**: Handled outside the platform — labs send via secure channel
- **Frontend**: React (Vite) — unchanged

Impact on existing work:
- Supabase client library (`@supabase/supabase-js`) to be removed
- RLS policies need to become application-level middleware authorization
- Supabase Auth replaced with server-side auth (sessions or JWT)
- Database migration SQL (tables, triggers, functions) largely reusable
- Edge Functions scope eliminated
