# SQL

No migration is included in this cleanup package.

Your Supabase database is already live. Do not rerun old migrations unless we explicitly create a new one.

For safety, export a schema backup from Supabase before future database changes.

## Migrations

- `2026-11-04-photo-dedupe-and-face-lock.sql` adds `photos.content_hash`, `photos.phash` (duplicate-upload check) and `faces.locked` (padlock on face boxes). It only adds columns; run it once in the SQL Editor.
- `2026-11-04-duplicate-photos-report.sql` is read-only: it lists likely duplicate photos and which names are on each copy.
