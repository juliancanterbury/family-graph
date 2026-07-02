# Family Graph — Phase 1 Professional Database

This phase is the database foundation only. It does **not** add automatic face detection yet.

## Install order

1. In Supabase, open **SQL Editor**.
2. Run `supabase_phase1_database.sql` once.
3. Replace the website files with:
   - `index.html`
   - `app.js`
   - `style.css`
4. Refresh the site.

## What this phase adds

- Birth name / current name / preferred name support.
- Optional death date.
- Biography and occupation fields.
- Better photo metadata: date accuracy, photographer, caption, place.
- Per-face `label_at_time`, e.g. Jean Davey in an old photo while the person record remains Jean Canterbury.
- Comments, suggestions, feedback, activity log, places and events tables.
- Safe collaboration foundations without overwriting the archive.

## Important rule

A face should link to a person. The name shown on a particular photo can be different from the person's current name.
