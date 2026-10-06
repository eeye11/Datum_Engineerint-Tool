/*
 * SUPPORT SETBACK, PER TYPE.
 *
 * The stand-off from the member's centreline to the symbol's anchor is
 * the member's half-depth PLUS the symbol's own inward setback - the
 * distance from the anchor to the point of the symbol that touches the
 * parent.
 *
 * That setback is NOT the same for every support:
 *
 *   pin, roller  a triangle whose apex points back at the member, so the
 *                contact is 9 screen units inward of the anchor;
 *   fixed        a wall drawn AT the anchor, so the contact is the anchor
 *                itself (0);
 *   smooth       a circle that rests on the face at the anchor (0).
 *
 * A single number therefore cannot be right for all four: 9 pushes a
 * fixed or smooth support a visible gap off its parent, and 0 buries the
 * pin and roller triangles inside it.
 */
const fs = require("fs");
const path = "js/core/geometry/body-frames.js";

let s = fs.readFileSync(path, "utf8").split("\r\n").join("\n");

/* ---- 1. the setback table, replacing the single constant ---- */
const oldConst = `    /*
     * HOW FAR BEYOND THE FACE THE SYMBOL'S ANCHOR IS PLACED.
     *
     * The support symbol is a triangle whose APEX points back toward the
     * member; the renderer anchors it this far beyond its apex. So the
     * stand-off from the centreline is the member's half-depth PLUS this
     * setback, and the apex lands exactly on the member's face.
     *
     * It used to be half-depth plus a clearance of 2, which left the apex
     * SEVEN units inside the member: the symbol overlapped the body it
     * supported, and a stem line was drawn from the centreline out to the
     * symbol to explain the attachment. Neither is wanted - a support
     * touches its parent at the attachment point and needs no connector.
     *
     * Kept in step with the renderer's triangle size (the \`size\` local
     * in appendSupportSymbol). If that changes, change this with it.
     */
    const SUPPORT_APEX_SETBACK = 9;

    /* The old name, kept for any existing reader of the export. */
    const SUPPORT_CLEARANCE = SUPPORT_APEX_SETBACK;`;

const newConst = `    /*
     * HOW FAR INWARD OF THE SYMBOL'S ANCHOR THE PARENT IS TOUCHED.
     *
     * The stand-off from the centreline to the anchor is the member's
     * half-depth PLUS the symbol's own setback, so that the part of the
     * symbol that MEETS the parent lands exactly on its face. A support
     * touches its parent; it does not hover beside it, and no connector
     * line is drawn to explain an offset.
     *
     * THE SETBACK IS A PROPERTY OF THE SYMBOL, and the four symbols do
     * not share one. The pin and roller are triangles whose apex points
     * back at the member (9 screen units, the renderer's \`size\`); the
     * fixed support's wall and the smooth support's circle both rest on
     * the face AT the anchor (0). One number for all four is wrong for
     * two of them - 9 stands a fixed or smooth support off its parent by
     * a visible gap.
     *
     * Kept in step with appendSupportSymbol in the renderer. If a symbol's
     * geometry changes, change its setback here with it.
     */
    const SUPPORT_APEX_SETBACK = 9;

    const SUPPORT_SETBACK_BY_TYPE = {
        "pin-support": SUPPORT_APEX_SETBACK,
        "roller-support": SUPPORT_APEX_SETBACK,
        "fixed-support": 0,
        "smooth-support": 0
    };

    /*
     * The setback for a support, by its feature type. An unknown or
     * absent type gets the triangle's setback, which is the common case
     * and the one a partial caller is most likely to mean.
     */
    function supportSetback(type) {
        const setback = SUPPORT_SETBACK_BY_TYPE[type];

        return Number.isFinite(setback) ? setback : SUPPORT_APEX_SETBACK;
    }

    /* The old name, kept for any existing reader of the export. */
    const SUPPORT_CLEARANCE = SUPPORT_APEX_SETBACK;`;

if (!s.includes(oldConst)) {
  console.error("const anchor not found");
  process.exit(1);
}
s = s.replace(oldConst, newConst);

/* ---- 2. supportPlacement takes the type ---- */
const oldSig = `    function supportPlacement(
        parent,
        attachment,
        flipped
    ) {`;

const newSig = `    function supportPlacement(
        parent,
        attachment,
        flipped,
        type
    ) {`;

if (!s.includes(oldSig)) {
  console.error("signature anchor not found");
  process.exit(1);
}
s = s.replace(oldSig, newSig);

const oldStandoff = `        /*
         * THE OFFSET FROM THE CENTRELINE TO THE SYMBOL'S ANCHOR.
         *
         * Face plus apex setback: the symbol's triangle points back
         * toward the member by APEX_SETBACK, so anchoring it that far
         * beyond the face lands the apex exactly ON the face - the
         * support TOUCHES its parent, with no gap, and no connector line
         * is needed to explain where it is attached.
         */
        const standoff =
            frame.halfDepth +
            SUPPORT_APEX_SETBACK;`;

const newStandoff = `        /*
         * THE OFFSET FROM THE CENTRELINE TO THE SYMBOL'S ANCHOR.
         *
         * Face plus THIS symbol's setback, so the part of the symbol that
         * meets the parent lands exactly on its face. The setback depends
         * on the symbol, so the support's own type is read - passed in
         * where the caller knows it, and taken from the parent's type
         * where the caller is placing a support and passing the feature.
         */
        const standoff =
            frame.halfDepth +
            supportSetback(type);`;

if (!s.includes(oldStandoff)) {
  console.error("standoff anchor not found");
  process.exit(1);
}
s = s.replace(oldStandoff, newStandoff);

/* ---- 3. export the helper + table ---- */
if (s.includes("        SUPPORT_APEX_SETBACK,")) {
  s = s.replace(
    "        SUPPORT_APEX_SETBACK,",
    "        SUPPORT_APEX_SETBACK,\n        SUPPORT_SETBACK_BY_TYPE,\n        supportSetback,",
  );
} else {
  console.error("WARNING: export list anchor not found");
}

fs.writeFileSync(path, s, "utf8");
console.log("body-frames.js: per-type support setback applied");
