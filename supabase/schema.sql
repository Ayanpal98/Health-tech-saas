-- HealthSync Production Foundation
-- Run this in Supabase SQL Editor after creating a Supabase project.
-- This schema intentionally stores coordination/profile data only.
-- Do not add autonomous diagnosis or prescription logic.

create extension if not exists pgcrypto;
create extension if not exists postgis;

create type public.user_role as enum ('patient','consultant','pharmacy','admin');
create type public.account_status as enum ('pending','active','suspended','rejected');
create type public.request_status as enum ('pending','accepted','declined','cancelled','completed');
create type public.urgency_level as enum ('routine','priority','urgent');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'patient',
  phone text,
  avatar_url text,
  city text,
  district text,
  state text,
  country text default 'India',
  latitude double precision,
  longitude double precision,
  location geography(point,4326),
  status public.account_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patient_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  emergency_contact_name text,
  emergency_contact_phone text,
  preferred_language text,
  consent_to_contact boolean not null default false
);

create table public.consultant_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  specialty text not null,
  qualification text,
  registration_number text,
  registration_authority text,
  bio text,
  service_radius_km numeric(6,2) not null default 25,
  is_available boolean not null default false,
  verification_status public.account_status not null default 'pending'
);

create table public.pharmacy_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  business_name text not null,
  license_number text,
  address text,
  operating_hours jsonb not null default '{}'::jsonb,
  is_open boolean not null default false,
  verification_status public.account_status not null default 'pending'
);

create table public.specialties (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.consultation_requests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id),
  specialty_id uuid references public.specialties(id),
  description text not null,
  location geography(point,4326),
  city text,
  district text,
  state text,
  urgency public.urgency_level not null default 'routine',
  status public.request_status not null default 'pending',
  communication_preference text default 'secure_chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.consultation_assignments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.consultation_requests(id) on delete cascade,
  consultant_id uuid not null references public.profiles(id),
  status public.request_status not null default 'pending',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique(request_id, consultant_id)
);

create table public.pharmacy_requests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id),
  pharmacy_id uuid references public.profiles(id),
  description text not null,
  location geography(point,4326),
  city text,
  district text,
  state text,
  status public.request_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index consultation_requests_patient_idx on public.consultation_requests(patient_id);
create index consultation_requests_status_idx on public.consultation_requests(status);
create index consultation_requests_location_idx on public.consultation_requests using gist(location);
create index consultant_profiles_available_idx on public.consultant_profiles(is_available, verification_status);
create index pharmacy_requests_patient_idx on public.pharmacy_requests(patient_id);
create index notifications_user_idx on public.notifications(user_id, read_at, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger consultation_requests_updated_at before update on public.consultation_requests for each row execute function public.set_updated_at();
create trigger pharmacy_requests_updated_at before update on public.pharmacy_requests for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requested_role public.user_role;
  requested_name text;
begin
  requested_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1));
  requested_role := case
    when new.raw_user_meta_data->>'role' in ('patient','consultant','pharmacy','admin')
    then (new.raw_user_meta_data->>'role')::public.user_role
    else 'patient'
  end;

  insert into public.profiles(id, full_name, role, status)
  values(new.id, requested_name, requested_role,
    case when requested_role = 'patient' then 'active' else 'pending' end);

  if requested_role = 'patient' then
    insert into public.patient_profiles(user_id) values(new.id);
  elsif requested_role = 'consultant' then
    insert into public.consultant_profiles(user_id, specialty)
    values(new.id, coalesce(new.raw_user_meta_data->>'specialty','General Medicine'));
  elsif requested_role = 'pharmacy' then
    insert into public.pharmacy_profiles(user_id, business_name)
    values(new.id, requested_name);
  end if;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.patient_profiles enable row level security;
alter table public.consultant_profiles enable row level security;
alter table public.pharmacy_profiles enable row level security;
alter table public.specialties enable row level security;
alter table public.consultation_requests enable row level security;
alter table public.consultation_assignments enable row level security;
alter table public.pharmacy_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.current_role()
returns public.user_role language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create policy "profiles own read" on public.profiles for select using (id = auth.uid() or public.current_role() = 'admin');
create policy "profiles own update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "patient profile own access" on public.patient_profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "consultant profile public read" on public.consultant_profiles for select using (verification_status = 'active' or user_id = auth.uid() or public.current_role() = 'admin');
create policy "consultant profile own update" on public.consultant_profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "pharmacy profile public read" on public.pharmacy_profiles for select using (verification_status = 'active' or user_id = auth.uid() or public.current_role() = 'admin');
create policy "pharmacy profile own update" on public.pharmacy_profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "specialties readable" on public.specialties for select using (active = true or public.current_role() = 'admin');

create policy "patient creates own request" on public.consultation_requests for insert
with check (patient_id = auth.uid() and public.current_role() = 'patient');
create policy "patient reads own requests" on public.consultation_requests for select
using (patient_id = auth.uid() or public.current_role() = 'admin');
create policy "admin manages requests" on public.consultation_requests for all
using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

create policy "consultant sees assigned requests" on public.consultation_assignments for select
using (consultant_id = auth.uid() or public.current_role() = 'admin');
create policy "consultant responds to assignment" on public.consultation_assignments for update
using (consultant_id = auth.uid()) with check (consultant_id = auth.uid());

create policy "patient creates pharmacy request" on public.pharmacy_requests for insert
with check (patient_id = auth.uid() and public.current_role() = 'patient');
create policy "patient reads pharmacy request" on public.pharmacy_requests for select
using (patient_id = auth.uid() or pharmacy_id = auth.uid() or public.current_role() = 'admin');

create policy "notification own access" on public.notifications for select
using (user_id = auth.uid());
create policy "notification own update" on public.notifications for update
using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "audit admin read" on public.audit_logs for select using (public.current_role() = 'admin');

insert into public.specialties(name) values
('General Medicine'),('Cardiology'),('Dermatology'),('Pediatrics'),('Gynecology'),('Orthopedics')
on conflict (name) do nothing;

-- Enable realtime for event-driven portal updates.
alter publication supabase_realtime add table public.consultation_requests;
alter publication supabase_realtime add table public.consultation_assignments;
alter publication supabase_realtime add table public.notifications;
