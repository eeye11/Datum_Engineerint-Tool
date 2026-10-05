/*
 * A dimension was still named "Horizontal 1".
 *
 * The label entry for the new types never landed: the typeLabel table
 * ends with its final entry and the closing "[type]" on ONE line, and
 * the pattern was written expecting a line break between them. So the
 * table had no entry for "dimension", the lookup fell through to the
 * type string, and addObject numbered the features by that - producing
 * "Horizontal 1" and "Vertical 2" in the Features list.
 *
 * That matters more than a naming slip. The Features list is how a
 * student finds a dimension to select, edit or delete, and a column of
 * "Horizontal"s and "Vertical"s gives them no way to do any of that,
 * nor to tell the dimensions apart.
 *
 * The measurement's own label is not lost - it is on the dimension as
 * it is drawn, which is where a reader of the drawing expects it. A
 * feature's NAME identifies the feature; the measurement describes it.
 */
const fs = require("fs");

const path = "js/engineering-drawing/drawing-state.js";
let source = fs.readFileSync(path, "utf8");

const CRLF = source.includes("\r\n");
const eol = (text) => (CRLF ? text.replace(/\n/g, "\r\n") : text);

const before = eol(
  `            "coordinate-system-2d": "2D Coordinate System"
        }[type] || type;`,
);

const after = eol(
  `            "coordinate-system-2d": "2D Coordinate System",
            /*
             * Named as FEATURES, not as measurements.
             *
             * A dimension is "Dimension 1" in the Features list
             * however it happens to be measured, because that list is
             * how a student finds a dimension to select, edit or
             * delete. Named after the measurement instead, a list of
             * them read as a column of "Horizontal"s with no way to
             * tell them apart.
             *
             * The measurement's own label is not lost: it is on the
             * dimension as it is drawn. A feature's NAME identifies
             * the feature; the measurement describes it.
             */
            dimension: "Dimension",
            annotation: "Annotation"
        }[type] || type;`,
);

if (!source.includes(before)) {
  console.log("typeLabel tail not found");
  process.exit(1);
}

fs.writeFileSync(path, source.replace(before, after));
console.log("dimension and annotation named as features");
