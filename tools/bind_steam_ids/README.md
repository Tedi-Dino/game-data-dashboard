# tools/bind_steam_ids

One-off migration helper that PATCHes `steam_app_id` onto existing `items`
documents through the Firestore REST API (Firebase CLI OAuth token).

**Default is dry-run.** Only `--apply` writes.

```bash
cp tools/bind_steam_ids/bindings.example.json tools/bind_steam_ids/bindings.json
# fill in real fb_id -> app id bindings
node tools/bind_steam_ids/bind_steam_ids.js          # preview
node tools/bind_steam_ids/bind_steam_ids.js --apply  # write
node tools/bind_steam_ids/bind_steam_ids.js --data other.json
```

`bindings.json` holds `{ bindings, unmatchedSteam, unboundItems }`. Only
`bindings` is written; the other two arrays are printed for reference. The file
contains personal library data and is gitignored — never commit it.
