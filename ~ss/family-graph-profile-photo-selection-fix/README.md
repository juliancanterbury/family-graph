Family Graph profile photo selection fix

Replace app.js only.

What changed:
- Tagging/naming a face no longer lets a newer/larger face automatically take over a person's People-card portrait.
- Each person now uses an explicit profile face if one has been chosen.
- If no profile face is chosen, the app uses the oldest confirmed face as the stable default.
- The selected-face panel now has: Use as profile photo.
- Existing crop maths is left untouched.

No SQL required. If your people table already has profile_face_id, the app will save it there. If not, it falls back to this browser's local storage until we add that column deliberately.
