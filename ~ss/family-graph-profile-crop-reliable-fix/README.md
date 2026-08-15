Profile crop reliable fix

Replace app.js only. Keep index.html, style.css, config.js.

Changes:
- stores each photo's displayed coordinate base when viewed
- uses that stored base for profile/People/Tree crop calculations
- keeps manual profile-photo selection
- does not touch relationships or tree layout
