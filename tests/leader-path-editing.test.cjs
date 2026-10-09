/*
 * ========================================================
 * A LEADER'S PEN IS ONE PATH, EDITABLE POINT BY POINT
 * ========================================================
 *
 * A leader and a callout share ONE ordered path - attachment, bends, endpoint -
 * and every point of it is a handle. This pins the whole editing story:
 *
 *   the path is one list       not a collection of unrelated segments
 *   bends are insertable       at the segment midpoint, so the line does not jump
 *   bends are movable          by dragging the handle, which reshapes the pen
 *   bends are deletable        reconnecting the neighbours, path stays continuous
 *   the ends are movable       attachment and endpoint each on their own
 *   handles are per-point      one per bend plus the two ends
 *   moving the whole leader    carries every bend with it
 */

const { JSDOM } = require("jsdom");

const { modulePath } = require("./helpers/source-path.cjs");

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

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://datum.test/",
});

global.window = dom.window;
global.document = dom.window.document;
global.Element = dom.window.Element;

for (const name of ["quantities.js", "annotate-model.js", "drawing-state.js"]) {
  require(modulePath(name));
}

const annotate = require(modulePath("annotate-model.js")).default;

console.log("\n  the pen is one ordered path\n");

{
  const leader = annotate.createAnnotate({
    kind: "leader",
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
  });

  check(
    "a new leader is attachment then endpoint",
    annotate.leaderPathPoints(leader).length === 2,
  );

  check(
    "and it reports that it carries a path",
    annotate.hasLeaderPath("leader") === true &&
      annotate.hasLeaderPath("callout") === true,
  );

  check("while a note does not", annotate.hasLeaderPath("note") === false);
}

console.log(
  "\n  a bend is INSERTED at the midpoint of the segment it splits\n",
);

{
  const leader = annotate.createAnnotate({
    kind: "leader",
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
  });

  annotate.addLeaderBend(leader, 0);

  const path = annotate.leaderPathPoints(leader);

  check("the path grew", path.length === 3);
  check(
    "and the drawn line did NOT move - the bend is on the old line",
    path[1].x === 50 && path[1].y === 0,
    JSON.stringify(path[1]),
  );
}

console.log("\n  a bend is MOVED by writing its own point\n");

{
  const leader = annotate.createAnnotate({
    kind: "leader",
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
  });

  annotate.addLeaderBend(leader, 0);

  /* This is what a handle drag writes. */
  leader.geometry.bends[0] = { x: 40, y: 30 };

  const path = annotate.leaderPathPoints(leader);

  check(
    "the path now bends through the new point",
    path[1].x === 40 && path[1].y === 30,
  );
  check(
    "while the two ends are untouched",
    path[0].x === 0 && path[2].x === 100,
  );
}

console.log("\n  a bend is DELETED, and the path stays CONTINUOUS\n");

{
  const leader = annotate.createAnnotate({
    kind: "leader",
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
  });

  annotate.addLeaderBend(leader, 0);
  annotate.addLeaderBend(leader, 1);

  check("two bends now", annotate.leaderPathPoints(leader).length === 4);

  annotate.removeLeaderBend(leader, 0);

  const path = annotate.leaderPathPoints(leader);

  check("one bend now", path.length === 3);
  check(
    "and its neighbours are reconnected - the ends are still the ends",
    path[0].x === 0 && path[path.length - 1].x === 100,
  );

  /* Removing the last one leaves a plain two-point pen, not a broken path. */
  annotate.removeLeaderBend(leader, 0);

  check(
    "removing every bend leaves a clean two-point path",
    annotate.leaderPathPoints(leader).length === 2,
  );
}

console.log("\n  moving the whole leader carries every bend\n");

{
  const leader = annotate.createAnnotate({
    kind: "callout",
    start: { x: 0, y: 0 },
    end: { x: 100, y: 100 },
  });

  annotate.addLeaderBend(leader, 0);
  annotate.addLeaderBend(leader, 1);

  const before = annotate.leaderPathPoints(leader);

  annotate.translateAnnotation(leader, 10, -5);

  const after = annotate.leaderPathPoints(leader);

  check(
    "every point moved by the same delta, so the shape is preserved",
    after.every(
      (point, index) =>
        Math.abs(point.x - (before[index].x + 10)) < 1e-9 &&
        Math.abs(point.y - (before[index].y - 5)) < 1e-9,
    ),
    JSON.stringify(after),
  );
}

console.log("\n  the bends are part of the feature's BOUNDS\n");

{
  const leader = annotate.createAnnotate({
    kind: "leader",
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
  });

  annotate.addLeaderBend(leader, 0);
  leader.geometry.bends[0] = { x: 50, y: 80 };

  const bounds = annotate.boundsOf(leader);

  check(
    "a box selection that crosses a bend will find the leader",
    bounds.some((point) => point.x === 50 && point.y === 80),
    JSON.stringify(bounds),
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
