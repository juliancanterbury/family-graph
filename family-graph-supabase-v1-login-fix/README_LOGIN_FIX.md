# Supabase v1 Login Fix

Fixes:

- sendLogin is now exposed to the browser for inline onclick.
- updateSide uses safe DOM access so it does not crash on login screen.
- The app no longer dies before login.

Commit message:

Fix Supabase login startup errors
