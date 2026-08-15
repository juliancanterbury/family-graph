# Architecture

## Separation of responsibilities

- GitHub Pages: application code only (`index.html`, `app.js`, `style.css`)
- Supabase database: people, photos, faces, relationships, suggestions, comments, feedback, profiles
- Supabase Storage: original photos, generated thumbnails, profile portraits

## Current pages

- Dashboard
- Photos
- People
- Tree
- Relationships
- Review
- Admin

## Next refactor target

Split `app.js` into modules once the current feature set is stable:

```text
js/
├── state.js
├── database.js
├── photos.js
├── faces.js
├── people.js
├── relationships.js
├── tree.js
├── review.js
└── ui.js
```

For now, the clean package keeps the current single-file app to avoid breaking the live site.
