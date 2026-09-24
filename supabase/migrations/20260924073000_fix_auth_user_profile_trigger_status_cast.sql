-- Fix Supabase Auth signup trigger: explicitly cast enum values used by profiles.status.
-- This prevents: column "status" is of type account_status but expression is of type text.

create or replace function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role public.user_role;
  requested_name text;
  requested_status public.account_status;
begin
  requested_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(coalesce(new.email, ''), '@', 1),
    'User'
  );

  requested_role := case
    when new.raw_user_meta_data->>'role' in ('patient','consultant','pharmacy','admin')
      then (new.raw_user_meta_data->>'role')::public.user_role
    else 'patient'::public.user_role
  end;

  requested_status := case
    when requested_role = 'patient'::public.user_role then 'active'::public.account_status
    else 'pending'::public.account_status
  end;

  insert into public.profiles(id, full_name, role, status)
  values(new.id, requested_name, requested_role, requested_status);

  if requested_role = 'patient'::public.user_role then
    insert into public.patient_profiles(user_id) values(new.id);
  elsif requested_role = 'consultant'::public.user_role then
    insert into public.consultant_profiles(user_id, specialty)
    values(new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'specialty'), ''), 'General Medicine'));
  elsif requested_role = 'pharmacy'::public.user_role then
    insert into public.pharmacy_profiles(user_id, business_name)
    values(new.id, requested_name);
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
