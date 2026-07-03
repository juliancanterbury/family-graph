# Family Graph Engine v2

This is a structural cleanup. It does **not** require SQL changes.

## Replace in the repo root

Copy these files/folders into the root of `family-graph`:

- `index.html`
- `app.js`
- `style.css`
- `js/`
- `css/`

Keep your existing:

- `config.js`
- `.git/`

## What changed

- Code split into modules: app, navigation, photos, people, relationships, tree, admin, review, api, state.
- The photo list is now a first-class part of the Photos page.
- Selected face editor includes existing-person dropdown and create-new-person field.
- Navigation is centralised to reduce page-lock bugs.
- No Supabase schema changes.
