-- HealthSync QA account preparation
-- DEVELOPMENT / STAGING ONLY.
-- Create the three Auth users first from Supabase Dashboard with Auto Confirm enabled.
-- Then run this script in the SQL editor.
-- It never creates passwords or changes auth.users credentials.

do $$
declare
  patient_id uuid;
  consultant_id uuid;
  pharmacy_id uuid;
begin
  select id into patient_id from auth.users
    where lower(email) = lower('healthsync.patient.qa@gmail.com')
    limit 1;

  select id into consultant_id from auth.users
    where lower(email) = lower('healthsync.consultant.qa@gmail.com')
    limit 1;

  select id into pharmacy_id from auth.users
    where lower(email) = lower('healthsync.pharmacy.qa@gmail.com')
    limit 1;

  if patient_id is null or consultant_id is null or pharmacy_id is null then
    raise exception 'Create all three QA Auth users first: patient, consultant, pharmacy';
  end if;

  update public.profiles
  set role = 'patient'::public.user_role,
      status = 'active'::public.account_status
  where id = patient_id;

  insert into public.patient_profiles (user_id)
  values (patient_id)
  on conflict (user_id) do nothing;

  update public.profiles
  set role = 'consultant'::public.user_role,
      status = 'active'::public.account_status
  where id = consultant_id;

  insert into public.consultant_profiles
    (user_id, specialty, verification_status, is_available, service_radius_km, location)
  values
    (consultant_id, 'General Medicine', 'active'::public.account_status, true, 50,
     ST_SetSRID(ST_MakePoint(91.2868, 23.8315), 4326)::geography)
  on conflict (user_id) do update
    set specialty = excluded.specialty,
        verification_status = excluded.verification_status,
        is_available = excluded.is_available,
        service_radius_km = excluded.service_radius_km,
        location = excluded.location;

  update public.profiles
  set role = 'pharmacy'::public.user_role,
      status = 'active'::public.account_status
  where id = pharmacy_id;

  insert into public.pharmacy_profiles
    (user_id, business_name, verification_status)
  values
    (pharmacy_id, 'HealthSync QA Pharmacy', 'active'::public.account_status)
  on conflict (user_id) do update
    set business_name = excluded.business_name,
        verification_status = excluded.verification_status;
end $$;

-- Verification
select
  p.id,
  p.full_name,
  p.role,
  p.status,
  case
    when p.role = 'consultant' then cp.verification_status::text || ' / available=' || cp.is_available::text
    when p.role = 'pharmacy' then pp.verification_status::text
    else 'patient'
  end as qa_state
from public.profiles p
left join public.consultant_profiles cp on cp.user_id = p.id
left join public.pharmacy_profiles pp on pp.user_id = p.id
where p.id in (
  (select id from auth.users where lower(email)=lower('healthsync.patient.qa@gmail.com') limit 1),
  (select id from auth.users where lower(email)=lower('healthsync.consultant.qa@gmail.com') limit 1),
  (select id from auth.users where lower(email)=lower('healthsync.pharmacy.qa@gmail.com') limit 1)
)
order by p.role;
