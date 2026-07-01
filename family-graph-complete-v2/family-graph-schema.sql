-- Family Graph Complete V2 schema
-- Run this once in Supabase SQL Editor.

create extension if not exists "pgcrypto";

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
  created_at timestamptz default now()
);

insert into storage.buckets (id, name, public)
values ('family-media', 'family-media', true)
on conflict (id) do nothing;

alter table people enable row level security;
alter table photos enable row level security;
alter table faces enable row level security;
alter table relationships enable row level security;
alter table profiles enable row level security;

drop policy if exists "signed in read people" on people;
drop policy if exists "signed in write people" on people;
drop policy if exists "signed in read photos" on photos;
drop policy if exists "signed in write photos" on photos;
drop policy if exists "signed in read faces" on faces;
drop policy if exists "signed in write faces" on faces;
drop policy if exists "signed in read relationships" on relationships;
drop policy if exists "signed in write relationships" on relationships;
drop policy if exists "read own profile" on profiles;
drop policy if exists "write own profile" on profiles;

create policy "signed in read people" on people for select to authenticated using (true);
create policy "signed in write people" on people for all to authenticated using (true) with check (true);
create policy "signed in read photos" on photos for select to authenticated using (true);
create policy "signed in write photos" on photos for all to authenticated using (true) with check (true);
create policy "signed in read faces" on faces for select to authenticated using (true);
create policy "signed in write faces" on faces for all to authenticated using (true) with check (true);
create policy "signed in read relationships" on relationships for select to authenticated using (true);
create policy "signed in write relationships" on relationships for all to authenticated using (true) with check (true);
create policy "read own profile" on profiles for select to authenticated using (auth.uid() = user_id);
create policy "write own profile" on profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "signed in read media" on storage.objects;
drop policy if exists "signed in upload media" on storage.objects;
drop policy if exists "signed in update media" on storage.objects;
drop policy if exists "signed in delete media" on storage.objects;

create policy "signed in read media" on storage.objects
for select to authenticated using (bucket_id = 'family-media');
create policy "signed in upload media" on storage.objects
for insert to authenticated with check (bucket_id = 'family-media');
create policy "signed in update media" on storage.objects
for update to authenticated using (bucket_id = 'family-media') with check (bucket_id = 'family-media');
create policy "signed in delete media" on storage.objects
for delete to authenticated using (bucket_id = 'family-media');
