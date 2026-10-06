/*
 * A tiny, exact string-replacement helper for the drawing controller.
 *
 * `edit` on this file has been unreliable because drawing.js is CRLF and
 * very large; this does a plain, exact substring swap on the bytes on
 * disk and fails loudly if the anchor is missing or not unique.
 *
 * Usage: node tools/dev/patch-file.mjs <file> <anchorFile> <replacementFile>
 * The anchor/replacement files are UTF-8; line endings in the replacement
 * are normalised to the target file's.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [target, anchorFile, replacementFile] = process.argv.slice(2);

const text = readFileSync(target, "utf8");
const anchor = readFileSync(anchorFile, "utf8").replace(/\r?\n/g, "\r\n");
const replacement = readFileSync(replacementFile, "utf8").replace(
  /\r?\n/g,
  "\r\n",
);

const first = text.indexOf(anchor);
const last = text.lastIndexOf(anchor);

if (first < 0) {
  console.error("ANCHOR NOT FOUND");
  process.exit(1);
}

if (first !== last) {
  console.error(`ANCHOR NOT UNIQUE (${first} .. ${last})`);
  process.exit(1);
}

writeFileSync(
  target,
  text.slice(0, first) + replacement + text.slice(first + anchor.length),
  "utf8",
);

console.log(
  `patched ${target} (${anchor.length} -> ${replacement.length} chars)`,
);
