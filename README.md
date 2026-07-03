# Family Graph v3

Clean baseline rebuild. No database changes.

Copy `index.html`, `app.js`, and `style.css` into the repository root. Keep your existing `config.js`.

Main changes:
- single, clean JavaScript file with duplicate functions removed
- dashboard is a real home page
- people list is alphabetical
- person profile page added
- clicking a person in People/Tree opens their profile
- login can be linked to an existing person record
- admin tab is hidden unless role is owner/editor/family editor
- tree/profile/admin portraits are forced circular and not stretched
- Relationship Assistant retained and simplified
- face detector now times out instead of hanging forever

After copying:
1. Commit and push.
2. Open the site.
3. Press Ctrl+F5.
4. Check Dashboard, People, Photos, Tree, Relationships and Admin.
