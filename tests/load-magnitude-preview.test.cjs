/*
 * ========================================================
 * DOES SPECIFYING A MAGNITUDE WORK, AND DOES IT SHOW THE REAL LOAD?
 * ========================================================
 *
 * Two reports came out of the intensity step:
 *
 *   1. The magnitude did nothing. The field listened for Enter and nothing
 *      else, so tabbing away, clicking the sheet, or any rebuild of the panel
 *      discarded the number and the tool sat on "Specify load magnitude"
 *      looking broken. It read as though the field were not connected at all.
 *   2. When it did work, what it showed was not the load the student was
 *      about to get. The preview carried a null direction, so the arrows were
 *      drawn in the renderer's fallback direction - and once the student was
 *      choosing a direction, the arrows did not turn at all. A preview that
 *      disagrees with the result is worse than none, because the student is
 *      shown a load that does not exist.
 *
 * The load is now previewed from the pointer's own direction about the same
 * midpoint the commit uses, and the field commits on 'change' - every way of
 * leaving a number, not just one key.
 *
 * These are checked against the source because the drawing module needs a
 * live canvas and a real pointer stream; what is asserted here is the
 * wiring, which is what was actually broken.
 */
const fs = require("fs");
const path = require("path");

const code = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "js",
    "engineering-drawing",
    "drawing.js",
  ),
  "utf8",
);

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

/*
 * THE SOURCE BETWEEN TWO MARKERS, so a check cannot be satisfied by an
 * unrelated occurrence of the same name somewhere else in a 17k-line file.
 */
const section = (startMarker, endMarker) => {
  const start = code.indexOf(startMarker);

  if (start < 0) {
    return "";
  }

  const end = code.indexOf(endMarker, start + startMarker.length);

  return code.slice(start, end < 0 ? undefined : end);
};

console.log("load magnitude + preview");

/* ---------------------------------------------------------------- */
/* 1. The intensity field must commit however the value is left.    */
/* ---------------------------------------------------------------- */

const magnitudeField = section(
  'id="drawingLoadMagnitude"',
  "function renderComponentTree",
);

check(
  "the intensity field is rendered on the magnitude step",
  magnitudeField.length > 0,
  "no markup for drawingLoadMagnitude was found",
);

check(
  "the intensity field listens for change, not only Enter",
  /addEventListener\(\s*"change"/.test(magnitudeField),
  "a number left by tab, click or blur is still discarded",
);

check(
  "the intensity field still accepts Enter",
  /"Enter"/.test(magnitudeField),
  "Enter is the one path a student will try first",
);

check(
  "the intensity field takes focus so it can be typed into",
  /input\.focus\(\)/.test(magnitudeField),
  "the student is told to specify a magnitude but has to go and find the box",
);

/* ---------------------------------------------------------------- */
/* 2. A rejected value must not advance the tool.                   */
/* ---------------------------------------------------------------- */

const takeMagnitude = section(
  "function takeDistributedLoadMagnitude(",
  "function takeDistributedLoadDirection(",
);

check(
  "a magnitude at or below zero is refused",
  /value\s*<=\s*0/.test(takeMagnitude),
  "a zero or negative intensity would be a load that does nothing",
);

check(
  "a non-numeric magnitude is refused",
  /Number\.isFinite\(value\)/.test(takeMagnitude),
  "text in a numeric field must not become NaN intensity",
);

check(
  "a refused magnitude leaves the tool on the magnitude step",
  /return false/.test(takeMagnitude) &&
    !/"distributed-load-direction"/.test(
      takeMagnitude.slice(0, takeMagnitude.indexOf("return false") + 40),
    ),
  "the tool advanced past a value it rejected",
);

check(
  "an accepted magnitude moves on to direction",
  /"distributed-load-direction"/.test(takeMagnitude),
  "an accepted intensity should advance the workflow",
);

/* ---------------------------------------------------------------- */
/* 3. The preview must be the load that will actually be created.   */
/* ---------------------------------------------------------------- */

const previewBlock = section(
  '"preview-constant-load"',
  "setToolMessage(",
);

check(
  "the preview is built for the constant load",
  /preview-constant-load/.test(previewBlock),
  "no preview is produced for a distributed load",
);

check(
  "the preview is over the selected region only",
  /start:\s*constant\.start/.test(previewBlock) &&
    /end:\s*constant\.end/.test(previewBlock),
  "the preview ignores the span the student chose",
);

check(
  "the preview no longer hard-codes a null direction",
  !/direction:\s*null/.test(previewBlock),
  "the previewed arrows cannot be the arrows the student gets",
);

check(
  "the preview takes its direction from the pointer",
  /direction:\s*loadDirectionUnderPointer\(\)/.test(
    previewBlock,
  ),
  "the previewed arrows do not turn while a direction is being chosen",
);

const previewDirection = section(
  "function loadDirectionUnderPointer(",
  "function startDistributedLoadBuild(",
);

check(
  "the previewed direction is only read while choosing one",
  /distributed-load-direction/.test(previewDirection),
  "a direction is being invented for steps that have not reached one",
);

check(
  "the previewed direction is measured from the region midpoint",
  /distributedLoadRegionMidpoint\(\)/.test(
    previewDirection,
  ),
  "aiming from the pointer's own position would move the load as it is aimed",
);

check(
  "the previewed direction is a unit vector, like the committed one",
  /dx:\s*dx\s*\/\s*length/.test(previewDirection) &&
    /dy:\s*dy\s*\/\s*length/.test(previewDirection),
  "a preview direction of a different shape to the stored one will disagree on the first edit",
);

check(
  "a pointer resting on the origin previews no direction",
  /length\s*<\s*1e-6/.test(previewDirection),
  "aiming at the midpoint would preview a zero-length vector",
);

/* ---------------------------------------------------------------- */
/* 4. Preview and commit must agree, or the preview is a lie.       */
/* ---------------------------------------------------------------- */

const commitDirection = section(
  "function takeDistributedLoadDirection(",
  "function constantLoadDraft(",
);

const sharedOrigin = (() => {
  const previewOrigin = previewDirection.indexOf(
    "distributedLoadRegionMidpoint()",
  );

  const commitOrigin = commitDirection.indexOf(
    "origin",
  );

  return previewOrigin >= 0 && commitOrigin >= 0;
})();

check(
  "the preview and the commit are measured from the same origin",
  sharedOrigin,
  "the preview aims from one point and the commit from another",
);

check(
  "the committed direction is a unit vector too",
  /dx:\s*dx\s*\/\s*length/.test(commitDirection) &&
    /dy:\s*dy\s*\/\s*length/.test(commitDirection),
  "the stored direction must be the same shape as the previewed one",
);

check(
  "a click on the origin is refused rather than committed",
  /Math\.hypot\(dx,\s*dy\)\s*<\s*1e-6/.test(commitDirection) &&
    /return false/.test(commitDirection),
  "a load with no direction is not a load",
);

/* ---------------------------------------------------------------- */
/* 5. No partial load may survive a cancel.                         */
/* ---------------------------------------------------------------- */

const commitLoad = section(
  "function commitConstantLoad(",
  "function distributedLoadPanelMarkup(",
);

check(
  "an incomplete load is not committed",
  /return false/.test(commitLoad),
  "a load can be created before its body, span, intensity and direction are known",
);

console.log(
  `\n${pass} passed, ${fail} failed`,
);

if (fail > 0) {
  process.exitCode = 1;
}
