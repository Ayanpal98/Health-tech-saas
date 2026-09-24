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


## Build 1 — connect the deployed frontend

1. In Supabase, open **Project Settings → API**.
2. Copy the **Project URL** and **Publishable/anon key**.
3. Put them into `supabase-config.js`:
   - `url`: your Supabase Project URL
   - `anonKey`: your browser-safe publishable/anon key
4. Commit and push `supabase-config.js` to the branch connected to Vercel.
5. In **Authentication → Providers**, enable **Email**.
6. During testing you may disable email confirmation. For a real deployment, keep email confirmation enabled and configure your SMTP provider.
7. In **Authentication → URL Configuration**, add your Vercel URL as the Site URL and redirect URL.
8. Run `supabase/schema.sql` in the Supabase SQL Editor before testing signup.
9. Open the Vercel site and use **Get started**.
10. Create a Patient, Medical Consultant, or Pharmacy account. The selected role is stored in the user's auth metadata and the database trigger creates the corresponding `profiles` row.

### What Build 1 now provides

- Supabase email/password signup and sign-in.
- Persistent Supabase sessions.
- Role selection at signup: patient, consultant, pharmacy.
- Automatic profile creation through the SQL trigger.
- A role-aware dashboard after login.
- Sign-out.
- No passwords stored in localStorage.
- No service-role key in browser code.

### Important

`supabase-config.js` contains only the browser-safe Supabase URL and anon/publishable key. Never place a Supabase service-role/secret key in the frontend.

The dashboard is intentionally a Build 1 foundation. It does not yet expose clinical records, diagnosis, prescribing, or emergency treatment. Build 2 will connect patient consultation requests to the database and provider workflow.
