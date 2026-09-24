# HealthSync Supabase setup

## Backend

HealthSync uses Supabase Auth, PostgreSQL, Row Level Security, PostGIS and Realtime.

Project:
- Supabase project: Health-tech-saas
- Frontend uses the browser-safe publishable key only.
- Secret/service-role credentials stay inside backend Edge Functions.

## Build 1

Build 1 provides:
- Supabase email/password signup and sign-in.
- Persistent Supabase sessions.
- Patient, consultant and pharmacy roles.
- Automatic profile creation through the Auth trigger.
- Role-aware dashboard.
- Sign-out.
- No password storage in localStorage.
- No secret key in browser code.

## Build 2 — Patient → Consultant workflow

Build 2 now provides a real database-backed care request flow:

1. Patient signs in.
2. Patient opens Request care.
3. Patient selects specialty and urgency.
4. Patient enters a care concern.
5. Patient can provide city/district/state.
6. Browser location permission can optionally provide coordinates for matching.
7. HealthSync sends the authenticated request to the healthsync-care Edge Function.
8. The backend creates consultation_requests.
9. The backend finds active, verified, available consultants in the selected specialty.
10. Location is used when available; consultant service radius is respected.
11. Up to three matching consultants receive assignments and notifications.
12. Consultant sees only requests assigned to that consultant.
13. Consultant can accept or decline.
14. Accepting updates the request to accepted and notifies the patient.
15. Patient sees request status and consultant assignment.
16. Supabase Realtime refreshes the relevant dashboard when requests, assignments or notifications change.

## Provider verification

Consultants and pharmacies start in pending status. A consultant should be activated by an administrator after verification before they can receive care requests.

For testing Build 2, create a consultant account and activate its:
- profiles.status = active
- consultant_profiles.verification_status = active
- consultant_profiles.is_available = true

Also make sure the consultant specialty matches one of the active specialties.

## Edge Function

The backend matching/responding endpoint is:
- healthsync-care

It uses authenticated-user authorization and keeps elevated backend credentials out of the browser.

## Build 2 database delta

The Build 2 security/request policy changes are documented in:
- supabase/build-2-care-workflow.sql

The production database has already received these changes.

## Safety boundary

HealthSync is a healthcare coordination platform. It does not autonomously diagnose conditions, prescribe treatment, or replace emergency services.

If a medical emergency is suspected, users should contact local emergency services or go to the nearest emergency department.

## Frontend configuration

supabase-config.js contains only:
- Supabase project URL
- Publishable browser key

Never place a Supabase secret/service-role key in frontend JavaScript.

## Next build

Build 3 should extend the accepted consultation into a secure real-time communication workspace and notification center, while preserving the current patient/consultant access controls.
