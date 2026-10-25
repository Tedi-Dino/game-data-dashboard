# tools/create_items

Batch-create `items` documents and patch existing ones through the Firestore
REST API, using the Firebase CLI's OAuth token (project-owner credentials).

**Default is dry-run.** Only `--apply` writes.

## Data file

The batch is data, not code. Keep real batches in `batch.json`, which is
gitignored because it contains personal purchase history. Start from the
example:

```bash
cp tools/create_items/batch.example.json tools/create_items/batch.json
# edit batch.json
node tools/create_items/create_items.js                 # preview
node tools/create_items/create_items.js --apply         # write
node tools/create_items/create_items.js --data other.json
```

Shape:

```json
{
  "newItems": [{ "id": "x-0001", "name": "...", "type": "xbox" }],
  "updates":  [{ "fb_id": "<doc id>", "fields": { "rating": 8 } }]
}
```

- `newItems` are POSTed as new documents; Firestore generates the document id.
- `updates` PATCH only the listed fields via `updateMask`.
- `id` must be unique inside the batch. `fb_id` is the Firestore document id.
- Plan against live data first: `node tools/dump_items/dump_items.mjs`.
- After a batch is live, replace/clear the file so a re-run cannot duplicate it.

Never commit `batch.json` or paste its contents into docs, issues or chat.
