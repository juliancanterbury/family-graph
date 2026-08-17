Family Graph — tester access freeze

Replace app.js only.

Changes:
- Tree tab hidden from non-owner testers.
- Admin tab hidden from non-owner testers.
- Non-owner users cannot open #graph directly; they are redirected to Dashboard.
- Person pages no longer show “Focus in tree” to non-owner testers.
- Existing photo/profile crop code is untouched.

Suggested tester workflow:
1. Andrew/Lisa sign in with their own email.
2. Go to People, open their own person card.
3. Click “Link my login to this person”.
4. Test Photos, People, Relationships and Review.
