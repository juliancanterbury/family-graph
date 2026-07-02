# Phase 2A — Navigation cleanup

Replace `index.html`, `app.js`, and `style.css`.

This patch does not change the database and does not change face detection.

Fixes:
- Photos page no longer traps the app in edit state.
- Photos always open in View mode first.
- Added photo list in left sidebar so you can return to any uploaded photo.
- Added Previous / Next photo buttons and keyboard arrows.
- Escape leaves edit/selected-face state.
- Removed duplicate Human.js script include.
