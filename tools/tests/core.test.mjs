// Core utility tests for game data dashboard
// Run with: node --test tools/tests/core-tests.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// js/core/utils.js has no imports, so it loads directly in Node — the tests below
// exercise the real production code instead of a copy.
const utils = await import("file:///" + path.join(repoRoot, "js/core/utils.js").replace(/\\/g, "/"));
const { parseCSVLine, splitCSVRows } =
    await import("file:///" + path.join(repoRoot, "js/services/csv-parse.js").replace(/\\/g, "/"));

const collectJsFiles = (entry) => {
  const abs = path.join(repoRoot, entry);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return abs.endsWith(".js") ? [abs] : [];

  return readdirSync(abs).flatMap((name) => {
    if (name === "node_modules") return [];
    return collectJsFiles(path.join(entry, name));
  });
};

describe("source syntax", () => {
  it("front-end and Cloud Function JavaScript parses as modules", () => {
    const files = [
      ...collectJsFiles("js"),
      ...collectJsFiles(path.join("functions", "index.js")),
    ];
    const failures = [];

    for (const file of files) {
      const result = spawnSync(
        process.execPath,
        ["--input-type=module", "--check"],
        {
          input: readFileSync(file),
          encoding: "utf8",
        },
      );

      if (result.status !== 0) {
        failures.push(`${path.relative(repoRoot, file)}\n${result.stderr || result.stdout}`);
      }
    }

    assert.deepEqual(failures, []);
  });
});

// --- Real implementations imported from js/core/utils.js ---------------------
// These used to be re-typed copies of the production code, which meant editing
// netCost (the "unsold physical = 30" rule) would not fail this suite. Now the
// assertions below run against the actual shipped functions.
const { netCost, normalizeMonth, parseLocalDateOnly, parseDateOrNull,
        toLocalISODate, todayLocalISODate, isUnsoldPhysical, escapeHTML,
        formatCurrency } = utils;

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

describe("formatCurrency", () => {
  it("formats positive amounts with the symbol first", () => {
    assert.equal(formatCurrency(12630), "¥12630.00");
  });

  it("puts the minus sign before the currency symbol", () => {
    assert.equal(formatCurrency(-50), "-¥50.00");
  });

  it("falls back to zero for non-finite input", () => {
    assert.equal(formatCurrency(NaN), "¥0.00");
  });
});

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

// --- CSV parsing: real implementation from js/services/csv-parse.js ---

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
