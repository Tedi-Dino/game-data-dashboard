# WARNING - DEPRECATED Update Unsold Physical Games Cost

This script is DEPRECATED and violates the current database rules.

Current rule: Firestore purchasePrice must store the real purchase price.
The frontend netCost(item) handles the 30-yuan estimate display.

## Alternatives

- Fix migrated data: tools/update_unsold_physical_estimates/
- Daily use: No action needed. Frontend auto-calculates estimates.

## Usage

Default dry-run: node tools/update_unsold_cost/update_unsold_cost.js
Force write: node tools/update_unsold_cost/update_unsold_cost.js --apply
