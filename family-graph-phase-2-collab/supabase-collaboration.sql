-- Optional Phase 2 collaboration tables for Family Graph.
-- Run in Supabase SQL editor if you want shared comments/suggestions/bugs.
-- The app also works without these tables using browser localStorage as a fallback.

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  author_id uuid,
  author_name text,
  photo_id uuid,
  person_id uuid,
  face_id uuid,
  body text not null,
  status text default 'open'
);

create table if not exists public.suggestions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  author_id uuid,
  author_name text,
  type text not null default 'general',
  photo_id uuid,
  person_id uuid,
  face_id uuid,
  suggested_value text,
  body text,
  status text default 'open',
  reviewed_by text,
  reviewed_at timestamptz
);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  author_id uuid,
  author_name text,
  kind text default 'request',
  title text not null,
  body text,
  status text default 'open'
);

alter table public.comments enable row level security;
alter table public.suggestions enable row level security;
alter table public.feedback enable row level security;

create policy if not exists "signed in can read comments" on public.comments for select to authenticated using (true);
create policy if not exists "signed in can add comments" on public.comments for insert to authenticated with check (true);
create policy if not exists "signed in can read suggestions" on public.suggestions for select to authenticated using (true);
create policy if not exists "signed in can add suggestions" on public.suggestions for insert to authenticated with check (true);
create policy if not exists "signed in can update suggestions" on public.suggestions for update to authenticated using (true);
create policy if not exists "signed in can read feedback" on public.feedback for select to authenticated using (true);
create policy if not exists "signed in can add feedback" on public.feedback for insert to authenticated with check (true);
create policy if not exists "signed in can update feedback" on public.feedback for update to authenticated using (true);
