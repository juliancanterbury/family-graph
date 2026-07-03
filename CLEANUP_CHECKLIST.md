# Repository cleanup checklist

## Before deleting anything

1. Close GitHub Desktop.
2. Copy the entire current `family-graph` folder somewhere safe, for example:
   `Documents/Family Graph Archives/family-graph-backup-2026-07-03`
3. Reopen GitHub Desktop and confirm the repo still opens.

## Keep in the repo root

- `.git/`
- `.gitattributes`
- `index.html`
- `app.js`
- `style.css`
- `config.js`
- `README.md`
- `docs/`
- `sql/`
- `assets/` if used
- `birthday-photo.jpg` and `sample-photo.jpg` only if they are still used as demo/static files

## Delete from repo root after backup

Delete old prototype folders beginning with:

- `family-graph-`

except `.git` and except this clean package if you temporarily copied it in.

Delete old loose backup files:

- `index.old*`
- `app.old*`
- `style.old*`
- `*.treebak.*`

Delete old loose SQL experiments once backed up:

- `schema*`
- `family-graph-schema*`
- `schema-shared-mvp*`
- `schema-supabase-v1*`
- `storage-policies*`

## Recommended final root

```text
family-graph/
├── .git/
├── .gitattributes
├── index.html
├── app.js
├── style.css
├── config.js
├── README.md
├── docs/
├── sql/
└── assets/
```

## GitHub Desktop workflow after cleanup

1. Fetch origin
2. Pull origin
3. Check the changed/deleted files list
4. Commit as: `Clean repository structure`
5. Push
