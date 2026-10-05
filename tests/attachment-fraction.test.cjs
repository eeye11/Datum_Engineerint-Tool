
const path = require("path");

const { locate, modulePath, sourceDir } = require("./helpers/source-path.cjs");
/*
 * ATTACHMENTS ARE STORED AS A FRACTION OF THEIR MEMBER.
 *
 * An attachment - a support, a connection, a load - records WHERE ALONG
 * its member it acts. That used to be an ABSOLUTE distance in millimetres,
 * which was chosen so a drag would keep the support under its load, and
 * it did. But it made a resize wrong in a way nothing could fix: doubling
 * a beam left a support that had been at the halfway point stranded a
 * quarter of the way along the longer beam.
 *
 * Fixing that with a special case - rescale every child when the length
 * changes - is the shape of a bug, not a fix. The stored value was simply
 * the wrong shape, and it made two different operations need two
 * different rules.
 *
 * A FRACTION satisfies both at once:
 *
 *   - a RESIZE keeps the attachment at the same place, because half of a
 *     longer member is still half of it;
 *   - a DRAG rewrites the fraction from where the pointer went;
 *   - a member that moves or rotates carries its attachments with no
 *     arithmetic at all.
 *
 * This file pins that behaviour, and pins the reading of documents
 * written before the change - which carry an absolute distance and must
 * still open with their supports where they were put.
 */


global.window = {};

require(modulePath("body-frames.js"));

const frames = global.window.enggBodyFrames;

let pass = 0;
let fail = 0;

const check = (name, ok, detail) => {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(
      `  FAIL ${name}${detail ? `\n       ${detail}` : ""}`
    );
  }
};

console.log("\n  attachments as a fraction of their member\n");

const near = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

/* A 300mm member running left to right from the origin. */
const beam = {
  geometry: {
    start: { x: 0, y: 0 },
    end: { x: 300, y: 0 },
    depth: 12
  }
};

const frame = frames.frameOf(beam);

check(
  "the test beam has a frame of 300",
  frame && near(frame.length, 300),
  `length = ${frame && frame.length}`
);

/* --- Writing: a point becomes a fraction. */
check(
  "the midpoint writes as 0.5",
  near(frames.attachmentFor(frame, { x: 150, y: 0 }).fraction, 0.5),
  JSON.stringify(frames.attachmentFor(frame, { x: 150, y: 0 }))
);

check(
  "the start writes as 0",
  near(frames.attachmentFor(frame, { x: 0, y: 0 }).fraction, 0)
);

check(
  "the far end writes as 1",
  near(frames.attachmentFor(frame, { x: 300, y: 0 }).fraction, 1)
);

check(
  "a written attachment is marked as a fraction",
  frames.attachmentFor(frame, { x: 150, y: 0 }).unit === "fraction",
  `unit = ${frames.attachmentFor(frame, { x: 150, y: 0 }).unit}`
);

check(
  "a point beyond the end is clamped, not stored out of range",
  near(frames.attachmentFor(frame, { x: 999, y: 0 }).fraction, 1),
  JSON.stringify(frames.attachmentFor(frame, { x: 999, y: 0 }))
);

check(
  "a point before the start is clamped too",
  near(frames.attachmentFor(frame, { x: -50, y: 0 }).fraction, 0)
);

/* --- Reading: a fraction becomes a point on the member as it is NOW. */
check(
  "0.5 on a 300mm member is at 150",
  (() => {
    const p = frames.attachmentPoint(frame, { fraction: 0.5, unit: "fraction" });
    return near(p.x, 150) && near(p.y, 0);
  })(),
  JSON.stringify(frames.attachmentPoint(frame, { fraction: 0.5, unit: "fraction" }))
);

/*
 * THE POINT OF THE WHOLE CHANGE: the same stored attachment on a
 * LONGER member lands further along, because half is half.
 */
{
  const longer = { geometry: { start: { x: 0, y: 0 }, end: { x: 600, y: 0 }, depth: 12 } };
  const attachment = { fraction: 0.5, unit: "fraction" };

  const before = frames.attachmentPoint(frame, attachment);
  const after = frames.attachmentPoint(frames.frameOf(longer), attachment);

  check(
    "a midpoint support follows a doubled member",
    near(before.x, 150) && near(after.x, 300),
    `150 -> ${after && after.x}`
  );

  check(
    "the stored value is never rewritten by reading it",
    attachment.fraction === 0.5,
    `fraction = ${attachment.fraction}`
  );
}

/* --- Every interior fraction keeps its ratio. */
[0.1, 0.25, 0.5, 0.75, 0.9].forEach((fraction) => {
  const p = frames.attachmentPoint(frame, { fraction, unit: "fraction" });

  check(
    `${fraction} of a 300mm member is at ${300 * fraction}`,
    near(p.x, 300 * fraction, 1e-9),
    `x = ${p.x}`
  );
});

/* --- A document written BEFORE the change still reads correctly. */
check(
  "an old absolute distance of 150 reads as 0.5",
  near(frames.attachmentFraction(frame, { distance: 150, attachmentType: "distance" }), 0.5),
  `got ${frames.attachmentFraction(frame, { distance: 150, attachmentType: "distance" })}`
);

check(
  "an old attachment at the start reads as 0",
  near(frames.attachmentFraction(frame, { distance: 0 }), 0)
);

check(
  "an old attachment at the far end reads as 1",
  near(frames.attachmentFraction(frame, { distance: 300 }), 1)
);

check(
  "an old attachment opens where it was put on a longer member",
  (() => {
    const longer = frames.frameOf({
      geometry: { start: { x: 0, y: 0 }, end: { x: 600, y: 0 }, depth: 12 },
    });

    const p = frames.attachmentPoint(longer, { distance: 150 });

    // 150 of 600 is a quarter along, NOT the old 150mm position.
    return near(p.x, 150);
  })(),
  "converted placement is wrong"
);

/*
 * Reading an old attachment twice must give the same answer. The old
 * marker stays on the object rather than being rewritten, so this is the
 * check that the conversion is genuinely idempotent.
 */
{
  const old = { distance: 150, attachmentType: "distance" };

  const first = frames.attachmentFraction(frame, old);
  const second = frames.attachmentFraction(frame, old);

  check(
    "reading an old attachment twice gives the same fraction",
    near(first, 0.5) && near(second, 0.5),
    `${first} then ${second}`
  );
}

/* --- A stored fraction wins over a stale distance on the same object. */
check(
  "a fraction is preferred over a leftover distance",
  near(
    frames.attachmentFraction(frame, { fraction: 0.25, unit: "fraction", distance: 150 }),
    0.25
  ),
  `got ${frames.attachmentFraction(frame, { fraction: 0.25, unit: "fraction", distance: 150 })}`
);

/* --- Nonsense is clamped, never trusted. */
[
  [{}, 0],
  [{ fraction: NaN, unit: "fraction" }, 0],
  [{ fraction: 5, unit: "fraction" }, 1],
  [{ fraction: -5, unit: "fraction" }, 0],
  [{ fraction: "x", unit: "fraction" }, 0],
  [null, 0]
].forEach(([attachment, expected]) => {
  check(
    `an unusable attachment (${JSON.stringify(attachment)}) reads as ${expected}`,
    near(frames.attachmentFraction(frame, attachment), expected),
    `got ${frames.attachmentFraction(frame, attachment)}`
  );
});

check(
  "no frame means no point, rather than a point at the origin",
  frames.attachmentPoint(null, { fraction: 0.5, unit: "fraction" }) === null
);

/*
 * ============================================================
 * WHERE A SUPPORT ACTUALLY GOES WHEN IT IS PLACED
 * ============================================================
 *
 * Everything above is about the stored value being the right SHAPE. This is
 * about it being the right VALUE - the complaint being that supports kept
 * appearing at the ends of their bodies rather than where the cursor was.
 *
 * THE FAULT WAS IN SEEDING IT. The support factory has no body, so it could
 * only guess a distance along the member from the point it was handed, and it
 * took the point's X. That guess is right only when the body starts at the
 * origin and runs along +X - which is the one arrangement a student does not
 * usually draw:
 *
 *   - a member from x=100 to x=400, support clicked at x=250, was filed as
 *     250 ALONG a member whose origin is 100, and resolved to x=350;
 *   - a member running diagonally measured its length along X on a line
 *     that leaves X behind, giving the wrong station twice over.
 *
 * Once the value is wrong the support is stored wrong, so every later read
 * - including the drag - starts from a position the student never chose, and
 * a wrong station near the far end clamps there. Hence "always at the end".
 *
 * So the placement is now measured ON THE MEMBER, and stored as a fraction
 * of its length, at the point where the body is known.
 */
console.log("\n  a support is placed where the pointer was\n");

[
  ["a member from the origin", { start: { x: 0, y: 0 }, end: { x: 300, y: 0 } }],
  [
    "a member that does NOT start at the origin",
    { start: { x: 100, y: 0 }, end: { x: 400, y: 0 } },
  ],
  [
    "a member running diagonally",
    { start: { x: 0, y: 0 }, end: { x: 100, y: 100 } },
  ],
  [
    "a member running the other way",
    { start: { x: 300, y: 0 }, end: { x: 0, y: 0 } },
  ],
].forEach(([label, span]) => {
  const beam = { id: "beam-1", type: "beam", geometry: { ...span, depth: 12 } };

  const frame = frames.frameOf(beam);

  /*
   * A point genuinely a quarter of the way along the member - which is the
   * honest way to choose a spot on it, and the shape of the question the
   * projection answers.
   */
  const quarter = frames.pointAt(frame, frame.length * 0.25);

  const attachment = frames.attachmentFor(frame, quarter);

  const resolved = frames.attachmentPoint(frame, attachment);

  const travelled = Math.hypot(
    resolved.x - quarter.x,
    resolved.y - quarter.y,
  );

  check(
    `on ${label}, a quarter of the way along reads back where it was placed`,
    travelled < 1e-9,
    `placed at ${JSON.stringify(quarter)}, resolved to ${JSON.stringify(resolved)}`,
  );

  check(
    `${label}: it is stored as a fraction, not an absolute distance`,
    attachment.unit === "fraction" &&
      near(attachment.fraction, 0.25, 1e-9),
    `attachment = ${JSON.stringify(attachment)}`,
  );
});

console.log(
  `\n  ${pass} passed, ${fail} failed\n`
);

if (fail) {
  process.exitCode = 1;
}
