/*
 * Registers Dimension and Annotation as real document object types.
 *
 * Without this they are not features at all. addObject is the only way
 * a feature enters the document, and it mints an identity and a name
 * from the factory table - so a type missing from that table is a type
 * the document cannot hold, whatever else is built on top of it.
 *
 * Both are added as factories rather than as special cases, so they
 * are created, named, selected, deleted, undone and serialised by the
 * same code as a line or a beam. That is the point: a dimension is a
 * feature on the drawing, not a decoration the renderer paints over
 * one.
 *
 * The measurements and the text live in a `content` block rather than
 * in the geometry, because they are not geometry. A dimension's
 * references say what it measures and its position says where it is
 * drawn, and neither is a shape. Keeping them out of the geometry is
 * what stops a dimension's own placement being confused with the
 * geometry it measures - and it is why moving a dimension cannot move
 * what it measures.
 *
 * NOTE ON LINE ENDINGS
 * --------------------
 * This file uses CRLF. Several earlier patches of this shape missed
 * against it, which is worth recording: a multi-line literal written
 * with LF will never match a CRLF file however correct the code is.
 * The line endings are preserved as the file's own rather than
 * silently rewriting the whole file to LF.
 */
const fs = require("fs");

const path = "js/engineering-drawing/drawing-state.js";
let source = fs.readFileSync(path, "utf8");

const CRLF = source.includes("\r\n");

let changed = 0;

/*
 * Patterns are authored with LF and converted to the file's own line
 * endings before matching. Without this a correct multi-line pattern
 * can never match a CRLF file, and the patch reports "not found" while
 * the code beside it is perfectly fine.
 */
const eol = (text) => (CRLF ? text.replace(/\n/g, "\r\n") : text);

function swap(before, after, label) {
  const from = eol(before);

  if (!source.includes(from)) {
    console.log(`${label}: pattern not found`);
    return;
  }

  source = source.replace(from, eol(after));
  changed += 1;
}

/* ---- 1. the factories ---- */

swap(
  `        }
    };`,
  `        },

        /*
         * A dimension and an annotation, as ordinary features.
         *
         * Both go through the feature factories rather than being
         * built inline, so they are named, numbered, selected,
         * deleted and undone by exactly the same code as every other
         * feature. A dimension is a feature on a drawing, not a
         * decoration painted over one.
         *
         * The models are reached by name rather than captured,
         * because drawing-state loads before them and a direct
         * reference would make the load order something that could be
         * got wrong - and a wrong one would throw at creation time
         * and take the drawing down with it.
         */
        dimension: (options = {}) => {
            const created =
                window.enggDimensionModel
                    .createDimension(options);

            return createGeometryObject(
                "dimension",
                {},
                {
                    id: created.id,
                    name: created.name,

                    /*
                     * Carried through unchanged, so the object on the
                     * drawing IS the model rather than a copy of it
                     * that could drift away from it.
                     */
                    content: {
                        dimensionType: created.dimensionType,
                        sourceRefs: created.sourceRefs,
                        label: created.label,
                        orientation: created.orientation,
                        resolved: created.resolved
                    }
                }
            );
        },

        annotation: (options = {}) => {
            const created =
                window.enggAnnotationModel
                    .createAnnotation(options);

            return createGeometryObject(
                "annotation",
                {},
                {
                    id: created.id,
                    name: created.name,

                    content: {
                        annotationKind:
                            created.annotationKind,
                        textMode: created.textMode,
                        text: created.text,
                        sourceFeatureId:
                            created.sourceFeatureId,
                        anchorRef: created.anchorRef,
                        placement: created.placement,
                        placementMode:
                            created.placementMode,
                        leader: created.leader,
                        visible: created.visible
                    }
                }
            );
        }
    };`,
  "factories",
);

/* ---- 2. exposing the models the factories need ---- */

swap(
  `        polygonVertices,
        serializeDrawing
    };`,
  `        polygonVertices,
        serializeDrawing,

        /*
         * The measurement, dimension and annotation models, reached
         * through the one namespace the application already uses.
         *
         * Getters rather than the modules themselves, so a consumer
         * that read one at load time does not end up holding
         * undefined because it was not defined yet.
         */
        get measurement() {
            return window.enggMeasurement;
        },
        get dimensionModel() {
            return window.enggDimensionModel;
        },
        get annotationModel() {
            return window.enggAnnotationModel;
        }
    };`,
  "model exports",
);

fs.writeFileSync(path, source);
console.log(
  `applied ${changed} of 2 corrections (file is ${CRLF ? "CRLF" : "LF"})`,
);
