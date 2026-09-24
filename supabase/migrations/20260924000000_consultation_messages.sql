-- HealthSync Build 3: secure consultation messages
create table if not exists public.consultation_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.consultation_requests(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists consultation_messages_request_created_idx
  on public.consultation_messages(request_id, created_at);

alter table public.consultation_messages enable row level security;

drop policy if exists "participants can read consultation messages" on public.consultation_messages;
create policy "participants can read consultation messages"
on public.consultation_messages for select to authenticated
using (
  sender_id = (select auth.uid())
  or exists (select 1 from public.consultation_requests r where r.id = consultation_messages.request_id and r.patient_id = (select auth.uid()))
  or exists (select 1 from public.consultation_assignments a where a.request_id = consultation_messages.request_id and a.consultant_id = (select auth.uid()) and a.status = 'accepted')
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
);

drop policy if exists "participants can send consultation messages" on public.consultation_messages;
create policy "participants can send consultation messages"
on public.consultation_messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and (
    exists (select 1 from public.consultation_requests r where r.id = consultation_messages.request_id and r.patient_id = (select auth.uid()) and r.status = 'accepted')
    or exists (select 1 from public.consultation_assignments a where a.request_id = consultation_messages.request_id and a.consultant_id = (select auth.uid()) and a.status = 'accepted')
  )
);

alter publication supabase_realtime add table public.consultation_messages;
