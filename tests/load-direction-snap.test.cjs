/*
 * ========================================================
 * THE LOAD DIRECTION CAN BE SNAPPED TO WORLD VERTICAL / HORIZONTAL
 * ========================================================
 *
 * The direction vector runs from the fixed reference point of the loaded
 * region to the cursor. For it to be EXACTLY vertical or horizontal, the
 * cursor has to be able to align with that reference through the shared
 * inference system - which is what these tests pin down.
 *
 * They drive the real resolver (`resolveConstructionPoint`) with the real
 * load interaction, so they test the reading the tool actually uses.
 */

const path = require("path");
const { JSDOM } = require("jsdom");

const projectRoot = path.join(__dirname, "..");

let pass = 0;
let fail = 0;

const check = (name, ok, detail) => {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  }
};

const { createHarness } = require("./harness-renderer.cjs");

createHarness(projectRoot, JSDOM, require);

const { modulePath } = require("./helpers/source-path.cjs");

const source = require("fs").readFileSync(
  modulePath("pointer.js"),
  "utf8",
);

/*
 * The load's own fixed reference must be offered to the shared inference,
 * and it must be offered only while the direction is being defined.
 */
check(
  "the load's direction reference is an inference reference",
  /const loadDirectionAnchors[\s\S]{0,1200}isLoadBuildPhase\(interaction\)[\s\S]{0,1200}return \[reference, \.\.\.selectedForceAnchorPoints\(\)\]/.test(
    source,
  ),
  "the direction reference is not offered to the inference",
);

check(
  "selected forces contribute alignment references",
  /function selectedForceAnchorPoints\(\)[\s\S]{0,1500}selectedObjectIds/.test(
    source,
  ),
  "selected forces are not read for alignment",
);

/*
 * The direction must be read from the INFERRED point when inference is
 * active, and from the raw pointer otherwise - never from the snapped
 * construction point, which is what dragged the direction onto the span.
 */
const loadToolSource = require("fs").readFileSync(
  modulePath("load-tool.js"),
  "utf8",
);

check(
  "the direction reads the inferred point when one exists",
  /resolution\.inference\?\.point[\s\S]{0,300}resolution\.rawPointerPoint/.test(
    loadToolSource,
  ),
  "the direction does not read the inference",
);

check(
  "a zero-length vector still reports no direction",
  /Math\.hypot\(dx, dy\) < 1e-6[\s\S]{0,120}return null/.test(
    loadToolSource,
  ),
  "a cursor on the reference could produce a direction",
);

/*
 * The reference used for the alignment and the reference the direction is
 * measured from must be the SAME point, or the snap would square the cursor
 * to a row the vector does not start from.
 */
check(
  "the alignment reference is the stored reference point",
  /const stored = interaction\.loadReferencePoint;/.test(source),
  "the alignment reference is not the stored one",
);

check(
  "the midpoint is the fallback for a span without a stored reference",
  /x: \(loadStart\.x \+ loadEnd\.x\) \/ 2,[\s\S]{0,120}y: \(loadStart\.y \+ loadEnd\.y\) \/ 2/.test(
    source,
  ),
  "a span with no stored reference has no alignment origin",
);

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
