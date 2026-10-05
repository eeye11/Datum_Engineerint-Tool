/*
 * The axis test was inverted.
 *
 * Two spans whose y values are EQUAL lie at the same height, so the
 * gap between them is HORIZONTAL. Two spans whose x values are equal
 * stand side by side, so the gap between them is VERTICAL - which is
 * the case in the test, and the pair was being reported the other way
 * round.
 *
 * The reading is now stated the way it is reasoned about: equal in one
 * axis means the separation lies in the other.
 */
const fs = require("fs");

const path = "js/engineering-drawing/measurement-core.js";
let source = fs.readFileSync(path, "utf8");

const before = `      const horizontal =
        Math.abs(spanA.start.y - spanB.start.y) < 1e-9
          ? "vertical"
          : Math.abs(spanA.start.x - spanB.start.x) < 1e-9
            ? "horizontal"
            : null;`;

const after = `      /*
       * Equal in one axis means the separation lies in the other.
       *
       * Two spans at the same height are separated HORIZONTALLY; two
       * spans side by side are separated VERTICALLY. Stated that way
       * round it is one rule rather than two cases, and it is the
       * rule a reader means by "how far apart are these".
       */
      const separation =
        Math.abs(spanA.start.y - spanB.start.y) < 1e-9
          ? "horizontal"
          : Math.abs(spanA.start.x - spanB.start.x) < 1e-9
            ? "vertical"
            : null;`;

if (!source.includes(before)) {
  console.log("pattern not found");
  process.exit(1);
}

source = source.replace(before, after);

source = source.replace(
  `      return horizontal
        ? [horizontal, "linear"]
        : ["linear"];`,
  `      return separation
        ? [separation, "linear"]
        : ["linear"];`,
);

fs.writeFileSync(path, source);
console.log("the separation axis is now read the right way round");
