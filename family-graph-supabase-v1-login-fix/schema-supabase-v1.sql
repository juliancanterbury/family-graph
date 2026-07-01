-- Family Graph Supabase V1
-- Run this in Supabase SQL Editor.

create extension if not exists "pgcrypto";

-- People can be fully named, partly named, or unknown placeholders.
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
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Photos uploaded to the archive.
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
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- Face boxes on photos. Later this will also store recognition embeddings.
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
  status text default 'manual', -- manual, detected, suggested, confirmed, rejected
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- Flexible facts: parent, partner, sibling, etc.
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

-- Family units are derived or confirmed: partner/s + children.
create table if not exists family_units (
  id uuid primary key default gen_random_uuid(),
  title text,
  partner_1_id uuid references people(id) on delete set null,
  partner_2_id uuid references people(id) on delete set null,
  status text default 'derived', -- derived, confirmed, needs_review
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists family_unit_children (
  family_unit_id uuid references family_units(id) on delete cascade,
  child_id uuid references people(id) on delete cascade,
  primary key (family_unit_id, child_id)
);

-- Basic profile/role table.
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text default 'contributor', -- contributor, editor, admin
  created_at timestamptz default now()
);

-- Updated timestamp helper.
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

-- Storage bucket: create manually if this fails in SQL UI:
-- bucket name: family-media
insert into storage.buckets (id, name, public)
values ('family-media', 'family-media', true)
on conflict (id) do nothing;

-- RLS
alter table people enable row level security;
alter table photos enable row level security;
alter table faces enable row level security;
alter table relationships enable row level security;
alter table family_units enable row level security;
alter table family_unit_children enable row level security;
alter table profiles enable row level security;

-- For V1: all signed-in family users can read/write.
-- We can tighten this later.
create policy "signed in read people" on people for select to authenticated using (true);
create policy "signed in write people" on people for all to authenticated using (true) with check (true);

create policy "signed in read photos" on photos for select to authenticated using (true);
create policy "signed in write photos" on photos for all to authenticated using (true) with check (true);

create policy "signed in read faces" on faces for select to authenticated using (true);
create policy "signed in write faces" on faces for all to authenticated using (true) with check (true);

create policy "signed in read relationships" on relationships for select to authenticated using (true);
create policy "signed in write relationships" on relationships for all to authenticated using (true) with check (true);

create policy "signed in read family units" on family_units for select to authenticated using (true);
create policy "signed in write family units" on family_units for all to authenticated using (true) with check (true);

create policy "signed in read family unit children" on family_unit_children for select to authenticated using (true);
create policy "signed in write family unit children" on family_unit_children for all to authenticated using (true) with check (true);

create policy "read own profile" on profiles for select to authenticated using (auth.uid() = user_id);
create policy "write own profile" on profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Storage policies
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
