/*
 * Two defects in the dimension/annotation wiring.
 *
 *  1. THE CONTENT BLOCK WAS DROPPED.
 *
 *     A dimension was created and appeared in the document, but with
 *     no `content` at all - so it had no source references, no
 *     placement, and nothing to measure from. It was a feature that
 *     could not be dimensioned, which is a contradiction rather than
 *     a partial feature.
 *
 *     The cause is createGeometryObject, which builds its result from
 *     a fixed list of fields. Anything else a caller passes is
 *     discarded, and it does that deliberately - it is what stops a
 *     caller smuggling an unexpected field into a feature. That is
 *     the right default, and it means a new kind of feature has to be
 *     ADDED there rather than worked around.
 *
 *  2. DIMENSIONS WERE NAMED AFTER THEIR MEASUREMENT.
 *
 *     The list read "Horizontal 1", "Vertical 2" rather than
 *     "Dimension 1". The name came from the model's own default,
 *     which is the measurement's label - correct for a panel heading,
 *     wrong for a feature identity. In the Features list a student
 *     would see a column of "Horizontal"s and have no way to tell
 *     them apart, and no way to find "the dimension" at all.
 *
 *     The fix names them as features, which is what they are. The
 *     measurement's own label is still available where it belongs -
 *     on the dimension as it is drawn.
 */
const fs = require("fs");

const path = "js/engineering-drawing/drawing-state.js";
let source = fs.readFileSync(path, "utf8");

const CRLF = source.includes("\r\n");
const eol = (text) => (CRLF ? text.replace(/\n/g, "\r\n") : text);

let changed = 0;

function swap(before, after, label) {
  const from = eol(before);

  if (!source.includes(from)) {
    console.log(`${label}: pattern not found`);
    return;
  }

  source = source.replace(from, eol(after));
  changed += 1;
}

/* ---- 1. the type labels ---- */

swap(
  `            coordinateSystem2D: "2D Coordinate System"
        }[type] || type;`,
  `            coordinateSystem2D: "2D Coordinate System",
            /*
             * Named as FEATURES, not as measurements.
             *
             * A dimension is named "Dimension 1" in the Features list
             * however it happens to be measured, because that list is
             * how a student finds a dimension to select, edit or
             * delete. Naming them after the measurement produced a
             * column of "Horizontal"s and "Vertical"s, with no way to
             * tell them apart and no way to find one by looking for a
             * dimension. The measurement's own label is on the
             * dimension as it is drawn, which is where it belongs.
             */
            dimension: "Dimension",
            annotation: "Annotation"
        }[type] || type;`,
  "type labels",
);

/* ---- 2. the content block survives creation ---- */

swap(
  `            style: createStyle(options.style),
            metadata: options.metadata || {}`,
  `            style: createStyle(options.style),
            metadata: options.metadata || {},

            /*
             * A feature's own non-geometric data, kept whole.
             *
             * A dimension's references and placement, and an
             * annotation's text and source, are not geometry and are
             * not style - but they are the feature. This object
             * returns a fixed set of fields on purpose, so that a
             * caller cannot smuggle an unexpected one in; a feature
             * that needs more than the set has to be added here
             * rather than worked around.
             *
             * Copied rather than referenced, so that the feature
             * cannot be changed by writing to the model it came from,
             * and so that it survives a round trip through
             * serialisation with its own contents rather than a live
             * reference to something that will not be there.
             */
            ...(options.content
                ? {
                    content: JSON.parse(
                        JSON.stringify(options.content)
                    )
                }
                : {}),`,
  "content field",
);

fs.writeFileSync(path, source);
console.log(
  `applied ${changed} of 2 corrections (file is ${CRLF ? "CRLF" : "LF"})`,
);
