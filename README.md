# Canterbury Family Tree V2 - Media + Family Graph

This package sets up the real architecture for:

- people and relationships
- family graph
- original photo storage
- large / medium / thumbnail / tiny derivatives
- face crops
- confirmed and suggested face tags
- join-tree requests

## Setup

1. Create a Supabase project.
2. Run `schema.sql` in Supabase SQL Editor.
3. Create a private Supabase Storage bucket called `family-media`.
4. Run `storage-policies.sql`.
5. Paste your Supabase Project URL and anon key into `config.js`.
6. Open `index.html`.

## Storage layout

family-media/
  originals/<photo_id>/original.ext
  large/<photo_id>/large.jpg
  medium/<photo_id>/medium.jpg
  thumbs/<photo_id>/thumb.jpg
  tiny/<photo_id>/tiny.jpg
  faces/<photo_id>/face-001.jpg

Photos are stored once. Person galleries are generated from confirmed face tags.
