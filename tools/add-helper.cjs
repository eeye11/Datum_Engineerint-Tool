/*
 * Adds the local alreadyStated helper.
 *
 * The placement loop asks "is this measurement already on the
 * drawing?" once per candidate, and the alias exists so the question
 * reads as a question at the call site rather than as a module lookup
 * three levels deep. It was omitted when the loop was written.
 */
const fs = require("fs");

const path = "js/engineering-drawing/smart-dimension.js";
let source = fs.readFileSync(path, "utf8");

const marker = "  function withoutRedundancy(";

if (!source.includes(marker)) {
  console.log("withoutRedundancy not found");
  process.exit(1);
}

const helper = `  /*
   * Whether a measurement is already stated.
   *
   * A local alias, because the placement loop asks this once per
   * candidate and the question reads as a question at the call site
   * rather than as a module lookup.
   */
  function alreadyStated(candidate, state) {
    return root.enggDimensionModel.alreadyStated(
      candidate,
      state
    );
  }

`;

source = source.replace(marker, helper + marker);

fs.writeFileSync(path, source);
console.log("alreadyStated helper added");
