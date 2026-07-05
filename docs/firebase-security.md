# Firebase Security Model

## Overview

The app uses Firebase for authentication, Firestore for data storage, and Cloud Functions for backend logic. Security is enforced at multiple layers.

## Security Layers

### 1. Firebase Authentication (Client)

- Google Sign-In via Firebase Auth
- Admin UIDs hardcoded in `js/config/constants.js` (`ADMIN_UIDS`)
- Non-admin users are restricted client-side: FAB hidden, form actions disabled

### 2. Firestore Rules (Server)

Firestore rules should be configured in the Firebase Console or `firestore.rules` if committed to the repo. The expected rule strategy:

- **Read**: Anyone (authenticated or not) can read the `items` collection
- **Write**: Only authenticated users with admin UID can write
- **Metadata**: `metadata/*` collections follow the same pattern

The rules template (in Firebase Console or `firestore.rules`):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read: if true;
      allow write: if request.auth != null
        && request.auth.uid in ["ZPyHfPGUI4elNvRN2Q30ZqfzT6X2"];
    }
  }
}
```

### 3. Cloud Functions (Server)

- Admin UID check at the start of each callable function
- Secrets managed via Firebase Secret Manager (not in source code)
- Functions validate input length/types before processing

### 4. Client-Side UI (Defense in Depth)

- Admin-only actions are hidden from non-admin users
- But client-side hiding is NOT a security boundary — it is UX only
- True security relies on Firestore Rules and Cloud Function auth checks

## Key Principle

The client-side read-only UI is a convenience, not a security measure.
Always enforce write permissions at the Firestore/Functions level.
