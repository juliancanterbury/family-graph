# Brief: Rebuild the Tree view properly, add a Fan Chart view

## Context — read this first
Read `docs/site-plan-v1.md` in full before starting — it has the whole
project's reasoning, decisions, and vision. This brief only covers the tree
work specifically.

## The problem
The current Tree page (`js/tree.js`) uses a hand-rolled layout algorithm
(generation-depth calculation + row-packing) that has broken twice now in
real, confusing ways — people showing at the wrong generation, couples
appearing unrelated to their actual family, children showing as siblings of
their parents. This is a known-hard problem (family trees are graphs with
multiple parents per child, not simple hierarchies), and repeatedly patching
custom code for it hasn't worked. Time to use something built and tested for
exactly this, rather than another patch.

## Data model (what you're working with)
- `people` — id, display_name, given_names, family_name, birth_date,
  death_date, living, avatar_path, invite_email, preferred_face_id
- `relationships` — from_person_id, to_person_id, relationship_type
  (constrained to exactly `'parent'`, `'partner'`, `'sibling'` — mother/father
  get normalized to `'parent'` at save time, direction matters: from=parent,
  to=child). Full siblings are **derived** from shared parents, not stored —
  only use the `'sibling'` type for half-siblings/edge cases where no shared
  parent is on record.
- Family-side visibility scoping already exists (`visiblePeople()` /
  `visiblePhotos()` in `state.js`) — the tree must respect this, same as it
  does today (don't show people outside the current viewer's scope unless
  "Show everyone" is on).

## Part 1 — Replace the main Tree engine
Use **`family-chart`** by donatso (npm: `family-chart`, MIT license,
D3-based, vanilla-JS compatible — https://github.com/donatso/family-chart).
It's purpose-built for exactly this problem (couples as units, multiple
marriages, generation ranking) rather than a generic chart library adapted
for the job.

Requirements for the swap:
- Convert `people` + `relationships` into whatever data shape family-chart
  expects (check its docs for the exact format — likely a flat array with
  each person listing parents/spouses/children by id).
- Restyle its cards to match this app's dark theme (see `css/tree.css` for
  current colors/fonts — recently changed away from bold colored boxes
  toward the same neutral dark card style used on the People/Person pages;
  keep that direction).
- Keep the features already built on top of the old tree that people rely
  on: click a person to re-center/focus on them, the "Show: Immediate
  family / 3 generations / 5 generations / Everyone" limiter, and the theme
  accent color showing on whoever's focused. Check family-chart's own API
  first — it may already support some of this natively (e.g. it likely has
  its own re-center/focus behavior) rather than needing to be rebuilt from
  scratch on top.
- Each card should link to that person's actual Person page in the app
  (`#person/{id}`) — check `js/navigation.js` `showPerson()` for the existing
  pattern other pages use.

## Part 2 — Add a Fan Chart view (separate feature, not a replacement)
A classic genealogy fan chart: focus person in the center, ancestors radiating
outward in a semicircle (or full circle), each ring = one more generation
back. This does **not** come from family-chart — build it directly with D3's
`d3.partition()` + `d3.arc()`, the standard, well-documented technique for
exactly this shape (it's the same underlying pattern as a sunburst chart).
Plenty of open examples of "d3 genealogy fan chart" to reference for the
approach.

- Ancestors only (parents, grandparents, etc.) — not descendants or siblings,
  that's what the main tree is for.
- Show name + birth/death years on each arc segment where space allows.
- Add as a new option alongside the existing Tree view (e.g. a toggle at the
  top: "Tree / Fan chart"), not a replacement for it.
- Typical depth is 4–7 generations before it gets unreadable — cap it
  sensibly and let the generation-limit control (if reused from Part 1)
  apply here too.

## What "done" actually means
Both views need to be checked against real, messy data in an actual browser
— drag/drop a few generations of a real family with a couple of multi-child
families and at least one partner relationship, and confirm it renders
correctly, not just that the code looks right. This tree has broken twice
already from code that looked correct on paper — don't let this be a third
time. Test on both desktop and a narrow/mobile viewport.
