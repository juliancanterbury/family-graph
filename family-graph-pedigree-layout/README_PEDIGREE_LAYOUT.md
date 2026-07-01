# Family Graph Pedigree Layout

Replaces the crude graph renderer with a pedigree-style renderer.

Rules:
- Children are drawn only under their exact parent group.
- Andrew + Lisa can have Henry / Isabella without making them children of Paul + Jean.
- Siblings sit on the same generation.
- Partners sit beside each other.
- Parent, partner, and sibling lines are visually distinct.

For Barbara White:
Barbara White sibling of Jean Canterbury.

For Henry / Isabella:
Andrew Canterbury parent of Henry / Isabella.
Lisa Canterbury parent of Henry / Isabella.

Commit message:
Replace graph renderer with pedigree layout
