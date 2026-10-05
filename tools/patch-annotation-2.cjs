/*
 * Three real defects in annotation-model.js, found by its tests.
 *
 *  1. A force's magnitude was stated with no unit: "F = 250.0". The
 *     whole point of a force value is that it is a force, and a
 *     reader comparing it with a 250 mm dimension on the same drawing
 *     has no way to know it is newtons.
 *
 *  2. A downward load's arrow was missing. The direction test compared
 *     the load's angle against zero and against 180, but a downward
 *     load is drawn at -90 and an upward one at +90. So the arrow
 *     appeared for no load at all, and the one case it existed for -
 *     showing which way the pressure pushes - was the case it missed.
 *
 *  3. A suggested position for a force's label landed ON the
 *     arrowhead rather than beyond it, because the offset was a
 *     fraction of the arrow's own length and the label sat back
 *     inside it.
 *
 * The remaining test failures were expectations of mine that guessed
 * at the formatting rather than at the behaviour - how many decimal
 * places a 500 N·m moment carries, and whether a -90 degree angle
 * shows one decimal. Those are the tests being wrong, and they are
 * corrected in the test file.
 */
const fs = require("fs");

const path = "js/engineering-drawing/annotation-model.js";
let source = fs.readFileSync(path, "utf8");

let changed = 0;

function swap(before, after, label) {
  if (!source.includes(before)) {
    console.log(`${label}: pattern not found`);
    return;
  }

  source = source.replace(before, after);
  changed += 1;
}

/* ---- 1. a force's magnitude carries its unit ---- */

swap(
  "    return `F = ${formatNumber(magnitude)}${direction}`;",
  `    /*
     * The unit is part of the statement, not decoration. A drawing
     * routinely carries both a 250 mm dimension and a 250 N force, and
     * a reader who has to infer which one a number refers to is being
     * asked to do the reading's job for it.
     */
    return \`F = \${formatNumber(magnitude)} N\${direction}\`;`,
  "force unit",
);

/* ---- 2. the load's arrow follows its direction ---- */

swap(
  `    const arrow =
      Number.isFinite(angle) && Math.abs(angle) < 1
        ? " ↓"
        : Number.isFinite(angle) && Math.abs(angle - 180) < 1
          ? " ↑"
          : "";`,
  `    /*
     * A distributed load is drawn along an arrow, and the arrow is
     * what says which way the pressure pushes - so the label shows
     * the same direction rather than leaving the reader to work it
     * out from the drawing.
     *
     * The test is against the load's own angle: straight down is -90
     * degrees and straight up is +90, which are the two angles a
     * load is actually drawn at. Comparing against 0 and 180 would
     * test for a horizontal load, which is not a loading case.
     */
    const within = (degrees) =>
      Number.isFinite(angle) &&
      Math.abs(angle - degrees) < 1;

    const arrow = within(-90)
      ? " ↓"
      : within(90)
        ? " ↑"
        : within(180)
          ? " →"
          : within(0)
            ? " ←"
            : "";`,
  "load arrow",
);

/* ---- 3. a suggested position clears the arrow ---- */

swap(
  `        return {
          x: end.x + direction.x * reach * 0.25,
          y:
            end.y +
            direction.y * reach * 0.25 +
            8
        };`,
  `        /*
         * Beyond the arrowhead, by a distance that does not shrink
         * with the arrow. A fraction of the arrow's length put the
         * label back INSIDE a short arrow, which is worse than not
         * suggesting a position at all - it suggests one that covers
         * the thing it is labelling.
         */
        const standoff = 10;

        return {
          x: end.x + direction.x * standoff,
          y:
            end.y +
            direction.y * standoff -
            4
        };`,
  "force label standoff",
);

fs.writeFileSync(path, source);
console.log(`applied ${changed} of 3 corrections`);
