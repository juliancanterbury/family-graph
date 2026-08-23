# Brief: Photos page & Person page layout — needs a real mobile-first pass

## Context
Read `docs/site-plan-v1.md` first. This follows on from the tree rebuild
(`docs/tree-rebuild-brief.md`) — that one's done and looks great (family-chart
tree, fan chart toggle, generation limiter all confirmed working from
screenshots). This brief covers issues found afterward, from real phone and
iPad screenshots.

## The core problem
The Photos page and Person page currently use one responsive layout that
flexes between phone/tablet/desktop. In practice this doesn't work — phone
and iPad need genuinely different arrangements, not just scaled versions of
the same one. Confirmed from real screenshots:

### 1. Photos page — sidebar/photo width balance is wrong (iPad, and likely desktop)
The left "Same people / All" photo list column and the main photo display are
sized almost identically. The main photo should be the dominant element by a
wide margin — the sidebar is a browsing aid, not co-equal real estate.

### 2. Person page — relationship builder wastes iPad's width entirely
Viewing a person's Parent/Partner/Child builder on iPad leaves a large empty
black area to the right of the content, while the actual builder (drop zones
+ draggable people tray) is squeezed into a narrow column that requires a lot
of vertical scrolling to use. On a wide screen this should reflow to use the
available width — more people visible in the tray without scrolling, drop
zones sized sensibly — not stay locked into a narrow mobile-width column.

### 3. Draggable person chips show broken/wrong face crops
In the Person page's relationship-builder tray (the row of small draggable
person avatars), several show as solid colors, oddly zoomed close-ups, or
otherwise clearly wrong crops rather than a recognizable face — visible
clearly in the screenshots for that page. Worth checking: is this the same
"legacy pixel format" face-box issue from before (some faces never got
migrated to the fraction-based coordinate system and render wrong at small
sizes), or a separate bug specific to how this tray renders avatars at a
small size? Check `avatarHtml()` / `cropStyle()` in `js/render.js` and how
the tray specifically calls it.

### 4. Phone specifically needs its own layout, not a shrunk desktop one
Confirmed by the user directly: "The photo interface needs to be organised
fundamentally differently to the PC and iPad one." Don't try to make one
fluid layout serve all three. A genuinely separate phone layout (likely:
full-width single column, sidebar collapsed into a drawer/tab rather than
always visible, relationship builder redesigned for narrow screens
specifically rather than just narrower) is the right call.

## Two more things spotted in the screenshots, not mentioned by the user directly — worth checking
### 5. Header nav appears to overlap page content on phone
Multiple phone screenshots show the top nav (Review, Admin, Show my family
only, Refresh, Sign out) rendering as an overlapping block on top of page
content below it, rather than staying cleanly in the header. This may be a
regression of an earlier fix (nav used to scroll horizontally in a single row
on narrow screens rather than wrap) — check `css/layout.css` for the
`nav{overflow-x:auto; flex-wrap:nowrap}` rule from before and confirm it's
still intact and actually taking effect on real phone widths.

### 6. Tree/Fan chart sometimes renders tiny on first load — real bug, not just the fan chart
Confirmed by the user to happen on **both PC and iPad**, and on **either the
main Tree or the Fan chart** — not fan-chart-specific as first suspected.
Pattern: the first time the Tree page is opened in a session, it can render
very small/squeezed. Clicking "Fit" or using zoom fixes it immediately, and
it works correctly from then on for the rest of the session. This strongly
suggests the initial auto-fit calculation runs before the container has its
real on-screen size (a common "measured too early" timing bug — likely
needs to wait a frame, or re-run the fit calculation after the container is
confirmed laid out, rather than computing it immediately on render).

This matters beyond cosmetics: a first-time visitor has no reason to know
"click Fit and it'll be fine" — a broken first impression is a real problem,
not a minor visual glitch. Fix the actual timing bug rather than just
documenting the workaround.

## What "done" means
Same as last time: check this against a real device, not just code review.
The whole reason this brief exists is that layout issues like this only show
up on a real screen. Test the Photos page and Person page specifically on an
actual phone-width and iPad-width viewport (or real devices) before
considering this finished — screenshots from the user are how these issues
were caught the first time, and they'll be checking on real devices again.
