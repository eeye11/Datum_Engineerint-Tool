const { modulePath } = require("../../tests/helpers/source-path.cjs");

global.window = { crypto: { randomUUID: () => "b" } };
require(modulePath("body-frames.js"));
const frames = global.window.enggBodyFrames;

const support = (attachment) => ({
  id: "s",
  type: "pin-support",
  parentId: "beam-1",
  geometry: { position: { x: 9999, y: 9999 }, attachment },
});

const levelBeam = {
  id: "beam-1",
  type: "beam",
  geometry: { start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, depth: 12 },
};

const cases = [
  ["fraction 0.5", { fraction: 0.5, unit: "fraction" }],
  ["fraction 0", { fraction: 0, unit: "fraction" }],
  ["legacy distance 100", { distance: 100 }],
  ["legacy unit 'start'", { unit: "start" }],
  ["nothing at all", undefined],
];

for (const [label, attachment] of cases) {
  const frame = frames.frameOf(levelBeam);
  const pt = frames.attachmentPoint(frame, attachment);
  const pl = frames.supportPlacement(levelBeam, pt, false);
  console.log(
    label.padEnd(24),
    "attach=",
    JSON.stringify(pt),
    "render=",
    JSON.stringify(pl && pl.render),
  );
}

/* Parent ROTATED 90 deg: the support must stay on the parent. */
const rotated = {
  id: "beam-1",
  type: "beam",
  geometry: { start: { x: 0, y: 0 }, end: { x: 0, y: 400 }, depth: 12 },
};
const rframe = frames.frameOf(rotated);
const rpt = frames.attachmentPoint(rframe, { fraction: 0.5, unit: "fraction" });
const rpl = frames.supportPlacement(rotated, rpt, false);
console.log(
  "\nrotated parent:",
  JSON.stringify(rotated.geometry.start),
  "->",
  JSON.stringify(rotated.geometry.end),
);
console.log("attachment (= midpoint of rotated beam):", JSON.stringify(rpt));
console.log("render:", JSON.stringify(rpl && rpl.render));

/* Parent LENGTH halved: the same fraction must still be on the parent. */
const short = {
  id: "beam-1",
  type: "beam",
  geometry: { start: { x: 0, y: 0 }, end: { x: 200, y: 0 }, depth: 12 },
};
const sframe = frames.frameOf(short);
const spt = frames.attachmentPoint(sframe, { fraction: 0.5, unit: "fraction" });
console.log(
  "\nshortened beam midpoint:",
  JSON.stringify(spt),
  "(expected x=100)",
);
