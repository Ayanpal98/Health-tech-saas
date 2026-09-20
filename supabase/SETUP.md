# HealthSync Supabase setup

## 1. Create the backend
Create a Supabase project and copy the project URL and public anon key.

## 2. Create the database
Open Supabase SQL Editor and run `supabase/schema.sql` from this repository.

The schema creates:
- profiles
- patient_profiles
- consultant_profiles
- pharmacy_profiles
- specialties
- consultation_requests
- consultation_assignments
- pharmacy_requests
- notifications
- audit_logs

It also enables Row Level Security and prepares Realtime for request/assignment/notification events.

## 3. Configure email authentication
Enable Email authentication under Supabase Authentication > Providers.

Set the production Site URL and allowed Redirect URLs.

## 4. Frontend secrets
Only expose:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Never put a Supabase service-role key in browser JavaScript.

## 5. Verification
Create one test account for each role:
- patient
- consultant
- pharmacy

Consultants and pharmacies start in pending verification status. Patients start active.

## Current status
This repository is still running the prototype UI/authentication layer. The next implementation step is to connect the patient, consultant and pharmacy portals to this database and remove localStorage authentication from production paths.
