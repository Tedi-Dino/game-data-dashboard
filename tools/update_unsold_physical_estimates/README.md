# Unsold Physical Estimates - Repair Script

**This is a one-time repair script, not a daily update tool.**

## Purpose

Repairs the accidental migration that wrote the display-only 30-yuan estimate into Firestore purchasePrice for unsold physical cartridges.

## Database Rule

- purchasePrice stores the **real** purchase price.
- Display-only effective spending for unsold physical cartridges is handled in the frontend by netCost(item), not by changing Firestore data.

## Usage

`ash
# Preview affected items (dry-run, no writes)
node tools/update_unsold_physical_estimates/update_unsold_physical_estimates.js

# Apply the fix
node tools/update_unsold_physical_estimates/update_unsold_physical_estimates.js --apply
`

## Caution

Always run without --apply first to verify the affected items. This script is intended for one-time use to revert a specific data migration issue.
