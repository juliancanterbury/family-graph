# Family Graph — Tree Engine v2

No SQL/database changes.

Replace these files in the repository root:

- index.html
- app.js
- style.css

This adds a reconfigurable Tree page:

- Family tree
- Focus mode
- Ancestors
- Descendants
- Photo network
- Person focus selector

Important logic change:

- Partner links are never treated as parent/child links.
- Sibling links are used as layout hints only.
- Parent/child connectors attach to the actual child card, not to the centre of a couple.

Use the Tree page controls to switch modes. Click any person card to make them the focus.
