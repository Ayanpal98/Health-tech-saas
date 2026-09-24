# HealthSync QA Test-Account Workflow

This workflow is for development/staging QA only. Do not use real patient data or production credentials.

## Recommended test accounts

Use separate accounts so two browser sessions can test the patient-to-consultant workflow at the same time.

| Role | Test email | Password | Required state |
|---|---|---|---|
| Patient | healthsync.patient.qa@gmail.com | Set in Supabase Auth | Active |
| Consultant | healthsync.consultant.qa@gmail.com | Set in Supabase Auth | Active + verified + available |
| Pharmacy | healthsync.pharmacy.qa@gmail.com | Set in Supabase Auth | Active + verified |

You may replace these addresses with project-owned test mailboxes.

## 1. Create the users without repeatedly sending confirmation emails

Because repeated signup/resend testing can hit the Supabase email rate limit, create the QA users from the Supabase Dashboard:

1. Open the HealthSync Supabase project.
2. Go to Authentication → Users.
3. Create each QA user manually.
4. Use Auto Confirm User for the QA accounts.
5. Do not repeatedly use Resend confirmation during QA.
6. Use a unique password for each account and store it only in your team password manager.

Auto-confirmed QA accounts are for testing only. Keep normal email confirmation enabled for real users.

## 2. Apply role/profile state

After the three Auth users exist, run the QA SQL in:
supabase/qa/prepare_test_accounts.sql

Run it only against the development/staging database.

The script:
- finds the three users by email;
- sets the intended application role;
- activates the accounts;
- creates/updates the role-specific profile;
- makes the consultant verified and available;
- gives the consultant a General Medicine specialty and service radius;
- gives the pharmacy a test business name and service radius;
- adds safe test coordinates so geographic matching can be exercised.

It does not create passwords, expose service-role credentials, or modify auth.users passwords.

## 3. Browser test setup

Use two separate browser sessions:

### Browser A — Patient
Sign in as the Patient QA account.

### Browser B — Consultant
Use a normal/incognito second session and sign in as the Consultant QA account.

### Optional Browser C — Pharmacy
Use a third session for pharmacy workflow testing.

## 4. End-to-end Patient → Consultant test

Run these steps in order:

1. Patient signs in.
2. Consultant signs in.
3. Consultant sets availability to Available.
4. Patient creates a General Medicine request.
5. Patient allows browser location, or uses the configured test location.
6. Confirm the patient sees the request as submitted/matching.
7. Confirm the consultant receives the request/notification.
8. Consultant accepts the request.
9. Confirm the patient sees the consultation as accepted.
10. Open the consultation workspace in both sessions.
11. Patient sends a test message.
12. Confirm the consultant receives it in realtime.
13. Consultant replies.
14. Confirm the patient receives the reply in realtime.
15. Consultant completes the consultation.
16. Confirm the patient sees the completed state.

## 5. Negative tests

Also test:

- Consultant unavailable → request should not be treated as an available consultant match.
- Consultant declines → patient should not see it as accepted.
- Wrong specialty → consultant should not receive an unrelated specialty request.
- Location permission denied → request should remain usable without browser geolocation if the UI supports manual area entry.
- Empty description → validation should prevent an invalid request.
- Sign out → protected dashboard/session should disappear.
- Refresh → authenticated session should persist.
- Second browser → one role must not see another role's private dashboard data.
- Consultant tries to access a patient-only operation → must be rejected server-side.
- Pharmacy must not access consultant/patient private data outside its intended workflow.

## 6. Database verification

After the end-to-end test, verify:

- one Auth user exists per QA account;
- one profile exists per QA account;
- consultant profile is active, verified and available;
- consultation request has the expected patient;
- assignment has the expected consultant;
- notifications were generated for the correct recipient;
- consultation messages belong to the correct consultation;
- completed/cancelled states are consistent.

Do not use client-side UI state as the only proof of authorization. The database/RLS and Edge Function checks must enforce access.

## 7. Reset between test runs

For repeatable QA:

1. Keep the same three accounts.
2. Do not repeatedly recreate them.
3. Create a fresh consultation request for each run.
4. Complete or cancel old requests.
5. Clear only test data when needed.
6. Never delete or alter real production records as part of QA.

## QA pass condition

The core release test passes only when:

Patient signup/login → Consultant login → Consultant available → Patient request → Consultant notification → Accept → Realtime consultation → Realtime chat → Complete

works across two independent browser sessions with the expected database records and access controls.
