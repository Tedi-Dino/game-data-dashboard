// Guards the admin allow-list: the same UID is duplicated in three places that
// cannot import each other (Firestore rules, Cloud Functions, browser config).
// Forgetting one of them produces a confusing half-broken state, so assert they
// stay identical. Run with: node --test tools/tests/
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(path.join(repoRoot, rel), "utf8");

// UIDs are Firebase Auth strings: 28 chars of [A-Za-z0-9]
const UID_RE = /[A-Za-z0-9]{28}/g;

const uidsIn = (text) => [...new Set(text.match(UID_RE) || [])].sort();

describe("admin UID consistency", () => {
  it("firestore.rules, functions/index.js and js/config/constants.js agree", () => {
    const rules = uidsIn(read("firestore.rules"));
    const functionsSrc = uidsIn(
      read("functions/index.js").split("const FUNCTION_LIMITS")[0]
    ); // ADMIN_UIDS block only — later files contain unrelated base64-ish strings
    const constants = uidsIn(read("js/config/constants.js"));

    assert.deepEqual(rules, functionsSrc, "firestore.rules vs functions/index.js");
    assert.deepEqual(rules, constants, "firestore.rules vs js/config/constants.js");
    assert.ok(rules.length >= 1, "expected at least one admin UID");
  });

  it("js/config/constants.js uses a real array literal", () => {
    const src = read("js/config/constants.js");
    const match = src.match(/export const ADMIN_UIDS = \[([\s\S]*?)\];/);
    assert.ok(match, "ADMIN_UIDS declaration not found");
    assert.equal(
      (match[1].match(/'/g) || []).length % 2,
      0,
      "unbalanced quotes in ADMIN_UIDS"
    );
  });
});

// A3: the AI prompt exists in two places that cannot import each other
// (Cloud Function vs browser fallback). They were byte-identical at audit time
// apart from the wrapping declaration; a silent drift would make the two paths
// recommend differently. Compare the prompt body line by line.
describe("AI prompt copy consistency (A3)", () => {
  const promptBody = (rel, startMarker) => {
    const lines = read(rel).split("\n");
    const start = lines.findIndex((l) => l.includes(startMarker));
    assert.ok(start >= 0, `prompt start marker not found in ${rel}`);
    const body = [];
    for (let i = start; i < lines.length; i++) {
      body.push(lines[i]);
      if (lines[i].includes("请严格按照以下JSON格式返回")) {
        // include through the closing backtick + a couple of trailing lines
        for (let j = i + 1; j < lines.length && j <= i + 4; j++) {
          body.push(lines[j]);
          if (lines[j].includes("`")) break;
        }
        break;
      }
    }
    return body;
  };

  it("browser and Cloud Function prompt bodies stay identical", () => {
    const fnBody = promptBody("functions/index.js", "你是一个资深的影音娱乐推荐助手");
    const webBody = promptBody(
      "js/services/recommendations.js",
      "你是一个资深的影音娱乐推荐助手"
    );

    assert.ok(fnBody.length > 10, "prompt body unexpectedly short");
    assert.equal(fnBody.length, webBody.length, "prompt line count drifted");

    // First line carries the differing wrapper (`const prompt = \`` vs
    // `return { ..., prompt: \``); compare only the text after the backtick.
    const strip = (l) => l.slice(l.indexOf("`"));
    assert.equal(strip(webBody[0]), strip(fnBody[0]), "prompt opening line drifted");

    for (let i = 1; i < fnBody.length; i++) {
      assert.equal(webBody[i], fnBody[i], `prompt line ${i + 1} drifted`);
    }
  });
});

describe("Steam ID consistency", () => {
  it("STEAM_ID matches across functions/index.js, index.html, the Python tool and the local sync runner", () => {
    const fn = read("functions/index.js").match(/const STEAM_ID = "(\d{17})"/);
    const html = read("index.html").match(/(7656\d{13})/);
    const py = read("tools/steam_info/steam_info.py").match(/DEFAULT_STEAM_ID = '(\d{17})'/);
    const sync = read("tools/steam_sync/sync.mjs").match(/const STEAM_ID = '(\d{17})'/);

    assert.ok(fn, "STEAM_ID not found in functions/index.js");
    assert.ok(html, "Steam ID not found in index.html");
    assert.ok(py, "DEFAULT_STEAM_ID not found in tools/steam_info/steam_info.py");
    assert.ok(sync, "STEAM_ID not found in tools/steam_sync/sync.mjs");

    assert.equal(html[1], fn[1], "Steam ID drifted between function and page");
    assert.equal(py[1], fn[1], "Steam ID drifted between function and Python tool");
    assert.equal(sync[1], fn[1], "Steam ID drifted between function and the local sync runner");
  });
});
