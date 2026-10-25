// Auth UI state tests.
// Run with: node --test tools/tests/auth-state.test.mjs
//
// Regression guard: js/ui/auth.js once lost its `let userId = null;` declaration
// while keeping `setUserId()` / `isAdmin()`. Because ES modules are strict mode,
// the assignment threw ReferenceError inside `onAuthStateChanged`, so a
// successful Google sign-in never reached `updateAuthUI` — the popup closed and
// the header still said "登录".
//
// The real module can't be imported here (it pulls Firebase from gstatic), so we
// strip the import lines and evaluate the production body under strict mode,
// which reproduces module semantics closely enough for this check.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const makeEl = () => {
  const classes = new Set();
  return {
    classes,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, force) => (force ? classes.add(c) : classes.delete(c)),
    },
    disabled: false,
    title: "",
    src: "",
    hidden: false,
    textContent: "",
    tabIndex: -1,
    setAttribute() {},
    removeAttribute() {},
    querySelector: () => null,
    querySelectorAll: () => [],
  };
};

const loadAuthModule = (adminUid) => {
  const source = readFileSync(path.join(repoRoot, "js/ui/auth.js"), "utf8")
    .replace(/^import[^\n]*\n/gm, "")
    .replace(/^export /gm, "");

  const els = {
    "login-btn": makeEl(),
    "user-info": makeEl(),
    "user-avatar": makeEl(),
    "items-table-body": makeEl(),
    "add-item-fab": makeEl(),
    "import-btn": makeEl(),
    "delete-btn": makeEl(),
    "save-btn": makeEl(),
    "steam-sync-btn": makeEl(),
    ".fab-container": makeEl(),
  };

  const sandbox = {
    console,
    ADMIN_UIDS: [adminUid],
    PLATFORM_COLORS: { steam: "#1b2838", switch: "#e60012" },
    FEATURES: { STEAM_SYNC: false },
    auth: {},
    document: {
      getElementById: (id) => els[id] || null,
      querySelector: (sel) => els[sel] || null,
      dispatchEvent: () => true,
    },
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    __els: els,
    __exports: {},
  };
  sandbox.globalThis = sandbox;

  vm.runInNewContext(
    `'use strict';\n${source}\n__exports.isAdmin = isAdmin;\n__exports.updateAuthUI = updateAuthUI;`,
    sandbox,
    { filename: "auth.js" }
  );

  return { api: sandbox.__exports, els };
};

describe("auth UI state", () => {
  const ADMIN = "admin-uid-123";
  const { api, els } = loadAuthModule(ADMIN);

  it("starts logged out without throwing", () => {
    assert.equal(Boolean(api.isAdmin()), false);
    assert.equal(els["login-btn"].classList.contains("hidden"), false);
  });

  it("switches the header to logged-in state", () => {
    assert.doesNotThrow(() => api.updateAuthUI({ uid: ADMIN, displayName: "Admin", photoURL: "" }));
    assert.equal(els["login-btn"].classList.contains("hidden"), true);
    assert.equal(els["user-info"].classList.contains("hidden"), false);
    assert.equal(els["user-info"].classList.contains("flex"), true);
    assert.equal(api.isAdmin(), true);
  });

  it("builds a local avatar instead of hitting a third-party service", () => {
    assert.match(els["user-avatar"].src, /^data:image\/svg\+xml/);
  });

  it("returns to logged-out state on sign-out", () => {
    assert.doesNotThrow(() => api.updateAuthUI(null));
    assert.equal(els["login-btn"].classList.contains("hidden"), false);
    assert.equal(els["user-info"].classList.contains("hidden"), true);
    assert.equal(Boolean(api.isAdmin()), false);
  });

  it("never grants admin to a non-admin uid", () => {
    api.updateAuthUI({ uid: "someone-else", displayName: "Guest" });
    assert.equal(Boolean(api.isAdmin()), false);
  });

  it("hides write controls for non-admins", () => {
    assert.equal(els["add-item-fab"].disabled, true);
    assert.equal(els["items-table-body"].classList.contains("readonly-table"), true);
  });
});
