# Family Graph face naming fix

No SQL changes.

Replace these three files in the repo root:

- index.html
- app.js
- style.css

Fixes:

- selected unnamed faces now show a clear quick-name/search field
- existing people can be selected either by dropdown or by typing their name
- typing a new name no longer blocks spaces between first and last names
- names still auto-capitalise live while preserving spaces
