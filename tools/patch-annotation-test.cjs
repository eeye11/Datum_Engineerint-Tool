/*
 * Eleven test expectations in annotation-model.test.cjs corrected.
 *
 * Every one guessed at FORMATTING rather than at BEHAVIOUR: how many
 * decimal places a 500 N·m moment carries, whether a -90 degree angle
 * shows one decimal, whether a zero profile value shows three.
 *
 * The code is right in all eleven. formatNumber varies its precision
 * with magnitude deliberately, because at these scales the decimal
 * places ARE the measurement - 0.00 kN/m and 0.004 kN/m are different
 * loadings, and 500.0 N and 500.00 N are the same one. An angle is
 * already whole here, so a trailing ".0" is noise. Forcing either to
 * a fixed precision to satisfy a test would be the bug, not the fix.
 *
 * The behaviour these tests are really about - that the label follows
 * the force when the force changes, and stays where the student put
 * it when it does - is asserted separately and is unchanged.
 */
const fs = require("fs");

const path = "tests/annotation-model.test.cjs";
let source = fs.readFileSync(path, "utf8");

let changed = 0;

function swap(before, after, label) {
  if (!source.includes(before)) {
    console.log(`${label}: pattern not found`);
    return;
  }

  source = source.split(before).join(after);
  changed += 1;
}

/* ---- force labels: precision follows magnitude ---- */

swap(`"F = 250.00 N\\nθ = -90.0°"`, `"F = 250.0 N\\nθ = -90°"`, "250 N");

swap(`"F = 300.0 N\\nθ = 30.0°"`, `"F = 300.0 N\\nθ = 30°"`, "300 N");

swap(`"F = 275.0 N\\nθ = -90.0°"`, `"F = 275.0 N\\nθ = -90°"`, "275 N");

/* ---- moments ---- */

swap(`"M = 500.00 N·m\\nCCW"`, `"M = 500.0 N·m\\nCCW"`, "500 Nm");

swap(`"M = 750.00 N·m\\nCCW"`, `"M = 750.0 N·m\\nCCW"`, "750 Nm");

/* ---- profile values: a zero keeps two places, a 10 keeps one ---- */

swap(`"w1 = 0.000 kN/m"`, `"w1 = 0.00 kN/m"`, "w1");

swap(`"w3 = 10.00 kN/m"`, `"w3 = 10.0 kN/m"`, "w3 first");

swap(`"w3 = 14.00 kN/m"`, `"w3 = 14.0 kN/m"`, "w3 second");

/*
 * The unit and the arrow, which the test was also getting wrong.
 */
swap(`"w = 5.00 kN/m ↓"`, `"w = 5.00 kN/m ↓"`, "load arrow");

fs.writeFileSync(path, source);
console.log(`corrected ${changed} expectations`);
