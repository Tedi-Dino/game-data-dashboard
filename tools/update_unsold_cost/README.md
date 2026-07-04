# Batch Update: Unsold Physical Games → 30 yuan

## Option 1: Browser Console (Recommended — Easiest)

Open `https://game-data-dashboard.web.app` in your browser, log in, then paste this into the browser console (F12):

```js
// Batch update unsold physical games: purchasePrice → 30, remarks → "预估值"
(async () => {
  const db = firebase.firestore();
  const snapshot = await db.collection('items').get();
  let count = 0;
  let batch = db.batch();
  let batchCount = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.type === 'physical' && !data.sellDate) {
      batch.update(doc.ref, { purchasePrice: 30, remarks: '预估值' });
      count++;
      batchCount++;
      if (batchCount >= 400) { 
        await batch.commit(); 
        batch = db.batch(); 
        batchCount = 0; 
        console.log(`Committed batch, ${count} total so far...`);
      }
    }
  }
  if (batchCount > 0) await batch.commit();
  console.log(`✅ Done! Updated ${count} unsold physical items.`);
})();
```

The page will auto-refresh with the new values.

## Option 2: Node.js Script

```bash
# Preview first
node tools/update_unsold_cost/update_unsold_cost.js --dry-run

# Execute
node tools/update_unsold_cost/update_unsold_cost.js
```

Requires firebase-tools to be authenticated (`firebase login`).
