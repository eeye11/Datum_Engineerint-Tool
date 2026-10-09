/*
 * ========================================================
 * A DRAG THAT STARTS ON EXISTING GEOMETRY STILL CREATES
 * ========================================================
 *
 * Verified in a browser (see the report): dragging a Line from a beam's
 * ENDPOINT and from its MIDPOINT both create the Line, with snapping on and
 * off, repeatedly, while a plain click on the same geometry still SELECTS and
 * creates nothing.
 *
 * What can be pinned without a browser is the DECISION logic that makes that
 * work, and it is worth pinning because it is exactly what broke before:
 *
 *   1. a press on existing geometry is ARMED, not refused - so the drag can
 *      start the feature from the pressed point;
 *   2. the session is only kept alive for a phase a release can COMPLETE, and
 *      the phases a press legitimately starts are all listed;
 *   3. a geometric annotate tool arms its anchor on the same gesture.
 *
 * The failure these guard against produced no error at all: the feature simply
 * did not appear and the tool quietly reverted to Select.
 */

const fs = require("fs");

const { locate } = require("./helpers/source-path.cjs");

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

const drag = fs.readFileSync(locate("creation-drag.js"), "utf8");

console.log("\n  a press on existing geometry is ARMED, not refused\n");

check(
  "the press on an existing feature is noted, not turned away",
  /const onExisting =\s*idle &&\s*pressSelectsExistingObject\(event\)/.test(
    drag,
  ),
  "refusing the press is what broke a drag that starts on a beam",
);

check(
  "and it still does not return early",
  !/if \(\s*idle &&\s*pressSelectsExistingObject\(event\)\s*\)\s*\{\s*return false;/.test(
    drag,
  ),
);

check(
  "the note is carried on the session, for the release to read",
  /onExisting\s*\n?\s*\}/.test(drag) || /onExisting,?\s*\n\s*\};/.test(drag),
);

console.log("\n  the session survives only for a phase a release can finish\n");

/*
 * `DRAG_CONTINUE_PHASES` is what decides whether the armed session is kept.
 * A phase a press starts but which is NOT listed is dropped on the first move,
 * and the release then has nothing to commit - which is the silent failure.
 */
const listMatch = drag.match(/const DRAG_CONTINUE_PHASES = \[([\s\S]*?)\];/);

check("the continuation list exists", Boolean(listMatch));

const phases = listMatch
  ? [...listMatch[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1])
  : [];

/* Every phase a drag-tool press can legitimately leave the construction in. */
for (const phase of [
  "first-point",
  "statics-span",
  "arc-centre",
  "arc-sweep",
  "arc-first",
  "arc-second",
  "polygon-centre",
  "polygon-first",
]) {
  check(
    `a release can complete "${phase}"`,
    phases.includes(phase),
    `phases listed: ${phases.join(", ")}`,
  );
}

console.log("\n  the construction is begun from the PRESS's point\n");

check(
  "the press's own resolved point is kept, not re-read on the move",
  /pressResolution:\s*startsHere\s*\n?\s*\?\s*resolvePointerEvent\(event\)/.test(
    drag,
  ),
  "re-reading on the move could snap the start somewhere else",
);

check(
  "and the deferred start uses it",
  /beginOrCompleteGeometry\(\s*\n?\s*session\.pressResolution\s*\n?\s*\)/.test(
    drag,
  ),
);

console.log("\n  a geometric annotate tool arms on the same gesture\n");

check(
  "the anchor is begun on the first real movement",
  /beginAnnotateDragAnchor\(/.test(drag),
);

check(
  "from the anchor the press recorded",
  /const resolution = session\.pressResolution;/.test(drag),
);

console.log("\n  the release distinguishes a click from a drag\n");

check(
  "a press that never travelled is left to the click pipeline",
  /if \(!session\.moved\) \{\s*\n\s*return false;/.test(drag),
);

check(
  "a travelled press commits at the released point",
  /DRAG_CONTINUE_PHASES\.includes\([\s\S]{0,120}?beginOrCompleteGeometry\(/.test(
    drag,
  ),
);

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
