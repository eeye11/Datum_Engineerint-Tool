/*
 * Compare two golden-scenario recordings.
 *
 *   node tests/e2e/golden-compare.mjs before.json after.json
 *
 * Prints every scenario step whose output differs, and for each one the
 * first field and character position where the two runs disagree. Exits
 * non-zero when anything differs, so it can gate a refactor.
 */
import fs from "fs";

const [beforeFile, afterFile] = process.argv.slice(2);
const before = JSON.parse(fs.readFileSync(beforeFile, "utf8"));
const after = JSON.parse(fs.readFileSync(afterFile, "utf8"));

function firstDifference(a, b, path = "") {
    if (a === b) return null;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") {
        if (typeof a === "string" && typeof b === "string") {
            let i = 0;
            while (i < a.length && a[i] === b[i]) i++;
            return { path, at: i, before: a.slice(Math.max(0, i - 60), i + 80), after: b.slice(Math.max(0, i - 60), i + 80) };
        }
        return { path, before: JSON.stringify(a)?.slice(0, 200), after: JSON.stringify(b)?.slice(0, 200) };
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
        const found = firstDifference(a[key], b[key], `${path}.${key}`);
        if (found) return found;
    }
    return null;
}

let differing = 0;
for (const step of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const diff = firstDifference(before[step], after[step]);
    if (!diff) continue;
    differing++;
    console.log(`\n✗ ${step}\n  at ${diff.path}${diff.at !== undefined ? ` (char ${diff.at})` : ""}`);
    console.log(`  before: ${diff.before}`);
    console.log(`  after:  ${diff.after}`);
}
const total = new Set([...Object.keys(before), ...Object.keys(after)]).size;
console.log(`\n${total - differing}/${total} steps identical`);
process.exit(differing ? 1 : 0);
