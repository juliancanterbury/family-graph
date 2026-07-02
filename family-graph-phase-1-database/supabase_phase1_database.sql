-- Family Graph — Phase 1 Professional Database Foundation
-- Run once in Supabase SQL Editor. Safe to re-run: uses IF NOT EXISTS where possible.

create extension if not exists pgcrypto;

-- -------------------------------------------------------------------
-- 1) Existing core tables: add professional archive fields
-- -------------------------------------------------------------------

alter table if exists profiles
  add column if not exists role text default 'viewer',
  add column if not exists display_name text,
  add column if not exists avatar_url text,
  add column if not exists last_seen_at timestamptz;

alter table if exists people
  add column if not exists preferred_name text,
  add column if not exists birth_name text,
  add column if not exists other_names text[] default '{}',
  add column if not exists married_name_from date,
  add column if not exists gender text,
  add column if not exists birth_place text,
  add column if not exists death_place text,
  add column if not exists biography text,
  add column if not exists occupation text,
  add column if not exists profile_face_id uuid,
  add column if not exists privacy_level text default 'family',
  add column if not exists record_status text default 'active',
  add column if not exists record_owner uuid,
  add column if not exists updated_at timestamptz default now();

alter table if exists photos
  add column if not exists photo_date date,
  add column if not exists date_taken date,
  add column if not exists date_accuracy text default 'unknown',
  add column if not exists location text,
  add column if not exists place text,
  add column if not exists caption text,
  add column if not exists description text,
  add column if not exists photographer text,
  add column if not exists album text,
  add column if not exists privacy_level text default 'family',
  add column if not exists record_status text default 'active',
  add column if not exists updated_at timestamptz default now();

alter table if exists faces
  add column if not exists label_at_time text,
  add column if not exists confidence numeric,
  add column if not exists status text default 'unconfirmed',
  add column if not exists detection_source text,
  add column if not exists verified_by uuid,
  add column if not exists verified_at timestamptz,
  add column if not exists updated_at timestamptz default now();

alter table if exists relationships
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists date_accuracy text default 'unknown',
  add column if not exists notes text,
  add column if not exists status text default 'confirmed',
  add column if not exists updated_at timestamptz default now();

-- -------------------------------------------------------------------
-- 2) New archive tables
-- -------------------------------------------------------------------

create table if not exists places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  latitude numeric,
  longitude numeric,
  description text,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_type text default 'memory',
  event_date date,
  date_accuracy text default 'unknown',
  place_id uuid references places(id) on delete set null,
  description text,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists event_people (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  role text,
  created_at timestamptz default now(),
  unique(event_id, person_id, role)
);

create table if not exists photo_people (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid references photos(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  role text,
  created_at timestamptz default now(),
  unique(photo_id, person_id, role)
);

create table if not exists person_names (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people(id) on delete cascade,
  name text not null,
  name_type text default 'also_known_as', -- birth, married, preferred, also_known_as, nickname
  start_date date,
  end_date date,
  notes text,
  created_by uuid,
  created_at timestamptz default now()
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid references photos(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  face_id uuid references faces(id) on delete cascade,
  body text not null,
  status text default 'open',
  author_id uuid,
  author_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists suggestions (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  photo_id uuid references photos(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  face_id uuid references faces(id) on delete cascade,
  relationship_id uuid references relationships(id) on delete cascade,
  suggested_value text,
  body text,
  status text default 'open', -- open, approved, rejected
  author_id uuid,
  author_name text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  kind text default 'request', -- bug, request, note
  status text default 'open',
  priority text default 'normal',
  author_id uuid,
  author_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_name text,
  action text not null,
  entity_type text,
  entity_id uuid,
  summary text,
  created_at timestamptz default now()
);

-- -------------------------------------------------------------------
-- 3) Indexes
-- -------------------------------------------------------------------

create index if not exists idx_people_display_name on people(display_name);
create index if not exists idx_people_birth_name on people(birth_name);
create index if not exists idx_photos_date_taken on photos(date_taken);
create index if not exists idx_faces_photo_id on faces(photo_id);
create index if not exists idx_faces_person_id on faces(person_id);
create index if not exists idx_relationships_from on relationships(from_person_id);
create index if not exists idx_relationships_to on relationships(to_person_id);
create index if not exists idx_comments_photo on comments(photo_id);
create index if not exists idx_suggestions_status on suggestions(status);
create index if not exists idx_feedback_status on feedback(status);
create index if not exists idx_activity_created on activity_log(created_at desc);

-- -------------------------------------------------------------------
-- 4) Simple RLS policies for family archive use
-- -------------------------------------------------------------------

alter table places enable row level security;
alter table events enable row level security;
alter table event_people enable row level security;
alter table photo_people enable row level security;
alter table person_names enable row level security;
alter table comments enable row level security;
alter table suggestions enable row level security;
alter table feedback enable row level security;
alter table activity_log enable row level security;

do $$
declare t text;
begin
  foreach t in array array['places','events','event_people','photo_people','person_names','comments','suggestions','feedback','activity_log'] loop
    execute format('drop policy if exists "family signed-in read" on %I', t);
    execute format('drop policy if exists "family signed-in insert" on %I', t);
    execute format('drop policy if exists "family signed-in update" on %I', t);
    execute format('create policy "family signed-in read" on %I for select to authenticated using (true)', t);
    execute format('create policy "family signed-in insert" on %I for insert to authenticated with check (true)', t);
    execute format('create policy "family signed-in update" on %I for update to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Optional: keep existing core-table policies if you already have them.
-- This migration does not remove or weaken existing people/photos/faces/relationships policies.
