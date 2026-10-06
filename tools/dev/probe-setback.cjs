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
const pt = frames.attachmentPoint(frame, { fraction: 0.5, unit: "fraction" });

console.log("halfDepth =", frame.halfDepth, "attachment =", JSON.stringify(pt));

for (const type of [
  "pin-support",
  "roller-support",
  "fixed-support",
  "smooth-support",
]) {
  const p = frames.supportPlacement(beam, pt, false, type);
  console.log(type.padEnd(16), "render.y =", p.render.y);
}

console.log("\nsupportSetback:", typeof frames.supportSetback);
if (frames.supportSetback) {
  for (const t of [
    "pin-support",
    "roller-support",
    "fixed-support",
    "smooth-support",
    "bogus",
  ]) {
    console.log("  ", t, "->", frames.supportSetback(t));
  }
}
