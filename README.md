# Health-tech-saas

HealthSync healthcare coordination prototype.

## Authentication and functional flows

Implemented in the current static prototype:

- Patient / Medical Consultant / Pharmacy role selection
- Sign up and sign in
- Local session and logout
- SHA-256 browser-side password hashing for prototype storage
- Patient consultation request creation
- Specialty-based consultant queue
- Consultant accept / decline workflow
- Consultant availability toggle
- Pharmacy coordination request flow
- Safety boundary: the system coordinates access to licensed professionals; it does not diagnose or prescribe

## Demo credentials

Patient
- Email: patient@healthsync.demo
- Password: Patient@123

Medical Consultant
- Email: doctor@healthsync.demo
- Password: Doctor@123

Pharmacy
- Email: pharmacy@healthsync.demo
- Password: Pharmacy@123

## Important production note

This repository is currently a static HTML prototype. Demo credentials, sessions and request state are stored locally in the browser. Do not enter real patient or medical information into this version.

For production, replace the local authentication layer with a server-side authentication provider such as Supabase Auth, with email verification, secure password reset, role-based authorization, Row Level Security, audit logging and secure server-side storage.

Official documentation:
https://supabase.com/docs/guides/auth
https://supabase.com/docs/guides/database/postgres/row-level-security
