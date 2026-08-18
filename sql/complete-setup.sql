-- ============================================================
-- Family Graph — Complete database setup
-- Run this ONCE, in full, on a brand-new Supabase project's SQL Editor.
-- Sets up every table, column, and permission the app needs from scratch.
--
-- If run against an EXISTING (already-set-up) database, some lines may
-- error with "already exists" — that's harmless, just means that piece
-- was already there. Safe to run the whole file regardless.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Core tables ----------

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  given_names text,
  family_name text,
  birth_date date,
  death_date date,
  living boolean default true,
  notes text,
  preferred_face_id uuid,
  invite_email text,
  avatar_path text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  title text,
  taken_date date,
  location text,
  storage_path text not null,
  original_filename text,
  mime_type text,
  width integer,
  height integer,
  private boolean default false,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists faces (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references photos(id) on delete cascade,
  person_id uuid references people(id) on delete set null,
  x numeric not null,
  y numeric not null,
  w numeric not null,
  h numeric not null,
  label text,
  confidence numeric,
  descriptor jsonb,
  status text default 'manual',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists relationships (
  id uuid primary key default gen_random_uuid(),
  from_person_id uuid not null references people(id) on delete cascade,
  to_person_id uuid not null references people(id) on delete cascade,
  relationship_type text not null check (relationship_type in ('parent','partner','sibling')),
  label text,
  confidence text default 'confirmed',
  source_photo_id uuid references photos(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  constraint no_self_relationship check (from_person_id <> to_person_id)
);

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text default 'contributor',
  person_id uuid references people(id) on delete set null,
  can_invite boolean default false,
  created_at timestamptz default now()
);

-- ---------- Feedback / collaboration tables ----------

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid references photos(id) on delete cascade,
  body text not null,
  author_id uuid references auth.users(id) on delete set null,
  author_name text,
  status text default 'open',
  created_at timestamptz default now()
);

create table if not exists suggestions (
  id uuid primary key default gen_random_uuid(),
  type text,
  photo_id uuid references photos(id) on delete cascade,
  face_id uuid references faces(id) on delete cascade,
  relationship_id uuid references relationships(id) on delete cascade,
  body text,
  suggested_value text,
  author_id uuid references auth.users(id) on delete set null,
  author_name text,
  status text default 'open',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  title text,
  body text,
  kind text default 'request',
  status text default 'open',
  author_name text,
  created_at timestamptz default now()
);

-- ---------- Updated-at helper ----------

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists people_set_updated_at on people;
create trigger people_set_updated_at
before update on people
for each row execute function set_updated_at();

-- Lets a brand-new sign-in check "am I the very first person here" without
-- being able to see anyone else's actual account details (privacy policies
-- below intentionally hide other people's profiles from regular members).
create or replace function is_first_signup()
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists(select 1 from profiles);
$$;
grant execute on function is_first_signup() to authenticated;

-- ---------- Storage bucket ----------

insert into storage.buckets (id, name, public)
values ('family-media', 'family-media', true)
on conflict (id) do nothing;

-- ---------- Row Level Security ----------

alter table people enable row level security;
alter table photos enable row level security;
alter table faces enable row level security;
alter table relationships enable row level security;
alter table profiles enable row level security;
alter table comments enable row level security;
alter table suggestions enable row level security;
alter table feedback enable row level security;

create policy "signed in read people" on people for select to authenticated using (true);
create policy "signed in write people" on people for all to authenticated using (true) with check (true);

create policy "signed in read photos" on photos for select to authenticated using (true);
create policy "signed in write photos" on photos for all to authenticated using (true) with check (true);

create policy "signed in read faces" on faces for select to authenticated using (true);
create policy "signed in write faces" on faces for all to authenticated using (true) with check (true);

create policy "signed in read relationships" on relationships for select to authenticated using (true);
create policy "signed in write relationships" on relationships for all to authenticated using (true) with check (true);

create policy "signed in read comments" on comments for select to authenticated using (true);
create policy "signed in write comments" on comments for all to authenticated using (true) with check (true);

create policy "signed in read suggestions" on suggestions for select to authenticated using (true);
create policy "signed in write suggestions" on suggestions for all to authenticated using (true) with check (true);

create policy "signed in read feedback" on feedback for select to authenticated using (true);
create policy "signed in write feedback" on feedback for all to authenticated using (true) with check (true);

create policy "read own profile" on profiles for select to authenticated using (auth.uid() = user_id);
create policy "write own profile" on profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner reads all profiles" on profiles for select to authenticated using (
  exists (select 1 from profiles me where me.user_id = auth.uid() and me.role = 'owner')
);
create policy "owner updates all profiles" on profiles for update to authenticated using (
  exists (select 1 from profiles me where me.user_id = auth.uid() and me.role = 'owner')
) with check (
  exists (select 1 from profiles me where me.user_id = auth.uid() and me.role = 'owner')
);

create policy "signed in read media" on storage.objects
for select to authenticated
using (bucket_id = 'family-media');
create policy "signed in upload media" on storage.objects
for insert to authenticated
with check (bucket_id = 'family-media');
create policy "signed in update media" on storage.objects
for update to authenticated
using (bucket_id = 'family-media')
with check (bucket_id = 'family-media');
create policy "signed in delete media" on storage.objects
for delete to authenticated
using (bucket_id = 'family-media');
