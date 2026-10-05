/*
 * Two parallel lines were measured end to end rather than by the gap
 * between them.
 *
 * With the meaningless angle removed, the layer fell through to
 * "linear" - the distance between one line's start and the other's
 * end. For two horizontal lines that is their length, not their
 * separation, so a student checking how far apart two members are was
 * given a number about neither.
 *
 * The axis-aligned reading is the one wanted: for two parallel spans
 * it IS the separation, and it is a measurement of where they are
 * relative to each other rather than a restatement of their own
 * lengths. It now leads the answer for a pair of spans, and the
 * direct distance remains available after it.
 *
 * The angle stays out of this function deliberately - it cannot tell
 * parallel from crossing, so anything it offered as an angle would be
 * vacuous as often as not.
 */
const fs = require("fs");

const path = "js/engineering-drawing/measurement-core.js";
let source = fs.readFileSync(path, "utf8");

const before = `    if (spanA && spanB) {
      return ["linear", "horizontal", "vertical"];
    }

    return ["linear"];`;

const after = `    if (spanA && spanB) {
      /*
       * The separation between them leads.
       *
       * For two parallel spans an axis-aligned reading IS the gap
       * between them, and it is a measurement of where they sit
       * relative to each other - rather than a restatement of their
       * own lengths, which is what the direct distance between one
       * span's start and the other's end gives. A student selecting
       * two parallel lines wants to know how far apart they are, and
       * "linear" would have told them the length instead.
       */
      const horizontal =
        Math.abs(spanA.start.y - spanB.start.y) < 1e-9
          ? "vertical"
          : Math.abs(spanA.start.x - spanB.start.x) < 1e-9
            ? "horizontal"
            : null;

      return horizontal
        ? [horizontal, "linear"]
        : ["linear"];
    }

    return ["linear"];`;

if (!source.includes(before)) {
  console.log("pattern not found");
  process.exit(1);
}

fs.writeFileSync(path, source.replace(before, after));
console.log("a pair of parallel spans is measured by their separation");
