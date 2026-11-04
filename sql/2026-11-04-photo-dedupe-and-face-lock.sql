-- ============================================================
-- Family Graph: photo fingerprints + face box locks (2026-11-04)
-- Run once in the Supabase SQL Editor. Only ADDS columns and an index;
-- it changes and deletes nothing. Safe to run twice.
--
-- The app keeps working before this is run: uploads still save (the
-- duplicate check just only covers photos fingerprinted in that session),
-- and the padlock asks for this update when clicked.
-- ============================================================

-- SHA-256 of the uploaded file (exact copies) and a 64-bit visual hash
-- (resized / re-compressed copies). Filled in on upload, and for older photos
-- when the owner runs Admin > Find duplicate photos and merges.
alter table photos add column if not exists content_hash text;
alter table photos add column if not exists phash text;
create index if not exists photos_content_hash_idx on photos (content_hash);

-- Padlock on a face box: a locked box can't be dragged or resized, and taps
-- pass through it to the boxes underneath.
alter table faces add column if not exists locked boolean not null default false;

-- OPTIONAL, LATER: once Admin > Find duplicate photos reports no duplicates,
-- this makes the database itself refuse a second copy of the same file.
-- It fails (harmlessly, nothing changes) if duplicates still exist.
-- create unique index if not exists photos_content_hash_unique on photos (content_hash) where content_hash is not null;
