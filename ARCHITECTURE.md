# Architecture

## Separation of responsibilities

- **GitHub Pages** — application code only (`index.html`, `css/*.css`, `js/*.js`)
- **Supabase database** — people, photos, faces, relationships, suggestions,
  comments, feedback, profiles (see `sql/README.md` and
  `schema-supabase-v1.sql` for the real schema)
- **Supabase Storage** — original photos, in a bucket referenced by
  `FAMILY_MEDIA_BUCKET` in `config.js`

The `js/` split described in an earlier version of this doc as a "next
refactor target" is done — `app.js` (the old single 65KB file) is gone. Each
module below now owns one concern.

## JS modules (`js/`)

| Module | Owns |
|---|---|
| `state.js` | Shared app state (`S`), DOM helpers (`$`, `html`, `text`), name/relationship helpers, family-side visibility scoping (`visiblePeople`, `visiblePhotos`, `inScope`) |
| `api.js` | Supabase client setup, auth (`ensureProfile`, `setMyPerson`), data loading |
| `render.js` | Cross-page render helpers (avatar/crop rendering, dashboard stats, page routing dispatch) |
| `navigation.js` | Page switching, the person-page route (`showPerson`), edit/view mode |
| `photos.js` | Upload, face detection (Human.js), face box drag/resize, photo browsing |
| `people.js` | People list, add/delete person, the "which person are you" linking card |
| `person.js` | Individual Person page — profile, drag-and-drop relationship builder, photo gallery |
| `relationships.js` | Relationship validation (no self-links, no ancestor loops), create/delete, the Relationships page list |
| `tree.js` | Family tree layout and rendering, click-to-recenter focus behavior |
| `review.js` | Suggestions/comments/feedback queues |
| `admin.js` | Raw database browser (owner/editor only) |
| `app.js` | Boots everything — binds all modules, starts auth routing |

## CSS (`css/`)

One file per page/concern: `base.css` (variables, resets, shared components),
`layout.css` (header/nav/page shell + mobile breakpoints), `photos.css`,
`tree.css`, `admin.css`, `dashboard.css`, `person.css`. All theme colors are
CSS variables set on `<body data-theme="...">`, switched via the theme rail
on the Tree page.

## Known constraints worth remembering

- Face box coordinates are stored as **fractions of the photo's real pixel
  dimensions** (not raw screen pixels) so they render correctly regardless of
  device/screen size. Any face box saved before this convention existed is
  still in the old screen-pixel format and needs a one-time manual nudge to
  migrate — see the plan doc's history for why.
- `visiblePeople()` / `visiblePhotos()` in `state.js` are the single source
  of truth for "family-side" scoping — any new page listing people or photos
  should filter through these rather than reading `S.people`/`S.photos`
  directly, or it'll leak data across family sides.

For the product plan, open questions, and reasoning behind design decisions,
see `docs/site-plan-v1.md`.
