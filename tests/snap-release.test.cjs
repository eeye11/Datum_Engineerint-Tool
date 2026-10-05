/*
 * ========================================================
 * DOES THE SNAP LET GO WHEN THE CURSOR DOES?
 * ========================================================
 *
 * Three separate complaints about snapping, with one thing in common: the
 * tool kept claiming something after the cursor had stopped agreeing.
 *
 *   1. Snapping is too sensitive. Fifteen pixels catches the next feature
 *      along while the student is passing it, and a tolerance that is too
 *      wide cannot be escaped by aiming more carefully.
 *   2. The snap does not release. Leaving a target left the guide up for
 *      260 ms, which on screen is the tool naming a relationship the
 *      pointer had plainly left.
 *   3. The inference label is stale. Same cause, and worse in text: a
 *      label persists in the eye far longer than a guideline does.
 *
 * The 260 ms figure was defended as a drafting aid that "must not vanish
 * the instant it stops being true". But the snap has already been TAKEN
 * by the time the guide is drawn - the guide is a picture of a decision,
 * not the decision. So the hold was showing a claim that was already
 * false, and the status bar printed it in words.
 *
 * What is checked here:
 *   - the tolerance is small enough that a cursor travelling along a
 *     member passes its targets rather than being captured by them;
 *   - the point tolerance and the alignment tolerance are independent, so
 *     tightening the point snap cannot silently tighten alignment;
 *   - the guide does not outlive the cursor by more than one frame;
 *   - no per-tool tolerance exists, so the same aim behaves the same way
 *     whichever tool is armed.
 */
const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "..");

let pass = 0;
let fail = 0;

const check = (name, ok, detail) => {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(
      `  FAIL ${name}${detail ? `\n       ${detail}` : ""}`,
    );
  }
};

const source = fs.readFileSync(
  path.join(
    projectRoot,
    "js",
    "engineering-drawing",
    "object-snap.js",
  ),
  "utf8",
);

const stateSource = fs.readFileSync(
  path.join(
    projectRoot,
    "js",
    "engineering-drawing",
    "drawing-state.js",
  ),
  "utf8",
);

const drawingSource = fs.readFileSync(
  path.join(
    projectRoot,
    "js",
    "engineering-drawing",
    "drawing.js",
  ),
  "utf8",
);

const number = re => {
  const found = re.exec(code);

  return found ? Number(found[1]) : NaN;
};

/*
 * THE COMMENTS ARE NOT CODE, AND MUST NOT BE READ AS CODE.
 *
 * Each of these three checks is about the absence of a value - a tolerance
 * that must not be stored, a helper that must not be called, a return that
 * must not be the only one. All three pass trivially in a file that
 * mentions the thing only in prose explaining why it was removed, which is
 * precisely what happened the first time these ran: the comment
 * "`tolerancePx: 10`, which quietly overrode..." satisfied a search for
 * `tolerancePx: 10`.
 *
 * So the comments are stripped first and only what would actually execute
 * is searched. A check that can be satisfied by documentation is not a
 * check.
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

const code = stripComments(source);
const stateCode = stripComments(stateSource);
const drawingCode = stripComments(drawingSource);

console.log("\n  the point tolerance is small\n");

const pointTolerance = number(
  /const SNAP_TOLERANCE_PX = ([\d.]+)/,
);
check(
  "the snap tolerance is stated as a number",
  Number.isFinite(pointTolerance),
  `read: ${pointTolerance}`,
);

check(
  "it is about five pixels, not fifteen",
  pointTolerance === 5,
  `tolerance is ${pointTolerance}px`,
);

/*
 * WHY FIVE AND NOT ZERO. A tolerance that is too narrow is recoverable -
 * the student zooms in and the target grows - whereas one that is too wide
 * is not: the cursor is caught by the wrong thing and every attempt to
 * escape makes it worse. So the test is not "is five generous enough" but
 * "is five small enough that two adjacent targets can be told apart".
 */
check(
  "it is narrow enough to distinguish nearby targets",
  pointTolerance <= 6,
  `${pointTolerance}px cannot tell two targets ${pointTolerance}px apart`,
);

console.log("\n  and alignment is not dragged along with it\n");

const alignment = number(
  /const ALIGNMENT_TOLERANCE_PX = ([\d.]+)/,
);

check(
  "the alignment band is stated on its own",
  Number.isFinite(alignment),
  `read: ${alignment}`,
);

check(
  "alignment is still comfortably wider than point snapping",
  alignment > pointTolerance * 2,
  `alignment ${alignment}px vs point ${pointTolerance}px`,
);

/*
 * THE INDEPENDENCE IS THE POINT.
 *
 * The alignment band used to be `max(27, pointTolerance * 1.5)`. That
 * couples them: narrowing the point tolerance to fix the stickiness would
 * have taken alignment down with it to 7.5px, which is too tight to feel
 * like it works, so the complaint would have moved rather than gone. It has
 * to read as a stated number, not a multiple of another one.
 */
check(
  "the alignment band is not a multiple of the point tolerance",
  !/ALIGNMENT_TOLERANCE_PX[^;]*\*[^;]*getTolerancePx/.test(
    code,
  ),
  "deriving one band from the other means tightening one tightens both",
);

console.log("\n  the state does not carry a second copy\n");

/*
 * `tolerancePx: 10` sat in the document state, and `getTolerancePx`
 * prefers a configured value over its own floor - so the number actually in
 * force was neither the engine's constant nor the one its author would
 * have expected, and editing the engine's constant changed nothing at all.
 */
check(
  "the state carries no point tolerance",
  !/tolerancePx\s*:\s*\d/.test(stateCode),
  (stateCode.match(/tolerancePx\s*:\s*\d[^\n]*/) || [])[0],
);

check(
  "the state carries no alignment tolerance either",
  !/inferenceTolerancePx\s*:\s*\d/.test(stateCode),
);

console.log("\n  no tool gets a wider band\n");

/*
 * A per-tool tolerance means a snap behaves differently depending on which
 * tool is armed while doing the same aim - and there is nothing on screen
 * to say the tolerance changed. The table had one entry, a truss.
 */
check(
  "there is no per-tool tolerance multiplier in use",
  !/TOOL_SNAP_TOLERANCE_MULTIPLIER\s*=\s*\{[^}]*\w+\s*:/.test(
    code,
  ),
  (code.match(/TOOL_SNAP_TOLERANCE_MULTIPLIER\s*=\s*\{[^}]*\}/) ||
    [])[0],
);

console.log("\n  the guide does not outlive the cursor\n");

const hold = number(
  /const GUIDELINE_HOLD_MS = (\d+)/,
);

check(
  "the hold is under a tenth of a second",
  Number.isFinite(hold) && hold <= 100,
  `hold is ${hold}ms - long enough to read a label that is already untrue`,
);

/*
 * THE BRANCH THAT COULD NOT CHANGE THE ANSWER.
 *
 * `holdGuideline` ended with two branches that both returned `fresh`, one
 * of them behind a `sameInferenceTarget` test whose two exits were
 * identical. The test decided nothing, while reading as though a settled
 * guide were held while the cursor ranged around its target.
 */
check(
  "the guide holds only on the timer, not on a target test",
  !/sameInferenceTarget/.test(code),
  "a branch that cannot change the answer is a branch that will mislead the next reader",
);

console.log("\n  the status bar keeps the tool's own instruction\n");

/*
 * THE SHAPE OF THE STATUS LINE.
 *
 * It used to return the snap label ALONE, so "Specify second point"
 * became "Horizontal" and the student was left with a statement about
 * geometry and no idea what the tool was asking them to do.
 */
check(
  "the snap status is appended to the instruction, not returned alone",
  /feedback\.length[\s\S]{0,200}fallback/.test(drawingCode),
  "the instruction must be the base of the message, not its alternative",
);

check(
  "an empty snap leaves the instruction alone",
  /return\s*\([\s\S]{0,120}?\)\s*:\s*fallback/.test(
    drawingCode,
  ) || /:\s*fallback\s*;/.test(drawingCode),
  "with no snap the status must be exactly the tool's instruction",
);

check(
  "the labels stay terse, since they are now a suffix",
  !/:\s*"Horizontal snap"/.test(drawingCode),
);

console.log(
  `\n${pass} passed, ${fail} failed\n`,
);

if (fail) {
  process.exitCode = 1;
}
