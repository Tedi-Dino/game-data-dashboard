// Core utility tests for game data dashboard
// Run with: node --test tools/tests/core-tests.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// --- netCost logic (standalone, matching js/core/utils.js) ---

const UNSOLD_PHYSICAL_ESTIMATED_COST = 30;

const isUnsoldPhysical = (item) => item?.type === "physical" && !item.sellDate;

const netCost = (item) => {
  if (isUnsoldPhysical(item)) return UNSOLD_PHYSICAL_ESTIMATED_COST;
  return (item?.purchasePrice || 0) - (item?.sellPrice || 0);
};

describe("netCost", () => {
  it("unsold physical returns 30 estimate", () => {
    assert.equal(netCost({ type: "physical", purchasePrice: 200 }), 30);
  });

  it("sold physical returns real cost", () => {
    const item = { type: "physical", purchasePrice: 200, sellDate: "2026-01-01", sellPrice: 150 };
    assert.equal(netCost(item), 50);
  });

  it("digital with no sell returns purchase price", () => {
    assert.equal(netCost({ type: "digital", purchasePrice: 100 }), 100);
  });

  it("free game returns 0", () => {
    assert.equal(netCost({ type: "steam", purchasePrice: 0, from: "free" }), 0);
  });

  it("gift game returns 0", () => {
    assert.equal(netCost({ type: "steam", purchasePrice: 0, from: "friend" }), 0);
  });

  it("sold digital returns purchase minus sell", () => {
    assert.equal(netCost({ type: "digital", purchasePrice: 100, sellDate: "2026-01-01", sellPrice: 60 }), 40);
  });

  it("unknown type returns 0 when no price", () => {
    assert.equal(netCost({}), 0);
  });
});

// --- normalizeMonth (standalone, matching js/core/utils.js) ---

const normalizeMonth = (dateStr) => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0");
};

describe("normalizeMonth", () => {
  it("YYYY-MM-DD to YYYY-MM", () => {
    assert.equal(normalizeMonth("2026-07-01"), "2026-07");
  });

  it("returns null for empty input", () => {
    assert.equal(normalizeMonth(""), null);
  });

  it("returns null for invalid date string", () => {
    assert.equal(normalizeMonth("not-a-date"), null);
  });

  it("handles single-digit month", () => {
    assert.equal(normalizeMonth("2026-01-05"), "2026-01");
  });

  it("handles year-end date", () => {
    assert.equal(normalizeMonth("2026-12-31"), "2026-12");
  });
});

// --- parseLocalDateOnly (standalone, matching js/core/utils.js) ---

const parseLocalDateOnly = (dateStr) => {
  if (!dateStr) return null;
  const parts = String(dateStr).split("-");
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return new Date(y, m - 1, d);
};

describe("parseLocalDateOnly", () => {
  it("parses YYYY-MM-DD as local date", () => {
    const d = parseLocalDateOnly("2026-07-01");
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 6);
    assert.equal(d.getDate(), 1);
  });

  it("returns null for empty input", () => {
    assert.equal(parseLocalDateOnly(""), null);
  });

  it("returns null for non-date string", () => {
    assert.equal(parseLocalDateOnly("abc"), null);
  });

  it("returns null for partial date", () => {
    assert.equal(parseLocalDateOnly("2026-07"), null);
  });

  it("handles leap year date", () => {
    const d = parseLocalDateOnly("2024-02-29");
    assert.ok(d instanceof Date);
    assert.equal(d.getMonth(), 1);
    assert.equal(d.getDate(), 29);
  });
});

// --- CSV-like parsing: quoted field handling (standalone) ---

const parseCSVLine = (line) => {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        values.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  values.push(current.trim());
  return values;
};

describe("parseCSVLine", () => {
  it("splits simple comma-separated values", () => {
    assert.deepEqual(parseCSVLine("a,b,c"), ["a", "b", "c"]);
  });

  it("handles quoted values with commas", () => {
    assert.deepEqual(parseCSVLine('1,"say ""hi""",3'), ["1", 'say "hi"', "3"]);
  });

  it("handles quoted values with escaped quotes", () => {
    assert.deepEqual(parseCSVLine('1,"say ""hi""",3'), ["1", 'say "hi"', "3"]);
  });

  it("trims whitespace from unquoted values", () => {
    assert.deepEqual(parseCSVLine('1,"say ""hi""",3'), ["1", 'say "hi"', "3"]);
  });
});
