-- Family Graph face thumbnail pipeline
-- Run once in Supabase SQL Editor. Safe to run more than once.

alter table public.faces
  add column if not exists thumbnail_path text,
  add column if not exists thumbnail_updated_at timestamptz;

alter table public.people
  add column if not exists profile_face_id uuid references public.faces(id) on delete set null;

create index if not exists idx_faces_person_thumbnail on public.faces(person_id, thumbnail_path);
create index if not exists idx_people_profile_face on public.people(profile_face_id);
