# Firebase Security Model

## Overview

The app uses Firebase for authentication, Firestore for data storage, and Cloud Functions for backend logic. Security is enforced at multiple layers.

## Security Layers

### 1. Firebase Authentication (Client)

- Google Sign-In via Firebase Auth
- Admin UIDs hardcoded in `js/config/constants.js` (`ADMIN_UIDS`)
- Non-admin users are restricted client-side: FAB hidden, form actions disabled

### 2. Firestore Rules (Server)

Firestore rules are committed in `firestore.rules` and deployed through `firebase.json`.

- **Read**: Anyone (authenticated or not) can read the `items` collection
- **Write**: Only authenticated users with admin UID can write
- **Metadata**: only dashboard-facing metadata documents are publicly readable
- **Steam playtime**: dashboard collections are readable; writes are Cloud Functions only
- **Default**: all other collections are denied

App Check enforcement is enabled for Firestore. Public reads must carry a valid
App Check token issued through the production reCAPTCHA Enterprise provider.
The provider and browser API key accept only the two Firebase Hosting domains.
Local development must use an App Check debug token instead of adding localhost
to the production key allowlist.

### 3. Cloud Functions (Server)

- Admin UID check at the start of each callable function
- App Check enforcement with replay-protected limited-use tokens
- The Cloud Functions runtime service account must have the
  `roles/firebaseappcheck.tokenVerifier` role. Without it, valid App Check
  requests fail as `functions/unauthenticated` before the callable handler runs.
- Per-admin cooldown and daily quotas before external API calls
- Explicit instance and concurrency caps
- Secrets managed via Firebase Secret Manager (not in source code)
- Functions validate input length/types before processing

For this project, grant the role with:

```bash
gcloud projects add-iam-policy-binding game-data-dashboard \
  --member="serviceAccount:84289557335-compute@developer.gserviceaccount.com" \
  --role="roles/firebaseappcheck.tokenVerifier"
```

### 4. Client-Side UI (Defense in Depth)

- Admin-only actions are hidden from non-admin users
- But client-side hiding is NOT a security boundary — it is UX only
- True security relies on Firestore Rules and Cloud Function auth checks

## Key Principle

The client-side read-only UI is a convenience, not a security measure.
Always enforce write permissions at the Firestore/Functions level.
