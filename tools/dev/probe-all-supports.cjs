const { modulePath } = require("../../tests/helpers/source-path.cjs");

global.window = { crypto: { randomUUID: () => "b" } };
require(modulePath("body-frames.js"));
const frames = global.window.enggBodyFrames;

const beam = {
  id: "beam-1",
  type: "beam",
  geometry: { start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, depth: 12 },
};
const frame = frames.frameOf(beam);
const halfDepth = frame.halfDepth;
const attachment = { fraction: 0.5, unit: "fraction" };
const pt = frames.attachmentPoint(frame, attachment);

/* out = downward normal for a level beam (the support hangs below). */
const size = 9;

for (const type of [
  "pin-support",
  "roller-support",
  "fixed-support",
  "smooth-support",
]) {
  const placement = frames.supportPlacement(beam, pt, false, type);
  const render = placement.render;

  /* The face, below the centreline by halfDepth. */
  const faceY = pt.y - halfDepth;

  /*
   * The point of the symbol that meets the parent:
   *  - pin / roller: the triangle apex, `size` inward of the anchor
   *  - fixed / smooth: the anchor itself
   */
  const contactY =
    type === "pin-support" || type === "roller-support"
      ? render.y + size
      : render.y;

  const gap = Math.abs(contactY - faceY);

  console.log(
    `${type.padEnd(16)} render.y=${render.y.toFixed(2)} contact.y=${contactY.toFixed(2)} face.y=${faceY.toFixed(2)} gap=${gap.toFixed(4)}`,
  );
}
