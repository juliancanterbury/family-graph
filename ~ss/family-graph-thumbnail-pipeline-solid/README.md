# Family Graph thumbnail pipeline solid fix

Install order:

1. Run `face-thumbnail-pipeline.sql` in Supabase SQL Editor.
2. Copy `app.js` into the root `family-graph` folder, replacing the existing `app.js`.
3. Commit and push.
4. Ctrl+F5 refresh.

What changes:

- Tagging a face no longer changes the profile photo automatically.
- The selected face editor has `Update face thumbnail` and `Use as profile photo`.
- A selected profile face is generated as a real 512px JPEG thumbnail in Supabase Storage.
- People, tree and profile cards use the generated thumbnail when available.
- Existing browser crop fallback remains for older faces until thumbnails are generated.

If a face box is moved/resized after it has a thumbnail, the thumbnail is regenerated from the original photo.
