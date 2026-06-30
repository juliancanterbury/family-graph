create extension if not exists "pgcrypto";

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  middle_names text,
  last_name text not null,
  birth_date date,
  birth_year text,
  death_date date,
  death_year text,
  living boolean default true,
  bio text,
  main_photo_id uuid,
  main_photo_crop_id uuid,
  owner_user_id uuid,
  x integer default 1000,
  y integer default 1000,
  privacy_level text default 'family' check (privacy_level in ('private','family','public')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists relationships (
  id uuid primary key default gen_random_uuid(),
  from_person_id uuid references people(id) on delete cascade,
  to_person_id uuid references people(id) on delete cascade,
  relationship_type text not null check (relationship_type in ('parent','child','partner','spouse','ex_partner','adoptive_parent','guardian','sibling')),
  label text,
  start_date date,
  end_date date,
  verified boolean default false,
  created_by uuid,
  created_at timestamptz default now()
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  original_filename text,
  original_storage_path text,
  original_mime_type text,
  original_size_bytes bigint,
  image_hash text,
  title text,
  description text,
  taken_at timestamptz,
  taken_year text,
  location_name text,
  latitude numeric,
  longitude numeric,
  camera_make text,
  camera_model text,
  uploaded_by uuid,
  privacy_level text default 'family' check (privacy_level in ('private','family','public')),
  processing_status text default 'uploaded' check (processing_status in ('uploaded','processing','processed','failed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists photo_derivatives (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid references photos(id) on delete cascade,
  kind text not null check (kind in ('original','large','medium','thumb','tiny')),
  storage_path text not null,
  width integer,
  height integer,
  size_bytes bigint,
  mime_type text,
  created_at timestamptz default now(),
  unique(photo_id, kind)
);

create table if not exists face_crops (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid references photos(id) on delete cascade,
  storage_path text,
  x numeric not null,
  y numeric not null,
  width numeric not null,
  height numeric not null,
  detection_confidence numeric,
  embedding_json jsonb,
  created_at timestamptz default now()
);

create table if not exists face_tags (
  id uuid primary key default gen_random_uuid(),
  face_crop_id uuid references face_crops(id) on delete cascade,
  photo_id uuid references photos(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  status text default 'suggested' check (status in ('suggested','confirmed','rejected')),
  suggestion_confidence numeric,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz default now(),
  unique(face_crop_id, person_id)
);

create table if not exists albums (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  created_by uuid,
  privacy_level text default 'family' check (privacy_level in ('private','family','public')),
  created_at timestamptz default now()
);

create table if not exists album_photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid references albums(id) on delete cascade,
  photo_id uuid references photos(id) on delete cascade,
  sort_order integer default 0,
  caption text,
  unique(album_id, photo_id)
);

create table if not exists tree_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('new_person','relationship_change','join_tree','photo_change','profile_change')),
  requested_by uuid,
  payload jsonb not null,
  status text default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid,
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

insert into people (id, first_name, last_name, birth_year, death_year, living, bio, x, y) values
('00000000-0000-0000-0000-000000000001','Jean','Canterbury','1942','2018',false,'Family tree starter. Deceased profile photo managed by tree editors.',760,210),
('00000000-0000-0000-0000-000000000002','Paul','Canterbury','1940','2020',false,'Family tree starter. Deceased profile photo managed by tree editors.',1180,210),
('00000000-0000-0000-0000-000000000003','Julian','Canterbury','1970',null,true,'Architect. Can edit own profile and choose own tree photo.',480,650),
('00000000-0000-0000-0000-000000000004','Rachel','Canterbury','1973',null,true,'Profile editable by Rachel once invited.',1260,650),
('00000000-0000-0000-0000-000000000005','Andrew','Canterbury','1976',null,true,'Profile editable by Andrew once invited.',1680,650),
('00000000-0000-0000-0000-000000000006','Zoe','Phillips',null,null,true,'Julian’s partner. Can start a Phillips family tree and connect through this relationship.',900,650)
on conflict (id) do nothing;

insert into relationships (from_person_id, to_person_id, relationship_type, label, verified) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','spouse','Married 1966',true),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','parent','Mother',true),
('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','parent','Father',true),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','parent','Mother',true),
('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004','parent','Father',true),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','parent','Mother',true),
('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000005','parent','Father',true),
('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000006','partner','Partners',true)
on conflict do nothing;

alter table people enable row level security;
alter table relationships enable row level security;
alter table photos enable row level security;
alter table photo_derivatives enable row level security;
alter table face_crops enable row level security;
alter table face_tags enable row level security;
alter table albums enable row level security;
alter table album_photos enable row level security;
alter table tree_requests enable row level security;

create policy "family read people" on people for select to authenticated using (true);
create policy "family write people" on people for all to authenticated using (true) with check (true);
create policy "family read relationships" on relationships for select to authenticated using (true);
create policy "family write relationships" on relationships for all to authenticated using (true) with check (true);
create policy "family read photos" on photos for select to authenticated using (true);
create policy "family write photos" on photos for all to authenticated using (true) with check (true);
create policy "family read derivatives" on photo_derivatives for select to authenticated using (true);
create policy "family write derivatives" on photo_derivatives for all to authenticated using (true) with check (true);
create policy "family read face crops" on face_crops for select to authenticated using (true);
create policy "family write face crops" on face_crops for all to authenticated using (true) with check (true);
create policy "family read face tags" on face_tags for select to authenticated using (true);
create policy "family write face tags" on face_tags for all to authenticated using (true) with check (true);
create policy "family read albums" on albums for select to authenticated using (true);
create policy "family write albums" on albums for all to authenticated using (true) with check (true);
create policy "family read album photos" on album_photos for select to authenticated using (true);
create policy "family write album photos" on album_photos for all to authenticated using (true) with check (true);
create policy "family read requests" on tree_requests for select to authenticated using (true);
create policy "family write requests" on tree_requests for all to authenticated using (true) with check (true);
