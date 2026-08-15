# Family Graph

A private, shared family photo archive and family tree, built for a small
group of family members to upload photos, identify people, and build out
relationships together.

Live at: https://juliancanterbury.github.io/family-graph/

## How it works

Static site (HTML/CSS/JS) hosted on GitHub Pages, backed by
[Supabase](https://supabase.com) for the database, authentication, and photo
storage. Face detection runs entirely in the browser via
[Human.js](https://github.com/vladmandic/human) — no photos or face data are
sent to any third-party AI service.

Sign-in is via Supabase magic-link email (no passwords).

## Local setup

1. Clone this repo.
2. Copy your real Supabase project URL and anon/publishable key into
   `config.js` (see `config.example.js` for the format). **Never commit a
   `config.js` with real keys to a public repo without Row Level Security
   properly configured on every table** — the anon key is only safe to
   expose when your database policies actually restrict access correctly.
3. Open `index.html` directly, or serve the folder with any static file
   server. No build step, no `npm install` — it's plain HTML/CSS/JS modules.

## Deploying changes

This repo is tracked with GitHub Desktop. Before making any changes on a
given computer: **pull origin first**, every time — this project is worked
on from more than one machine, and skipping this step is the single most
common cause of merge conflicts here.

## Project structure

```
index.html          Entry point — page markup only, no logic
config.js            Your real Supabase URL/key (not a template — see setup above)
config.example.js    Template showing the expected format

css/                 One file per page/concern (base, layout, photos, tree, admin, dashboard, person)
js/                  ES modules — see docs/ARCHITECTURE.md for what each one owns
docs/                Architecture notes and the living project plan (site-plan-v1.md)
sql/                 Notes on the database — see sql/README.md
assets/              Static assets (currently empty, reserved for icons etc.)
```

## Current status

- **Identifying people** (upload → detect faces → name → build relationships)
  is the core, working loop.
- **Face recognition** (auto-suggesting who a new face might be) is not yet
  built — every face is currently named manually.
- **Invites** are currently an open magic-link sign-in — anyone with the link
  can create an account. A more restricted, invite-only system is designed
  but not built (see the plan doc).

For the full roadmap, open design decisions, and reasoning behind current
choices, see `docs/site-plan-v1.md` — that's the living plan, kept up to date
as the project develops.
