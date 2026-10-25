# Firebase Security Model

> Updated 2026-10-18 for the Spark (free) plan. The previous revision described the
> Blaze setup (App Check enforced for Firestore, Cloud Functions doing the writes).
> That is no longer true and would mislead anyone auditing the live site.

## Overview

The app uses Firebase for authentication and Firestore for storage. On Spark the
Cloud Functions backend is not usable (billing disabled), so the security
boundary is exactly two things: Firestore rules and the admin UID check inside
them. Everything in the browser is UX, not enforcement.

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

### 4. Cloud Functions — billing disabled (stale metadata may remain)

`functions/` is frozen reference code for the optional Blaze path. Billing is
disabled (`billingEnabled=false`), so there is no working Functions backend:
`firebase functions:list` can still show the three legacy **ACTIVE** function
entries from the paid period, but the Cloud Scheduler API returns **403**. Treat
those entries as metadata, not as running jobs; do not assume callables or the
daily sync are available.

If the project ever returns to Blaze, the original model applies again: admin UID
check at the start of each callable, App Check with limited-use tokens, per-admin
cooldown and daily quotas, secrets in Secret Manager, and input validation before
any external API call. The Cloud Functions runtime service account also needs
`roles/firebaseappcheck.tokenVerifier`.

### 5. Client-Side UI (Defense in Depth)

- Admin-only actions are hidden from non-admin users (Steam sync button, AI panel)
- Client-side hiding is NOT a security boundary — it is UX only
- True security relies on Firestore Rules

## Client-Side Data Handling

- **CSV import** (`js/services/csv-parse.js`) runs before any Firestore write.
  It caps input at 5 MB / 5000 rows / 64 columns, rejects duplicate headers and
  ids, invalid dates, out-of-range numbers and control characters, and reports
  skipped rows instead of silently dropping them.
- **CSV export** prefixes leading `= + - @` text with an apostrophe so Excel and
  Sheets render it as text rather than executing it. Import removes that guard,
  so the stored value is unchanged.
- **Bulk replace** suppresses intermediate renders while it deletes/inserts, but
  it keeps the newest Firestore snapshot that arrived during the import and
  applies it afterwards. Dropping that snapshot left the table and charts stuck
  on pre-import (or mid-delete) data.
- **AI fallback** on Spark calls DeepSeek directly from the admin's browser with
  the admin's own key. The request aborts after 60 seconds; the key stays in
  `localStorage` and is visible to anyone using that browser profile (known
  trade-off, admin-only UI).

## Repository Hygiene (2026-10-25 maintenance)

A full working-tree + all-history **file/blob** scan found no private keys,
service-account JSON, Steam API key, DeepSeek key, cloud tokens or personal email
addresses in file contents (the scrub tests use a synthetic `example.invalid`
fixture). The only credential-shaped strings are:

- the Firebase **web API key** in `js/config/firebase.js` (public client config,
  not a private key);
- the Firebase CLI's **installed-app OAuth client id/secret** in the local tools
  (shipped publicly inside `firebase-tools`, not a user secret).

A separate audit of **git commit metadata** found one private address reused as
author/committer across all 89 commits. The value is deliberately not reproduced
in this repository. The one annotated tag also has a tagger email outside the
author/committer scope. `tools/history_email_scrub/` is a dry-run-by-default tool
that rewrites author/committer emails only, in an isolated bare mirror, and
verifies trees/names/dates/messages; it has **not** been run against this repo.
Rewriting refs cannot remove the address from existing clones, forks, reflogs or
hosting caches.

Real data batches are now data, not code: `tools/create_items/batch.json`,
`tools/bind_steam_ids/bindings.json` and
`tools/update_unsold_physical_estimates/repairs.json` are gitignored, with
`*.example.json` placeholders committed. `tools/dump_items/out/` and
`tools/steam_info/output/` are ignored too. Historical game names, prices and
Steam IDs that were already committed stay in git history by design — they are
the same data the public dashboard shows. The email metadata is the exception:
see `docs/archive/security-report-2026-10-25.md` for the scrub plan.

## Key Principle

The client-side read-only UI is a convenience, not a security measure. Always
enforce write permissions at the Firestore level.
