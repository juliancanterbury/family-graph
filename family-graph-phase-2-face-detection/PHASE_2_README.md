# Family Graph — Phase 2 Face Detection

Replace these three files in GitHub:

- `index.html`
- `app.js`
- `style.css`

No new Supabase SQL is required for this phase.

## What this adds

- Uploading a photo now automatically tries to detect faces.
- The **Detect faces** button can be run manually on the current photo.
- Detected faces are saved as unnamed `faces` records with `status = detected`.
- Existing face boxes are not duplicated.
- Manual **Add face box** remains as a fallback.

## Notes

Face detection runs in the browser using the Human.js library. It may take a few seconds the first time because the model has to load. If the browser blocks the model or the photo is difficult, manual boxing still works.
