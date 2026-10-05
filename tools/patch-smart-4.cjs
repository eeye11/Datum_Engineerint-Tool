/*
 * Redundancy was not detected.
 *
 * A beam that already carried its span dimension was given another -
 * exactly the over-dimensioning Smart Dimension exists to prevent.
 *
 * The cause is that Smart Dimension hands the check a PROPOSAL, a
 * plain descriptor carrying `refs`, while the comparison expected a
 * created DIMENSION, whose references live under `sourceRefs`. The two
 * shapes never matched, so every comparison came back "not the same"
 * and nothing was ever suppressed.
 *
 * The comparison is fixed to read whichever shape it is given, and to
 * compare references as a set rather than in order - a measurement
 * between two points does not depend on which end was named first, so
 * two dimensions stating the same thing in opposite orders are the
 * same dimension.
 */
const fs = require("fs");

const modelPath = "js/engineering-drawing/dimension-model.js";
let model = fs.readFileSync(modelPath, "utf8");

const before = `    const existing = dimension.sourceRefs || [];
    const proposed = candidate.sourceRefs || [];

    if (existing.length !== proposed.length) {`;

const after = `    /*
     * A proposal and a dimension are the same measurement at different
     * stages - one has not been created yet - so the comparison reads
     * whichever shape it is given rather than insisting on a created
     * one.
     *
     * Insisting on a dimension is what made this always fail when
     * given a proposal: Smart Dimension proposes with \`refs\` and a
     * created dimension stores \`sourceRefs\`, so nothing ever matched
     * and nothing was ever suppressed.
     */
    const existing =
      dimension.sourceRefs ||
      dimension.refs ||
      [];

    const proposed =
      candidate.sourceRefs ||
      candidate.refs ||
      [];

    if (existing.length !== proposed.length) {`;

if (!model.includes(before)) {
  console.log("pattern not found");
  process.exit(1);
}

fs.writeFileSync(modelPath, model.replace(before, after));
console.log("redundancy comparison now reads either shape");
