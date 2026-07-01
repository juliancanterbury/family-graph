-- Family Graph Shared MVP schema
create extension if not exists "pgcrypto";

create table if not exists people (
  id text primary key,
  first_name text not null,
  last_name text,
  birth_year text,
  death_year text,
  living boolean default true,
  bio text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists relationships (
  id text primary key,
  from_person_id text references people(id) on delete cascade,
  to_person_id text references people(id) on delete cascade,
  relationship_type text not null,
  label text,
  created_at timestamptz default now()
);

create table if not exists photo_faces (
  id text primary key,
  person_id text references people(id) on delete set null,
  photo_label text default 'reunion-photo',
  x numeric,
  y numeric,
  w numeric,
  h numeric,
  label text,
  created_at timestamptz default now()
);

alter table people enable row level security;
alter table relationships enable row level security;
alter table photo_faces enable row level security;

create policy "family read people" on people for select to authenticated using (true);
create policy "family write people" on people for all to authenticated using (true) with check (true);
create policy "family read relationships" on relationships for select to authenticated using (true);
create policy "family write relationships" on relationships for all to authenticated using (true) with check (true);
create policy "family read faces" on photo_faces for select to authenticated using (true);
create policy "family write faces" on photo_faces for all to authenticated using (true) with check (true);
