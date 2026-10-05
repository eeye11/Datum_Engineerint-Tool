
const path = require("path");

const { loadModule, locate, modulePath, sourceDir } = require("./helpers/source-path.cjs");
/*
 * Crash recovery, tested against a stubbed localStorage.
 *
 * The interesting cases are the ones where storage misbehaves -
 * private browsing refuses it, a quota is full, an earlier version
 * left something damaged behind - because recovery is a
 * convenience and must never be the reason the application will not
 * start. Every one of those has to return quietly rather than throw.
 */

let store = {};
const storage = { unavailable: false };

global.window = {
  localStorage: {
    getItem(key) {
      if (storage.unavailable) throw new Error("denied");
      return key in store ? store[key] : null;
    },
    setItem(key, value) {
      if (storage.unavailable) throw new Error("denied");
      store[key] = value;
    },
    removeItem(key) {
      if (storage.unavailable) throw new Error("denied");
      delete store[key];
    }
  },
  setTimeout: () => 1,
  clearTimeout: () => {}
};

loadModule("document-recovery.js");
const r = global.window.enggRecovery;

let pass = 0;
let fail = 0;
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    console.log(
      `  FAIL ${name}\n       expected ${JSON.stringify(expected)}` +
        `\n       actual   ${JSON.stringify(actual)}`
    );
  }
};

const body = {
  objects: [{ id: "a", type: "beam" }],
  units: "mm"
};

console.log("\nNothing stored");
check("nothing to read", r.read(), null);
check("nothing to offer", r.available(), false);
check("nothing to describe", r.describe(), null);

console.log("\nStoring and reading");
check("a write succeeds", r.write(body, "Report.enggdraw"), true);
check("a copy now exists", r.available(), true);
check("it keeps the document", r.read().document, body);
check("it remembers the name", r.read().fileName, "Report.enggdraw");
check("it records a time", Number.isFinite(r.read().savedAt), true);
check("it counts the features", r.describe().features, 1);

console.log("\nDiscarding");
r.discard();
check("the copy is gone", r.available(), false);
check("and cannot be read", r.read(), null);

console.log("\nDamaged copies");
store[r.STORAGE_KEY] = "{not json";
check("corrupt JSON is refused", r.read(), null);
check("and is cleared away", Object.keys(store).length, 0);

store[r.STORAGE_KEY] = JSON.stringify({ savedAt: Date.now() });
check("a record with no document is refused", r.read(), null);

console.log("\nAn old copy");
r.write(body, null);
store[r.STORAGE_KEY] = JSON.stringify({
  savedAt: Date.now() - (r.MAX_AGE_MS + 1000),
  document: body
});
check("an expired copy is refused", r.available(), false);

console.log("\nStorage that refuses");
storage.unavailable = true;
check("reading is survivable", r.read(), null);
check("writing reports failure", r.write(body), false);
check("discarding is survivable", r.discard(), undefined);
check("offering is survivable", r.available(), false);
storage.unavailable = false;

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
