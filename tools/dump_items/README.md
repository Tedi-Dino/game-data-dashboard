# tools/dump_items

Read-only dump of the Firestore `items` collection. Never writes. Use it to
reconcile a planned batch against the live collection before running
`tools/create_items`.

```bash
node tools/dump_items/dump_items.mjs                 # one line per item
node tools/dump_items/dump_items.mjs 控制             # regex filter on name
node tools/dump_items/dump_items.mjs --json           # full JSON under out/
node tools/dump_items/dump_items.mjs --json snap.json
```

- `--json` with no path writes `tools/dump_items/out/items-<date>.json`.
- Dumps contain personal purchase data. `tools/dump_items/*.json` and `out/`
  are gitignored; never commit or paste a dump into an issue.
- Authentication reuses the Firebase CLI token through
  `tools/steam_sync/firestore.mjs` (project-owner credentials, bypasses rules).
