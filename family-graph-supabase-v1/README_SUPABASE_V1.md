# Family Graph Supabase V1

This is the first real backend version.

## What this does

- Uses Supabase Auth magic-link login
- Saves people to Supabase
- Saves uploaded photos to Supabase Storage
- Saves face boxes to Supabase
- Saves relationships to Supabase
- Renders the graph from shared database records

## Setup

1. Create a Supabase project.
2. Open SQL Editor.
3. Run `schema-supabase-v1.sql`.
4. Go to Authentication > Providers and enable Email.
5. Go to Project Settings > API.
6. Copy:
   - Project URL
   - anon public key
7. Paste them into `config.js`.
8. Copy files into your GitHub repo root.
9. Commit and push.

## Commit message

Add Supabase shared database v1

## Notes

This is not face recognition yet. It is the shared database foundation.
Automatic face detection/recognition comes after this is saving reliably.
