/*
 * AN ATTACHMENT IS STORED AS A FRACTION, SO RESIZING CARRIES IT.
 *
 * An attachment records WHERE ALONG its member it acts. The choice of
 * what to store there decides how the attachment behaves, and this file
 * pins the choice the application actually makes.
 *
 *   - a DRAG keeps the attachment at the same PLACE ON THE MEMBER
 *   - a RESIZE keeps it there too, for free
 *
 * Both fall out of storing a FRACTION - "0.5 is halfway along" - rather
 * than a distance in millimetres. A fraction needs no rescaling when the
 * member grows, because half of a longer member is still half of it; a
 * stored distance would need rewriting on every length change, and
 * forgetting once would leave a support stranded away from its load.
 *
 * THIS FILE USED TO TEST A `rescaleAttachments` FUNCTION.
 *
 * That function belonged to the earlier distance-based model, where a
 * resize really did have to recompute every child. The model moved to
 * fractions and the function went with it, leaving a test that could
 * only fail: it exercised an API that no longer exists, so it said
 * nothing about whether attachments behave. What is asserted now is the
 * BEHAVIOUR that matters - where an attachment sits before and after the
 * member around it changes.
 *
 * Pure module, so it runs in Node.
 */
global.window = {};

const { locate } = require("./helpers/source-path.cjs");

require(locate("body-frames.js"));

const frames = global.window.enggBodyFrames;

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

const near = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

/* A member along +x from the origin, whose FRAME the functions take. */
const member = (length) => ({
  id: "beam-1",
  type: "beam",
  geometry: { start: { x: 0, y: 0 }, end: { x: length, y: 0 } },
});

const frameFor = (length) => frames.frameOf(member(length));

console.log("\n  what an attachment stores is a FRACTION\n");

/*
 * THE CENTRAL PROPERTY. A point two-thirds along a 300 mm member is
 * still two-thirds along it when the member becomes 600 mm - which is
 * exactly what "the attachment followed the resize" means.
 *
 * `attachmentFor` is how an attachment is MADE: it is handed the member's
 * frame and the world point the student dropped it on, and it records
 * where that is RELATIVE to the member.
 */
{
  const attachment = frames.attachmentFor(frameFor(300), { x: 200, y: 0 });

  check(
    "a point two thirds along a member stores two thirds",
    near(attachment.fraction, 200 / 300, 1e-9),
    `fraction = ${attachment.fraction}`,
  );

  const point = frames.attachmentPoint(frameFor(600), attachment);

  check(
    "so the attachment lands two thirds along the LONGER member",
    point !== null && near(point.x, 400, 1e-6),
    `point = ${JSON.stringify(point)}`,
  );
}

console.log("\n  so every interior fraction survives a resize\n");

[
  [0.1, 60],
  [0.25, 150],
  [0.5, 300],
  [0.75, 450],
  [0.9, 540],
].forEach(([fraction, expected]) => {
  const point = frames.attachmentPoint(frameFor(600), { fraction });

  check(
    `an attachment at ${fraction} of a doubled member sits at ${expected} mm`,
    point !== null && near(point.x, expected, 1e-6),
    `x = ${point ? point.x : point}`,
  );
});

console.log("\n  shrinking carries it the same way\n");

{
  const point = frames.attachmentPoint(frameFor(150), { fraction: 0.5 });

  check(
    "halfway along a halved member is still halfway",
    point !== null && near(point.x, 75, 1e-6),
    `x = ${point ? point.x : point}`,
  );
}

console.log("\n  the ends are the ends, whatever the length\n");

{
  const start = frames.attachmentPoint(frameFor(1000), { fraction: 0 });
  const end = frames.attachmentPoint(frameFor(1000), { fraction: 1 });

  check(
    "an attachment at 0 stays at the member's start",
    start !== null && near(start.x, 0, 1e-6),
    `x = ${start ? start.x : start}`,
  );

  check(
    "and one at 1 stays at its far end",
    end !== null && near(end.x, 1000, 1e-6),
    `x = ${end ? end.x : end}`,
  );
}

console.log("\n  a fraction outside the member is clamped, not extrapolated\n");

{
  const a = frames.attachmentPoint(frameFor(300), { fraction: -0.5 });
  const b = frames.attachmentPoint(frameFor(300), { fraction: 1.5 });

  check(
    "a fraction below zero resolves onto the member, never past its start",
    a !== null && a.x >= -1e-6 && a.x <= 300 + 1e-6,
    `x = ${a ? a.x : a}`,
  );

  check(
    "and one above one resolves onto the member, never past its end",
    b !== null && b.x >= -1e-6 && b.x <= 300 + 1e-6,
    `x = ${b ? b.x : b}`,
  );
}

console.log("\n  an attachment is never invented from nonsense\n");

{
  [
    null,
    {},
    { fraction: NaN },
  ].forEach((attachment, index) => {
    const fraction = frames.attachmentFraction(frameFor(300), attachment);

    check(
      `case ${index}: reports a usable fraction number, never NaN`,
      Number.isFinite(fraction),
      `fraction = ${fraction}`,
    );
  });
}

console.log("\n  a degenerate member is refused rather than producing NaN\n");

{
  const point = frames.attachmentPoint(frameFor(0), { fraction: 0.5 });

  check(
    "a zero-length member yields no usable point rather than NaN",
    point === null || Number.isFinite(point.x),
    `point = ${JSON.stringify(point)}`,
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
