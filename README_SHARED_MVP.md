# Family Graph Shared Family MVP

This version is for non-technical family members.

## What changes

- No GitHub for family users
- No JSON export/import required
- Email magic-link login
- Shared Supabase database
- Simple "Name people in photo" workflow
- Click face → type name → save
- Add mother/father/partner/child relationship → save
- Graph updates from shared data

## Files

Copy into repo root:

- index.html
- style.css
- app.js
- config.js
- schema-shared-mvp.sql
- birthday-photo.jpg

## Setup

1. Run `schema-shared-mvp.sql` in Supabase.
2. In Supabase Auth, enable Email sign-in.
3. In `config.js`, paste Supabase URL and anon key.
4. Commit and push.
5. Send the GitHub Pages URL to family members.

## Commit

`Add shared family login and simple relationship workflow`
