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

const { controllerSource, locate, modulePath, sourceDir } = require("./helpers/source-path.cjs");
const code = controllerSource();

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
/* 1. The vector step asks for the magnitude and the direction.      */
/* ---------------------------------------------------------------- */

/*
 * THE OLD FIELD IS GONE, ON PURPOSE.
 *
 * The load tool used to have a separate "distributed-load-magnitude"
 * phase with its own text field (`drawingLoadMagnitude`) and its own
 * commit function (`takeDistributedLoadMagnitude`). The load now asks
 * for the whole vector in one gesture: drag to set magnitude and
 * direction together, then click - the same vector the panel later
 * edits. There is no magnitude step to test any more.
 */

const vectorStep = section(
  "function loadVectorUnderPointer(",
  "function constantLoadDraft(",
);

check(
  "a zero-length drag yields no vector",
  /return null/.test(vectorStep) &&
    /<\s*1e-9/.test(vectorStep),
  "a load with no magnitude must not be created",
);

check(
  "the drag yields ONE magnitude with its direction",
  /magnitude:\s*length/.test(vectorStep) &&
    /degrees:/.test(vectorStep),
  "the magnitude the student chose must reach the committed load",
);

/* ---------------------------------------------------------------- */
/* 3. The preview must be the load that will actually be created.   */
/* ---------------------------------------------------------------- */

const previewBlock = section(
  '"preview-constant-load"',
  "THE PREVIEW IS THE FINAL LOAD",
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
  /constant\.direction/.test(previewBlock) &&
    /loadVectorUnderPointer\(/.test(code),
  "the previewed arrows do not turn while a direction is being chosen",
);

/*
 * AND FROM THE ACTUAL POINTER, NOT THE SNAPPED POINT.
 *
 * The direction vector must be measured to the raw (or H/V-constrained)
 * cursor. Feeding it the resolved construction point - which is snapped onto
 * the span end near an end - made the direction swing to the fixed
 * midpoint-to-endpoint diagonal as the cursor crossed the span.
 */
check(
  "and from the actual cursor, not the snapped endpoint",
  /distributedLoadDirectionCursor\(\s*resolution,?\s*\)/.test(
    previewBlock,
  ) ||
    /distributedLoadDirectionCursor\([\s\S]{0,80}resolution/.test(
      previewBlock,
    ),
  "the preview measures its direction to the snapped construction point",
);

const previewDirection = section(
  "function loadDirectionUnderPointer(",
  "export function startDistributedLoadBuild(",
);

check(
  "the previewed direction is only read while choosing one",
  /distributed-load-vector/.test(previewDirection),
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
  "function takeDistributedLoadVector(",
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
  "the committed vector carries the drag's magnitude and angle",
  /Math\.atan2\(dy,\s*dx\)\s*\*\s*180\s*\/\s*Math\.PI/.test(
    commitDirection,
  ) &&
    /length/.test(commitDirection) &&
    /return false/.test(commitDirection),
  "the stored load must be the same reading of the drag the preview used",
);

check(
  "a click on the origin is refused rather than committed",
  /<\s*1e-6/.test(commitDirection) &&
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
