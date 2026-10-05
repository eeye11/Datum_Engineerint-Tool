/*
 * A one-off patch helper.
 *
 * The edit tool cannot operate on drawing.js - it is a 1.1 MB,
 * 33k-line file and the tool's matcher fails on it - so the
 * cross-cutting edits to that one file are applied by exact
 * string replacement here. Every replacement is EXACT (no fuzzy
 * matching) and the script refuses to write if a target is not
 * found exactly once, so a stale anchor fails loudly instead of
 * corrupting the file.
 *
 * Usage: node tools/apply-patch.cjs <patch.json>
 * Each patch entry: { file, find, replace, count }
 */
const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "..");

const patchFile = process.argv[2];

if (!patchFile) {
  console.error("usage: node tools/apply-patch.cjs <patch.json>");
  process.exit(2);
}

const patches = JSON.parse(
  fs.readFileSync(path.resolve(projectRoot, patchFile), "utf8"),
);

let failed = false;

for (const patch of patches) {
  const full = path.resolve(projectRoot, patch.file);

  let source = fs.readFileSync(full, "utf8");

  const occurrences = source.split(patch.find).length - 1;

  const expected = patch.count === undefined ? 1 : patch.count;

  if (occurrences !== expected) {
    console.error(
      `FAIL ${patch.file}: found ${occurrences} occurrence(s) of the anchor, expected ${expected}`,
    );
    failed = true;
    continue;
  }

  source = source.split(patch.find).join(patch.replace);

  fs.writeFileSync(full, source, "utf8");

  console.log(`ok   ${patch.file} (${occurrences} replacement(s))`);
}

if (failed) {
  process.exit(1);
}
