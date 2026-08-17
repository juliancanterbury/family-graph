# Family Graph — Site Plan (v1)

## The core problem right now
The Photos page is trying to be two different tools at once:
1. A fast way to look at a photo and say "that's Andrew."
2. A full editing workbench (relationships, dates, comments, 20-person sidebar).

Doing both on one screen is why it feels overwhelming. The fix isn't more features —
it's **splitting these into two clearly separate experiences**, matching what you and
ChatGPT already agreed on early in the project: a fast "Identify" mode, and a rich
"Explore" mode, kept apart.

---

## 1. Identify screen (replaces the current cluttered Photos page)

**Goal:** look at a photo, tap a face, say who it is, move to the next one. Nothing else visible.

```
┌─────────────────────────────────────────┐
│  ← Dashboard              Photo 3 of 12  │
│                                           │
│         [ the photograph, large ]        │
│                                           │
│              ○  ← tap a face             │
│                                           │
├─────────────────────────────────────────┤
│  Who is this?                            │
│  [ search / type a name          ]       │
│  Recent: Julian  Jean  Paul  Andrew       │
│                                           │
│              [ Save & next face ]        │
└─────────────────────────────────────────┘
```

What's gone from this screen: the 20-person sidebar, relationship buttons
(Mother of / Father of / etc.), comments, photo date/place fields, edit-mode
toggle, box/name visibility toggles. All of that moves to a separate
**"Details"** button (small, out of the way) for when someone actually wants it —
not shown by default.

Relationships still get built, just not here. When you name a face, if that
person doesn't have a mother/father/partner recorded yet, a single small prompt
can appear — *"Who is Julian's mother?"* — answered by tapping an existing person
or "skip." One question, not a whole form.

## 2. Person page (new — doesn't exist yet)

**Goal:** tap someone's name anywhere in the app, land on a page about *just them.*

```
┌─────────────────────────────────────────┐
│              [ portrait ]                │
│           Julian Canterbury              │
│            b. 23 Jan 1963                │
│                                           │
│  Parents      Paul & Jean Canterbury     │
│  Partner      —                          │
│  Children     —                          │
│  Siblings     Andrew, Rachel             │
│                                           │
│  Photos (14)                             │
│  □ □ □ □ □ □ □                           │
└─────────────────────────────────────────┘
```

Tapping a parent/sibling/child name here navigates to *their* page — so browsing
the family becomes clicking from person to person, not hunting through a sidebar.
This is the "People contain photos" idea from the earlier ChatGPT conversation —
not built yet, and probably the single most valuable thing to add next.

## 3. Everything else — status check
- **Tree/Graph** — keep as-is, it's for "how is everyone related," not identifying.
- **People list** — becomes a simple directory: portrait + name, tap → Person page.
- **Review/Inbox** — keep for later; not urgent while basic identifying is still clunky.
- **Admin** — keep hidden behind owner role, no change needed yet.

---

## Design principle — one clear path
Every screen should have one obvious way to do the thing it's for — not several
buttons and dropdowns offering different routes to the same result. Where the
current app shows six relationship buttons plus two person dropdowns, or a photo
covered in boxes and toggles, that's a sign the screen is doing too much at once.
The fix is usually to remove options, not add instructions.

## Identify screen — passport style (replaces box-and-label review)
Instead of overlaying every detected face as a rectangle on the full photo at
once, review faces **one at a time**, cropped tight and centered like a passport
photo — no boxes visible on the image itself.

```
┌───────────────────────┐
│                       │
│      ( face crop )     │
│                       │
│   Who is this?          │
│   [ type or pick a name ]│
│                       │
│        [ Next → ]       │
└───────────────────────┘
```

Human.js (the detection library already in use) can report eye and chin
positions, not just a rough box — using those lets the crop center properly on
the face rather than an approximate square, closer to how a passport-photo app
frames a portrait.

## Relationship builder — drag and drop (future, after Person page exists)
Replace the dropdown + six-button relationship form with direct manipulation:
a person's portrait sits center-screen, with clearly labeled drop targets below
— "Mother," "Father," "Partner," "Child." Drag another person's photo onto a
target to create that relationship. No decision between multiple buttons —
just drag the right photo onto the right zone. Best built once the Person page
exists, since that's the natural home for it.

## Onboarding — invite-gated, staged complexity
Refined idea: a new person can only be invited by being linked to someone
already in the tree — the invite itself requires picking the relationship
("Invite Andrew, who is Julian's brother"), so the person record and the
relationship are created together, before the new user ever logs in. This
means there's no such thing as an orphaned account outside the graph, and it
gives a natural default for their first view: centered on whoever invited
them, expanding outward as they do more.

Exceptions to the gating rule:
- The first user (owner) can't be linked to anyone — stays a special case.
- Historical/deceased people are just records, not accounts — no login, so
  the "must be linked to invite" rule only applies to actual invited users,
  not every person added to the tree.

## Invite via email, tied to an existing face — simplified version now built
The full version (with face-recognition identity confirmation on their new
photo) is still deferred. A simpler version is built: from a person's page
(Edit mode, owner/editor only), enter their email to invite them. When they
first sign in with that email, their account auto-links to that person
record — no manual "which person are you" step, and their Tree view defaults
to centering on themselves. This directly supports "no one starts without
being linked to someone real," without yet hard-blocking open sign-up (which
remains fine while it's just family testing, per your call).

## Own-photo avatars (built)
Anyone (for themselves) or an owner/editor (on someone's behalf, useful for
relatives who don't have accounts yet) can set a dedicated portrait via a
passport-photo-style capture: take/upload a selfie, drag an eye-line and a
chin-line onto the actual eyes and chin, confirm. The app computes a
consistently-framed circular crop from those two reference points. This
avatar takes priority over any face crop pulled from a group photo — directly
solves old/low-quality auto-crops, and lets people control how they're
represented without needing to touch the identify-faces workflow at all.

## Friends — separate but connected (future, not started)
A friend is fundamentally not the same kind of connection as family — forcing
them into the parent/partner/child model would corrupt the actual genealogy
and break every tree/pedigree view, which are all specifically about blood
and marriage lines. The data model already supports "separate" for free: a
person doesn't need any family relationship to exist, have their own page, or
be tagged in photos — they just wouldn't appear in the Tree. What "connected"
would actually need: visibility based on who's tagged together in shared
photos, independent of the family-graph scoping that currently drives "show
my family only" — a friend has no family relationship, so they're invisible
under today's scoping rule even if they're standing right next to you in a
photo. That's the real design work whenever this gets picked up, not a
different kind of relationship type.

## Photo restoration — deblur / colorize old photos (future, needs new infrastructure)
Genuinely possible, but different in kind from everything built so far: this
needs an external AI service (colorization/deblurring models are too heavy to
run client-side like face detection does), which means introducing the app's
first real backend piece — a Supabase Edge Function to hold the API key
securely, since a key can't safely live in browser-visible code. Plan: an
opt-in "Enhance this photo" action that creates a new version alongside the
original rather than replacing it (AI restoration can invent detail that
wasn't there, so the real original should always stay available). Start with
a free-tier provider (e.g. DeepAI) to prove it out before considering a paid
tier for better quality.

## Favorites — the "fun" layer, kept separate from the "accurate" layer
Anyone can heart/favorite any photo they can see, purely as personal
curation — doesn't touch who's tagged, doesn't move or duplicate the photo,
doesn't need any permission. Two cousins can both favorite the same photo of
a shared grandmother independently. This gives two natural views: "My
Favorites" (a personal gallery across the whole archive, not just your own
uploads or family branch) and "Family Favorites" (an aggregate of the
most-loved photos — the living, fun, evolving part of the site). Important
property: this never touches the people/relationships tables at all, so the
fun layer can never corrupt the accurate birth/death/relationship data
underneath — genuinely separate concerns, by design.

## Multiple photo uploads at once (deferred until recognition exists)
Batch-uploading many photos only actually saves time once faces can be
auto-suggested — without recognition, each photo still needs a human to name
every face individually, so uploading 20 at once just creates a backlog of
20 photos needing identical manual attention, one at a time anyway. Revisit
this once recognition is built; it becomes much more valuable then.

## Duplicate people (e.g. "Robert Canterbury" / "Rob Canterbury")
Two layers needed:
1. Prevention — fuzzy name matching plus a small nickname dictionary
   (Rob/Bob/Bobby → Robert, etc.) that warns "did you mean the existing
   person?" before a duplicate gets created.
2. A merge tool — pick two person records, choose which survives, reassign
   all photos/faces/relationships to the survivor, delete the duplicate.
   Needed as a safety net regardless of how good prevention gets.

## Face recognition — realistic expectations
- Storing several faceprints per person (not just one) and matching against
  the closest of the set meaningfully improves accuracy.
- Matching the *same* person across very different ages (childhood vs. old
  age) is a known hard limit of general-purpose recognition — expect this to
  stay a manual "is this the same person?" call, not something the AI reliably
  solves on its own. Matching within a similar life stage/era should work
  reasonably well.

## Suggested build order
1. Fix face detection (diagnose first — see chat).
2. Strip the Photos page down to the Identify screen above.
3. Build the Person page.
4. Move relationship-building into the small in-context prompt described above.
5. Everything else (Stories, Timeline, Places, themes) waits until 1–4 feel effortless.

## Open questions for you
- On the Identify screen, do you want relationship prompts to appear at all, or
  would you rather build relationships later on the Person page instead — even
  simpler, but slower to get a full tree filled in?
- Should "Details" (date, place, comments) live on a separate small button on the
  Identify screen, or move entirely onto the photo's own page reached from People/Tree?
