/*
 * ========================================================
 * THE SHARED DEEP COPY
 * ========================================================
 *
 * `deepClone` replaced `JSON.parse(JSON.stringify(x))` written out by hand at
 * twenty-odd sites. The reason it is a FUNCTION and not a habit is one sharp
 * edge, and it is the edge this test exists to pin:
 *
 *     JSON.stringify(undefined) === undefined
 *     JSON.parse(undefined)             THROWS
 *
 * So a feature whose optional sub-object is absent could not be copied, and
 * because copying happens on the way into a SAVE, saving a drawing that
 * contained any annotation failed outright. That defect has already been
 * found once in this codebase the hard way; a shared helper with the case
 * handled is what stops it coming back.
 *
 * The other property that matters is that a copy is a COPY - the two must not
 * share sub-objects, or an edit to one would silently change the other.
 */

const assert = require("node:assert");

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

const clone = require(modulePath("clone.js"));
const { deepClone, deepCloneAll } = clone;

console.log("\n  the absent cases do not throw\n");

check(
  "cloning `undefined` gives `undefined`",
  deepClone(undefined) === undefined,
  "this is the case that broke saving a drawing containing an annotation",
);

check(
  "cloning `null` gives `null`",
  deepClone(null) === null,
);

check(
  "and an object whose sub-object is absent keeps it absent",
  (() => {
    const source = { id: "x" };

    const copy = deepClone(source);

    return (
      copy.id === "x" &&
      !Object.prototype.hasOwnProperty.call(copy, "geometry")
    );
  })(),
  "materialising an empty geometry would change the saved shape",
);

console.log("\n  a copy is a COPY, not a shared reference\n");

check(
  "a nested object is not shared with the original",
  (() => {
    const source = { geometry: { start: { x: 1, y: 2 } } };

    const copy = deepClone(source);

    copy.geometry.start.x = 99;

    return source.geometry.start.x === 1;
  })(),
  "editing the copy must not reach back into the original",
);

check(
  "and a nested array is not shared either",
  (() => {
    const source = { points: [{ x: 1 }, { x: 2 }] };

    const copy = deepClone(source);

    copy.points[0].x = 99;
    copy.points.push({ x: 3 });

    return source.points.length === 2 && source.points[0].x === 1;
  })(),
);

console.log("\n  the array form answers the empty case directly\n");

check(
  "an empty list clones to an empty list",
  Array.isArray(deepCloneAll([])) && deepCloneAll([]).length === 0,
);

check(
  "and a missing list clones to an empty list",
  Array.isArray(deepCloneAll(undefined)) && deepCloneAll(undefined).length === 0,
  "the snapshot paths call this on a list that may be absent",
);

check(
  "a non-empty list is copied element by element",
  (() => {
    const source = [{ a: 1 }, { a: 2 }];

    const copy = deepCloneAll(source);

    copy[0].a = 99;

    return copy.length === 2 && source[0].a === 1;
  })(),
);

console.log("\n  what cannot be copied is an error, not a quiet fallback\n");

check(
  "a cyclic value throws rather than returning something half-copied",
  (() => {
    const source = {};

    source.self = source;

    try {
      deepClone(source);

      return false;
    } catch (error) {
      return true;
    }
  })(),
  "a copy is a copy, or it is an error - never a broken object that looks whole",
);

void assert;

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
