/*
 * Dimensions were named "Horizontal 1" and annotations "Note 1".
 *
 * The type-label table was never the problem - it had the right entry
 * and was never consulted. The wiring factories passed the MODEL's
 * default name to the feature, and the model names a dimension after
 * its measurement ("Horizontal") and an annotation after its kind
 * ("Note"), which are both correct as descriptions and wrong as
 * feature identities.
 *
 * The name a feature is given is decided by addObject, from the
 * feature's TYPE, and then numbered. Passing one in bypasses that
 * entirely - so the factories should not pass one.
 *
 * It matters because the Features list is how a student finds a
 * dimension to select, edit or delete. A column of "Horizontal"s and
 * "Vertical"s gives them no way to tell them apart, and "Note 1" for
 * a force label says nothing about which feature it belongs to.
 *
 * The measurement and the kind are not lost. The measurement's label
 * is on the dimension as it is drawn, and the annotation's kind is what
 * decides what text it reads from its feature.
 */
const fs = require("fs");

const path = "js/engineering-drawing/drawing-state.js";
let source = fs.readFileSync(path, "utf8");

const CRLF = source.includes("\r\n");
const eol = (text) => (CRLF ? text.replace(/\n/g, "\r\n") : text);

let changed = 0;

/* The dimension factory. */
const dimensionBefore = eol(
  `                "dimension",
                {},
                {
                    id: created.id,
                    name: created.name,
`,
);

const dimensionAfter = eol(
  `                "dimension",
                {},

                /*
                 * Only the identity is passed in. The NAME is left
                 * to addObject, which derives it from the feature's
                 * type and numbers it - so dimensions read as
                 * "Dimension 1", "Dimension 2" in the Features list
                 * however they are measured.
                 *
                 * Passing the model's own name bypassed that, and the
                 * model's name is the measurement's label, which is
                 * right for a panel heading and wrong for a feature
                 * identity: a student looking for their dimension in
                 * the list would have found a column of
                 * "Horizontal"s and "Vertical"s.
                 */
                {
                    id: created.id,
`,
);

if (source.includes(dimensionBefore)) {
  source = source.replace(dimensionBefore, dimensionAfter);
  changed += 1;
} else {
  console.log("dimension name line not found");
}

/* The annotation factory. */
const annotationBefore = eol(
  `                "annotation",
                {},
                {
                    id: created.id,
                    name: created.name,
`,
);

const annotationAfter = eol(
  `                "annotation",
                {},

                /* Named by addObject, for the same reason. */
                {
                    id: created.id,
`,
);

if (source.includes(annotationBefore)) {
  source = source.replace(annotationBefore, annotationAfter);
  changed += 1;
} else {
  console.log("annotation name line not found");
}

fs.writeFileSync(path, source);
console.log(`applied ${changed} of 2 corrections`);
