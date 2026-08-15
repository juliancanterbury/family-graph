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
