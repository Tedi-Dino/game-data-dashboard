# Unsold Physical Estimates - Repair Script

**This is a one-time repair script, not a daily update tool.**

## Purpose

Repairs the accidental migration that wrote the display-only 30-yuan estimate
into Firestore `purchasePrice` for unsold physical cartridges.

## Database Rule

- `purchasePrice` stores the **real** purchase price.
- Display-only effective spending for unsold physical cartridges is handled in
  the frontend by `netCost(item)`, not by changing Firestore data.

## Data file

The doc-id -> real-price table is local data, not code. Copy the template and
fill it from a known-good backup:

```bash
cp tools/update_unsold_physical_estimates/repairs.example.json \
   tools/update_unsold_physical_estimates/repairs.json
```

`repairs.json` is gitignored because it contains personal purchase prices.

## Usage

```bash
# Preview affected items (dry-run, no writes)
node tools/update_unsold_physical_estimates/update_unsold_physical_estimates.js

# Apply the fix
node tools/update_unsold_physical_estimates/update_unsold_physical_estimates.js --apply

# Use a different local table
node tools/update_unsold_physical_estimates/update_unsold_physical_estimates.js --data other.json
```

## Caution

Always run without `--apply` first to verify the affected items. This script is
intended for one-time use to revert a specific data migration issue.
