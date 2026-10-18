# Firebase Security Model

> Updated 2026-10-18 for the Spark (free) plan. The previous revision described the
> Blaze setup (App Check enforced for Firestore, Cloud Functions doing the writes).
> That is no longer true and would mislead anyone auditing the live site.

## Overview

The app uses Firebase for authentication and Firestore for storage. On Spark there
are **no Cloud Functions**, so the security boundary is exactly two things:
Firestore rules and the admin UID check inside them. Everything in the browser is
UX, not enforcement.

## Security Layers

### 1. Firebase Authentication (Client)

- Google Sign-In via Firebase Auth
- Admin UIDs hardcoded in `js/config/constants.js` (`ADMIN_UIDS`)
- Non-admin users are restricted client-side: FAB hidden, form actions actually
  disabled (`btn.disabled = true` + `.readonly-mode-disabled`, set by
  `js/ui/auth.js`)

### 2. Firestore Rules (Server — the real boundary)

Rules live in `firestore.rules` and are deployed through `firebase.json`.

- **Read**: anyone, authenticated or not, can read `items`, `steamPlaytimeMonths`
  (and its `apps` subcollection) and `steamPlaytimeState`
- **Write**: only an authenticated user whose UID matches the hardcoded admin UID
  can write `items` and the whitelisted `metadata/*` documents
- **`steamPlaytime*` writes are denied to every client** (`allow write: if false`).
  Only privileged credentials — the local sync script running with the Firebase
  CLI's project-owner OAuth token — can write them
- **Default**: everything not matched above is denied

> Because `tools/steam_sync/sync.mjs` authenticates as the project owner, it
> **bypasses these rules entirely**. That is why it dry-runs by default and only
> writes with `--apply`. Never point it at a project you do not own.

### 3. App Check — deliberately UNENFORCED

For this project, `firestore.googleapis.com` App Check enforcement is
`UNENFORCED`, and the browser never initialises App Check
(`FEATURES.APP_CHECK = false`).

Reason: the reCAPTCHA Enterprise token request pulls `www.google.com`, which never
completes on a mainland network. With enforcement on, the SDK waits for a token
that never arrives and every read fails or hangs — the page renders but all data
is empty. See `docs/free-tier-plan.md` §2.1 for the measurements.

Consequence: public reads are not attested. That is acceptable here because the
data is already intentionally public and there is no billable backend to abuse.
Do not re-enable enforcement before confirming token issuance in the App Check
console.

### 4. Cloud Functions — not deployed (Spark)

`functions/` is frozen reference code for the optional Blaze path; it is not
deployed and cannot be. (Leftover gen2 resources from the paid period still show
up in some listings but are not callable with billing disabled.)

If the project ever returns to Blaze, the original model applies again: admin UID
check at the start of each callable, App Check with limited-use tokens, per-admin
cooldown and daily quotas, secrets in Secret Manager, and input validation before
any external API call. The Cloud Functions runtime service account also needs
`roles/firebaseappcheck.tokenVerifier`.

### 5. Client-Side UI (Defense in Depth)

- Admin-only actions are hidden from non-admin users (Steam sync button, AI panel)
- Client-side hiding is NOT a security boundary — it is UX only
- True security relies on Firestore Rules

## Key Principle

The client-side read-only UI is a convenience, not a security measure. Always
enforce write permissions at the Firestore level.
