-- HealthSync Build 2 database delta
-- Apply after the production foundation schema.
-- This keeps consultant request visibility restricted to assigned requests.

drop policy if exists "consultant reads assigned requests" on public.consultation_requests;
create policy "consultant reads assigned requests"
on public.consultation_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.consultation_assignments ca
    where ca.request_id = consultation_requests.id
      and ca.consultant_id = (select auth.uid())
  )
);

drop policy if exists "patient reads assigned consultation" on public.consultation_assignments;
create policy "patient reads assigned consultation"
on public.consultation_assignments
for select
to authenticated
using (
  exists (
    select 1
    from public.consultation_requests cr
    where cr.id = consultation_assignments.request_id
      and cr.patient_id = (select auth.uid())
  )
);

drop policy if exists "admin manages assignments" on public.consultation_assignments;
create policy "admin manages assignments"
on public.consultation_assignments
for all
to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

drop policy if exists "admin manages consultant profiles" on public.consultant_profiles;
create policy "admin manages consultant profiles"
on public.consultant_profiles
for update
to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

drop policy if exists "admin manages pharmacy profiles" on public.pharmacy_profiles;
create policy "admin manages pharmacy profiles"
on public.pharmacy_profiles
for update
to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

alter function public.set_updated_at() set search_path = public;

revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.current_role() from anon;
grant execute on function public.current_role() to authenticated;

drop policy if exists "profiles own update" on public.profiles;
create policy "profiles own update"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (
  id = (select auth.uid())
  and role = (select role from public.profiles where id = (select auth.uid()))
  and status = (select status from public.profiles where id = (select auth.uid()))
);

drop policy if exists "consultant profile own update" on public.consultant_profiles;
create policy "consultant profile own update"
on public.consultant_profiles
for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and verification_status = (
    select verification_status
    from public.consultant_profiles cp
    where cp.user_id = (select auth.uid())
  )
);

create index if not exists consultation_assignments_consultant_status_idx
on public.consultation_assignments(consultant_id, status, created_at desc);

create index if not exists consultation_requests_specialty_status_idx
on public.consultation_requests(specialty_id, status, created_at desc);
