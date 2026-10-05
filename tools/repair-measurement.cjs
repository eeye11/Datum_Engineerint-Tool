/*
 * One-off repair of measurement-core.js.
 *
 * The span and load registrations were written with a bug: the
 * candidate resolver called object(type), which is not in scope, and
 * the span type list was duplicated. Both are rewritten here.
 *
 * Verification-only tooling, applied once, and then deleted.
 */
const fs = require("fs");

const path = "js/engineering-drawing/measurement-core.js";
let source = fs.readFileSync(path, "utf8");

const replacement = `  function registerSpans() {
    ["line", "beam", "cable", "shaft", "force"].forEach(
      (type) => {
        register(type, {
          dimensions: (object) => {
            const span = twoPointSpan(object);

            return span
              ? spanDimensionTypes(span)
              : ["linear"];
          },
          anchorNames: () => ["start", "end"],
          anchors: (object) => {
            const span = twoPointSpan(object);

            return span
              ? { start: span.start, end: span.end }
              : null;
          },
        });
      }
    );
  }`;

const start = source.indexOf("  function registerSpans() {");

if (start === -1) {
  console.log("registerSpans not found");
  process.exit(1);
}

/* Find the matching close brace of that function. */
let depth = 0;
let end = -1;

for (let i = start; i < source.length; i += 1) {
  if (source[i] === "{") depth += 1;
  if (source[i] === "}") {
    depth -= 1;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
}

if (end === -1) {
  console.log("could not find the end of registerSpans");
  process.exit(1);
}

source = source.slice(0, start) + replacement + source.slice(end);

/* The loads registration has the same lazy-resolution bug. */
const loadsStart = source.indexOf("  function registerLoads() {");

if (loadsStart !== -1) {
  let loadsDepth = 0;
  let loadsEnd = -1;

  for (let i = loadsStart; i < source.length; i += 1) {
    if (source[i] === "{") loadsDepth += 1;
    if (source[i] === "}") {
      loadsDepth -= 1;
      if (loadsDepth === 0) {
        loadsEnd = i + 1;
        break;
      }
    }
  }

  const loadsReplacement = `  function registerLoads() {
    ["load", "varying-load"].forEach((type) => {
      register(type, {
        dimensions: (object) => {
          const span = twoPointSpan(object);

          return span
            ? spanDimensionTypes(span, {
                  allowAngular: false
                })
            : ["linear"];
        },
        anchorNames: () => ["start", "end"],
        anchors: (object) => {
          const span = twoPointSpan(object);

          return span
            ? { start: span.start, end: span.end }
            : null;
        },
      });
    });
  }`;

  source =
    source.slice(0, loadsStart) + loadsReplacement + source.slice(loadsEnd);
}

fs.writeFileSync(path, source);

console.log("repaired registerSpans and registerLoads");
