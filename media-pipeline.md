# Media pipeline

1. Upload original to `originals/<photo_id>/original.ext`.
2. Insert row in `photos`.
3. Insert original row in `photo_derivatives`.
4. Background processor creates:
   - `large/<photo_id>/large.jpg`
   - `medium/<photo_id>/medium.jpg`
   - `thumbs/<photo_id>/thumb.jpg`
   - `tiny/<photo_id>/tiny.jpg`
5. Face detector creates:
   - `faces/<photo_id>/face-001.jpg`
6. User confirms suggestions.
7. Confirmed tags populate each person gallery.

Recommended processor later:
- Node/Python worker
- Sharp for resizing
- ExifTool for metadata
- face-api / InsightFace / cloud vision later
