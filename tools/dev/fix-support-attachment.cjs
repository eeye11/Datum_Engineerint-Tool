/*
 * SUPPORT ATTACHMENT FIX.
 *
 * Two changes, one cause.
 *
 * 1. body-frames.js - the stand-off.
 *
 *    supportPlacement offsets the symbol from the centreline by
 *    `halfDepth + SUPPORT_CLEARANCE`, with SUPPORT_CLEARANCE = 2. The
 *    symbol's triangle is drawn with its apex `size` (9) back toward the
 *    body from the anchor, so with a stand-off of halfDepth + 2 the apex
 *    landed SEVEN units inside the member - overlapping the body - which
 *    is why a stem was ever needed to explain the attachment.
 *
 *    Setting the stand-off to `halfDepth + APEX_SETBACK` puts the apex
 *    exactly on the member's face: the symbol TOUCHES the parent, with
 *    no gap, which is both the drafting convention and what was asked
 *    for.
 *
 * 2. renderer.js - the stem.
 *
 *    The connector line from the centreline out to the symbol is removed
 *    entirely. It existed only to make the (overlapped) offset legible;
 *    with the symbol touching its parent there is nothing to connect.
 */
const fs = require("fs");

/* ---------- 1. body-frames.js ---------- */
{
  const path = "js/core/geometry/body-frames.js";
  let s = fs.readFileSync(path, "utf8");

  const oldClearance = `    /*
     * How far clear of the member's face a support is drawn.
     *
     * A symbol drawn starting exactly on the face overlaps the body it
     * is supporting, and at a glance reads as though it were partly
     * inside it - which is the one thing a support must not look like.
     */
    const SUPPORT_CLEARANCE = 2;`;

  const newClearance = `    /*
     * HOW FAR BEYOND THE FACE THE SYMBOL'S ANCHOR IS PLACED.
     *
     * The support symbol is a triangle whose APEX points back toward the
     * member and whose base sits outward, and the renderer anchors it at
     * a point \`APEX_SETBACK\` beyond its apex. So the stand-off from the
     * centreline has to be the member's half-depth PLUS that setback for
     * the apex to land exactly on the member's face.
     *
     * It used to be half-depth plus a small clearance of 2, which left
     * the apex SEVEN units inside the member - the symbol overlapped the
     * body it was supporting, and a stem line was drawn from the
     * centreline out to the symbol to explain the attachment. Neither is
     * wanted: a support TOUCHES its parent at the attachment point and
     * needs no connector.
     *
     * Kept in step with the renderer's triangle size. If that size
     * changes, this is the one number to change with it.
     */
    const SUPPORT_APEX_SETBACK = 9;

    /*
     * The old name, kept so an existing reader of the export does not
     * break. It means the same thing now: the distance beyond the
     * member's face at which the symbol's anchor is placed.
     */
    const SUPPORT_CLEARANCE = SUPPORT_APEX_SETBACK;`;

  if (!s.includes(oldClearance)) {
    console.error("body-frames: clearance anchor not found");
    process.exit(1);
  }
  s = s.replace(oldClearance, newClearance);

  const oldStandoff = `        const standoff =
            frame.halfDepth +
            SUPPORT_CLEARANCE;`;

  const newStandoff = `        /*
         * Face plus apex setback: the symbol's apex lands ON the
         * member's face, so the support touches its parent.
         */
        const standoff =
            frame.halfDepth +
            SUPPORT_APEX_SETBACK;`;

  if (!s.includes(oldStandoff)) {
    console.error("body-frames: standoff anchor not found");
    process.exit(1);
  }
  s = s.replace(oldStandoff, newStandoff);

  /* Export the new name alongside the old one. */
  s = s.replace(
    "        SUPPORT_CLEARANCE,",
    "        SUPPORT_APEX_SETBACK,\n        SUPPORT_CLEARANCE,",
  );

  fs.writeFileSync(path, s, "utf8");
  console.log("body-frames.js: stand-off now puts the apex on the face");
}

/* ---------- 2. renderer.js ---------- */
{
  const path = "js/rendering/renderer.js";
  let s = fs.readFileSync(path, "utf8");

  const stem = `                /*
                 * A short stem from the attachment out to the symbol.
                 *
                 * It is what makes the two separate positions
                 * LEGIBLE: without it a support drawn clear of the beam
                 * looks like it is simply floating near it, and the
                 * student cannot see that it is attached to the
                 * centreline rather than hovering beside the member.
                 */
                if (
                    placement &&
                    attachmentPoint
                ) {
                    const from =
                        toScreen(attachmentPoint);

                    const stem =
                        createSvgElement("line", {
                            x1: from.x,
                            y1: from.y,
                            x2: drawn.x,
                            y2: drawn.y,
                            stroke,
                            "stroke-width": 1,
                            "stroke-opacity": 0.75
                        });

                    stem.setAttribute(
                        "pointer-events",
                        "none"
                    );

                    svg.appendChild(stem);
                }
`;

  if (!s.includes(stem)) {
    console.error("renderer: stem block not found");
    process.exit(1);
  }

  const replacement = `                /*
                 * NO STEM. The symbol's apex now lands on the member's
                 * own face (see SUPPORT_APEX_SETBACK in body-frames), so
                 * the support touches its parent and there is nothing to
                 * connect. The connector line that used to be drawn from
                 * the centreline out to the symbol is gone: it existed
                 * only to explain an offset that overlapped the body.
                 */
`;

  s = s.replace(stem, replacement);

  fs.writeFileSync(path, s, "utf8");
  console.log("renderer.js: support connector removed");
}
