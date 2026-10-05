/*
 * Prints the rendered arrowhead geometry for every direction.
 *
 * The other vector tests check WHERE THE TIP IS, which is half the
 * question. The other half is whether the two base corners sit on the
 * shaft's axis, symmetrically about it - which is what makes a triangle an
 * arrowhead rather than a fin.
 *
 * Run from the project root:  node tools/show-arrowheads.cjs
 */
const path = require("path");
const { JSDOM } = require("jsdom");

const projectRoot = path.join(__dirname, "..");
const { locate: __locate_drawingDir } = require("../../tests/helpers/source-path.cjs");
const drawingDir = { locate: __locate_drawingDir };;

const dom = new JSDOM(
  '<!doctype html><html><body><div id="c"></div></body></html>',
  { pretendToBeVisual: true },
);

global.window = dom.window;
global.document = dom.window.document;
global.requestAnimationFrame = cb => setTimeout(cb, 0);

for (const name of [
  "measurement-core.js",
  "dimension-model.js",
  "annotation-model.js",
  "smart-dimension.js",
  "diagram-equations.js",
  "load-profile.js",
  "body-frames.js",
  "drawing-state.js",
  "renderer.js",
]) {
  require(path.join(drawingDir, name));
}

for (const name of [
  "enggDrawingState",
  "enggDrawingRenderer",
  "enggLoadProfile",
]) {
  if (global.window[name]) {
    global[name] = global.window[name];
  }
}

const canvas = dom.window.document.getElementById("c");

canvas.getBoundingClientRect = () => ({
  width: 900,
  height: 600,
  left: 0,
  top: 0,
  right: 900,
  bottom: 600,
});

const base = {
  selection: {
    selectedObjectIds: [],
    boxSelectionIds: [],
    hoveredObjectId: null,
  },
  interaction: {
    phase: "idle",
    preview: null,
    previewObjects: [],
  },
  camera: { zoom: 1, panX: 0, panY: 0 },
  styleDefaults: { stroke: "#000000", lineWidth: 0.5 },
  grid: { visible: false },
  snap: { enabled: false },
};

/*
 * For a head whose tip is T and whose shaft runs along D, the two base
 * corners must:
 *
 *   - sit BEHIND the tip (against the arrow, not past it), and
 *   - be symmetric about the shaft's axis.
 *
 * The measure is the CROSS PRODUCT of each base corner's offset from the
 * tip with the shaft direction. A correct head gives opposite signs of the
 * same size for the two corners. A head whose y component is mis-signed
 * gives both corners the SAME sign - which is a triangle lying to one side
 * of the arrow, and which looks like a fin rather than a head.
 */
console.log(
  "\n  angle    tip->corner offsets        cross products   symmetric?\n" +
    "  ---------------------------------------------------------------\n",
);

for (const angle of [0, 45, 90, 135, 180, -90, -45]) {
  dom.window.enggDrawingRenderer.renderDrawing(
    {
      ...base,
      objects: [
        {
          id: `f${angle}`,
          type: "force",
          geometry: {
            start: { x: 0, y: 0 },
            angle,
            magnitude: 60,
          },
          style: { stroke: "#000000", lineWidth: 0.5 },
        },
      ],
    },
    canvas,
  );

  const group = canvas.querySelector(".drawing-feature");

  const head = [...group.querySelectorAll("polygon")][0];

  const shaft = group.querySelector("line");

  const a = {
    x: Number(shaft.getAttribute("x1")),
    y: Number(shaft.getAttribute("y1")),
  };

  const b = {
    x: Number(shaft.getAttribute("x2")),
    y: Number(shaft.getAttribute("y2")),
  };

  const points = head
    .getAttribute("points")
    .trim()
    .split(/\s+/)
    .map(pair => {
      const [x, y] = pair.split(",").map(Number);

      return { x, y };
    });

  /* The tip is the vertex furthest from the middle of the other two. */
  let tip = null;
  let bases = null;

  points.forEach((point, index) => {
    const others = points.filter((_, i) => i !== index);

    const middle = {
      x: (others[0].x + others[1].x) / 2,
      y: (others[0].y + others[1].y) / 2,
    };

    const d = Math.hypot(
      point.x - middle.x,
      point.y - middle.y,
    );

    if (!tip || d > tip.d) {
      tip = { ...point, d };
      bases = others;
    }
  });

  /* Unit shaft direction, from tail to head. */
  const length = Math.hypot(b.x - a.x, b.y - a.y);

  const d = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };

  const crosses = bases.map(corner => {
    const ox = corner.x - tip.x;
    const oy = corner.y - tip.y;

    /* Cross product: perpendicular offset from the shaft axis. */
    return +(ox * d.y - oy * d.x).toFixed(2);
  });

  const symmetric =
    crosses.length === 2 &&
    Math.abs(crosses[0] + crosses[1]) < 0.01 &&
    Math.abs(crosses[0]) > 0.01;

  console.log(
    `  ${String(angle).padStart(4)}    ` +
      bases
        .map(
          c =>
            `(${(
              c.x - tip.x
            ).toFixed(1).padStart(6)},${(
              c.y - tip.y
            ).toFixed(1).padStart(6)})`,
        )
        .join(" ") +
      `     ${JSON.stringify(crosses).padEnd(14)}  ` +
      (symmetric ? "yes" : "NO - the head is lopsided"),
  );
}

console.log(
  "\n  A lopsided head means one of the two base corners has been\n" +
    "  placed on the wrong side of the shaft's axis, which makes the\n" +
    "  arrowhead read as a fin. Both corners must be on OPPOSITE\n" +
    "  sides, by the same amount.\n",
);
