/*
 * ========================================================
 * ONE PHYSICAL FILE, ONE RECENT ENTRY
 * ========================================================
 *
 * The duplication seen in the list - the same `triangle.enggdraw` three times,
 * one of them "File not found" - came from the identity. Entries were keyed on a
 * file HANDLE when one was available and on the name when it was not, and a
 * handle cannot survive being stored: localStorage holds JSON, and a
 * FileSystemFileHandle is not JSON. So the SAME file was recorded under two
 * different keys depending on which route reached it, and a later re-open
 * produced a third entry beside a stale "not found" one.
 *
 * The rules pinned here:
 *
 *   - recording the same file twice leaves ONE entry, moved to the top
 *   - the identity is the file's name, normalised, and nothing that cannot be
 *     stored
 *   - a list ALREADY containing duplicates collapses on read, so an existing
 *     duplicated list heals without waiting for the file to be reopened
 *   - a missing file updates its existing entry rather than adding a second
 */

const { JSDOM } = require("jsdom");

const { modulePath } = require("./helpers/source-path.cjs");

let pass = 0;
let fail = 0;

const check = (name, ok, detail) => {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  }
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://datum.test/",
});

global.window = dom.window;
global.document = dom.window.document;

const recents = require(modulePath("recent-files.js")).default;

const doc = (id) => ({
  units: "mm",
  sheets: [{ id, name: "Sheet 1", objects: [{ id: "o", type: "line" }] }],
  activeSheetId: id,
});

function reset() {
  recents.clear();

  /* The store is localStorage; a fresh start for each scenario. */
  try {
    window.localStorage.removeItem(recents.STORAGE_KEY);
  } catch (error) {
    /* Nothing to clear. */
  }
}

console.log("\n  the same file recorded twice is ONE entry\n");

{
  reset();

  recents.remember({ name: "triangle.enggdraw", document: doc("s1") });
  recents.remember({ name: "triangle.enggdraw", document: doc("s1") });

  const list = recents.list();

  check(
    "opening the same file twice leaves one entry",
    list.length === 1,
    `${list.length} entries: ${list.map((e) => e.fileName).join(", ")}`,
  );

  check(
    "and the entry is at the top",
    list[0] && list[0].fileName === "triangle.enggdraw",
  );
}

console.log("\n  recording with and without a handle is the SAME entry\n");

{
  reset();

  /* Without a handle - the Import route. */
  recents.remember({ name: "triangle.enggdraw", document: doc("s1") });

  /* With one - the Save As / File System Access route. */
  recents.remember({
    name: "triangle.enggdraw",
    handle: { name: "triangle.enggdraw" },
    document: doc("s1"),
  });

  check(
    "a handle does not create a second identity",
    recents.list().length === 1,
    `${recents.list().length} entries`,
  );

  check(
    "the handle is still kept on the entry",
    recents.list()[0].hasHandle === true,
  );
}

console.log("\n  the name is normalised, so case is not a second file\n");

{
  reset();

  recents.remember({ name: "Triangle.enggdraw", document: doc("s1") });
  recents.remember({ name: "triangle.enggdraw", document: doc("s1") });

  check(
    "the same name in different case is one entry",
    recents.list().length === 1,
    `${recents.list().length} entries`,
  );
}

console.log("\n  an ALREADY duplicated list collapses when read\n");

{
  reset();

  /*
   * A list as an older build would have written it: one entry keyed on the
   * name, one keyed on the handle, for the same file.
   */
  const duplicated = [
    {
      key: "triangle.enggdraw",
      fileName: "triangle.enggdraw",
      label: "triangle",
      openedAt: 1000,
      document: doc("s1"),
      missing: true,
    },
    {
      key: "triangle.enggdraw|h:triangle.enggdraw",
      fileName: "triangle.enggdraw",
      label: "triangle",
      openedAt: 2000,
      document: doc("s1"),
    },
    {
      key: "beam.enggdraw",
      fileName: "beam.enggdraw",
      label: "beam",
      openedAt: 1500,
      document: doc("s2"),
    },
  ];

  window.localStorage.setItem(recents.STORAGE_KEY, JSON.stringify(duplicated));

  const list = recents.list();

  check(
    "the duplicated file appears once",
    list.filter((e) => e.fileName === "triangle.enggdraw").length === 1,
    `${list.filter((e) => e.fileName === "triangle.enggdraw").length} entries`,
  );

  check(
    "and the other file is untouched",
    list.some((e) => e.fileName === "beam.enggdraw"),
  );

  const triangle = list.find((e) => e.fileName === "triangle.enggdraw");

  check(
    "the NEWEST record wins, so a stale 'not found' cannot shadow a good one",
    triangle && triangle.missing === false,
    JSON.stringify(triangle && triangle.missing),
  );

  check(
    "the list stays in most-recent-first order",
    list[0].fileName === "triangle.enggdraw" &&
      list[1].fileName === "beam.enggdraw",
    list.map((e) => e.fileName).join(", "),
  );
}

console.log("\n  a file that has gone missing keeps ONE entry\n");

{
  reset();

  recents.remember({ name: "triangle.enggdraw", document: doc("s1") });

  const key = recents.list()[0].key;

  recents.markMissing(key);

  const list = recents.list();

  check(
    "marking it missing does not add an entry",
    list.length === 1,
    `${list.length} entries`,
  );

  check("and it is shown as missing", list[0].missing === true);

  /* Recording it again after it is found clears the flag on the SAME entry. */
  recents.remember({ name: "triangle.enggdraw", document: doc("s1") });

  const after = recents.list();

  check(
    "finding it again reuses the entry",
    after.length === 1 && after[0].missing === false,
    `${after.length} entries, missing=${after[0] && after[0].missing}`,
  );
}

console.log("\n  removal works without the file\n");

{
  reset();

  recents.remember({ name: "triangle.enggdraw", document: doc("s1") });
  recents.markMissing(recents.list()[0].key);

  const key = recents.list()[0].key;

  check("the missing entry can be removed", recents.forget(key) !== false);
  check("and the list is empty", recents.list().length === 0);
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}

void dom;
