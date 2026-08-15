Replace app.js only.

This patch does not alter relationships, tree layout, face boxes, SQL or CSS.
It makes all person images use the same thumbnail-first display path and records the displayed photo size so generated face thumbnails and fallback crops line up across People, Tree, Profile and sidebars.
