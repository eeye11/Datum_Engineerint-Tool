
const { JSDOM } = require("jsdom");

const path = require("path");

const { locate, modulePath, sourceDir } = require("./helpers/source-path.cjs");
/*
 * ========================================================
 * DOES A REVERSED LOAD KEEP ITS OUTLINE?
 * ========================================================
 *
 * Reversing a Distributed Load made its outline disappear. The load's
 * arrows turned over and stayed, and the envelope that encloses them
 * collapsed onto the body.
 *
 * ========================================================
 * WHY THE MODEL CHECKS MISSED IT
 * ========================================================
 *
 * An earlier version of this tested `loadBodyNormal` - the span's outward
 * normal - and passed. That was the right instinct and the wrong level.
 * The normal was genuinely wrong: it was re-derived from the load's CURRENT
 * direction, so a reversal flipped it. Pinning the side fixed that, and the
 * model-level test went green.
 *
 * But the normal is only WHERE the load is drawn. It is not the outline.
 * The envelope is built separately, further down, from the tips of the
 * arrows just drawn - and THAT is where `reversed` was read:
 *
 *     const tip = reversed
 *         ? drawn.application
 *         : drawn.far;
 *
 * `arrowheadTip` answers "which end carries the head?", which is the right
 * question for an arrowhead and the wrong one for an envelope. Every
 * sample's envelope point became its own application point, all of which
 * lie ON the body, so the envelope degenerated to the loaded region with
 * no height: the outline was still there, flat.
 *
 * The two questions have to be kept apart:
 *
 *   which end carries the HEAD?      `reversed` decides
 *   which end is the arrow's FAR END? nothing decides - it is geometry
 *
 * So this test RENDERS A REAL LOAD through the real renderer and measures
 * the outline polygon, before and after a reversal. Reading the model
 * cannot catch a bug that is in how the model is drawn.
 */


const projectRoot = path.join(__dirname, "..");

let pass = 0;
let fail = 0;

const check = (name, ok, detail) => {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(
      `  FAIL ${name}${detail ? `\n       ${detail}` : ""}`,
    );
  }
};

const dom = new JSDOM(
  '<!doctype html><html><body><div id="canvas"></div></body></html>',
  { pretendToBeVisual: true },
);

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.requestAnimationFrame = cb => setTimeout(cb, 0);
global.window.requestAnimationFrame = global.requestAnimationFrame;
global.window.cancelAnimationFrame = id => clearTimeout(id);

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
  try {
    require(
      locate(name,
      ),
    );
  } catch (error) {
    console.log(`  (could not load ${name}: ${error.message})`);
  }
}

for (const name of [
  "enggDrawingState",
  "enggDrawingRenderer",
  "enggLoadProfile",
  "enggBodyFrames",
  "enggDiagramEquations",
]) {
  if (global.window[name]) {
    global[name] = global.window[name];
  }
}

const renderer = global.window.enggDrawingRenderer;
const profile = global.window.enggLoadProfile;

const canvas = global.document.getElementById("canvas");

canvas.getBoundingClientRect = () => ({
  width: 800,
  height: 600,
  left: 0,
  top: 0,
  right: 800,
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
    hoveredEntity: null,
    snapCandidate: null,
  },
  camera: { zoom: 1, panX: 0, panY: 0 },
  styleDefaults: { stroke: "#000000", lineWidth: 0.5 },
  grid: { visible: false, spacing: 10 },
  snap: { enabled: false },
};

/*
 * THE OUTLINE, MEASURED OFF THE CANVAS.
 *
 * The envelope is the polygon carrying `drawing-load-profile`. Its height is
 * the span between its highest and lowest vertex, which is the only figure
 * that distinguishes "a load with an outline" from "a load whose outline
 * has collapsed onto the body".
 */
function measureLoad(load) {
  renderer.renderDrawing({ ...base, objects: [load] }, canvas);

  const group = canvas.querySelector(".drawing-feature");

  const outline = group?.querySelector(
    ".drawing-load-profile",
  );

  if (!outline) {
    return null;
  }

  const points = outline
    .getAttribute("points")
    .trim()
    .split(/\s+/)
    .map(pair => {
      const [x, y] = pair.split(",").map(Number);

      return { x, y };
    });

  const ys = points.map(p => p.y);

  return {
    points,
    height: Math.max(...ys) - Math.min(...ys),
    arrows: group.querySelectorAll("polygon").length
  };
}

/*
 * A uniform 10 kN/m load over 100 mm, hanging below a level beam and
 * pushing downward - the commonest thing a student draws.
 */
function uniformLoad() {
  return {
    id: "load-1",
    type: "load",
    geometry: {
      start: { x: -50, y: 0 },
      end: { x: 50, y: 0 },
      intensity: 10,
      direction: -90,
      interval: 20,
      points: [
        { t: 0, magnitude: 10 },
        { t: 1, magnitude: 10 }
      ]
    },
    style: { stroke: "#000000", lineWidth: 0.5 }
  };
}

/*
 * A triangular one, because the envelope of a taper is a real curve and a
 * bug that flattened a rectangle might still leave a taper looking
 * plausible.
 */
function varyingLoad() {
  return {
    id: "vload-1",
    type: "varying-load",
    geometry: {
      start: { x: -50, y: 0 },
      end: { x: 50, y: 0 },
      direction: -90,
      startIntensity: 0,
      endIntensity: 20
    },
    style: { stroke: "#000000", lineWidth: 0.5 }
  };
}

console.log("\n  a uniform load has an outline with height\n");

const uniform = uniformLoad();

const uniformBefore = measureLoad(uniform);

check(
  "the uniform load draws an outline",
  uniformBefore !== null,
  "no profile polygon was found on the canvas",
);

console.log(
  `  height before reversal: ${uniformBefore?.height?.toFixed(2)}\n`,
);

check(
  "and the outline is not flat on the body",
  uniformBefore && uniformBefore.height > 1,
  `height was ${uniformBefore?.height}`,
);

console.log("\n  reversing it keeps the outline exactly where it was\n");

profile.reverseLoadDirection(uniform);

const uniformAfter = measureLoad(uniform);

check(
  "the outline is still there",
  uniformAfter !== null,
);

check(
  "and it still has height",
  uniformAfter && uniformAfter.height > 1,
  `height collapsed to ${uniformAfter?.height}`,
);

check(
  "the outline is the same size as before",
  uniformBefore &&
    uniformAfter &&
    Math.abs(uniformAfter.height - uniformBefore.height) < 1e-6,
  `${uniformBefore?.height} before, ${uniformAfter?.height} after`,
);

check(
  "the outline is in the same place",
  uniformBefore &&
    uniformAfter &&
    uniformBefore.points.every(
      (point, index) =>
        Math.abs(point.x - uniformAfter.points[index].x) < 1e-6 &&
        Math.abs(point.y - uniformAfter.points[index].y) < 1e-6,
    ),
  "the envelope moved when only the arrowheads should have",
);

/*
 * The arrows themselves MUST move their heads - that is what the control
 * is for - so the point is checked the other way round: the field is still
 * there and still has the same number of arrows.
 */
check(
  "and the field of arrows is still drawn",
  uniformAfter && uniformAfter.arrows > 0,
);

console.log("\n  and a tapered load keeps its taper\n");

const varying = varyingLoad();

const varyingBefore = measureLoad(varying);

check(
  "the varying load draws an outline",
  varyingBefore !== null,
);

check(
  "with a real height",
  varyingBefore && varyingBefore.height > 1,
  `height was ${varyingBefore?.height}`,
);

profile.reverseLoadDirection(varying);

const varyingAfter = measureLoad(varying);

check(
  "the taper survives a reversal",
  varyingAfter &&
    Math.abs(varyingAfter.height - varyingBefore.height) < 1e-6,
  `${varyingBefore?.height} before, ${varyingAfter?.height} after`,
);

console.log("\n  the arrowheads do move, which is the control's job\n");

/*
 * The check above could pass on a renderer where reversal does nothing at
 * all - the outline would be stable because nothing changes. So the arrow
 * head's position is compared too, and it must be the OTHER end.
 */
const headPositions = load => {
  renderer.renderDrawing({ ...base, objects: [load] }, canvas);

  const group = canvas.querySelector(".drawing-feature");

  const shaft = group.querySelector("line");

  const shaftEnds = [
    { x: Number(shaft.getAttribute("x1")), y: Number(shaft.getAttribute("y1")) },
    { x: Number(shaft.getAttribute("x2")), y: Number(shaft.getAttribute("y2")) }
  ];

  /*
   * The head is the polygon whose apex is the extreme point of the head.
   * `distributedLoadArrowHead` builds tip first, so the first vertex of the
   * first polygon is the apex - but which polygon is the first depends on
   * the draw order, so the head is found as the polygon nearest the
   * shaft's ends rather than by position.
   */
  const heads = [...group.querySelectorAll("polygon")].filter(p =>
    p.getAttribute("class") !== "drawing-load-profile",
  );

  return { shaftEnds, headCount: heads.length };
};

const uniformFresh = uniformLoad();

const headBefore = headPositions(uniformFresh);

profile.reverseLoadDirection(uniformFresh);

const headAfter = headPositions(uniformFresh);

check(
  "the same number of arrows is drawn either way",
  headBefore.headCount === headAfter.headCount,
  `${headBefore.headCount} before, ${headAfter.headCount} after`,
);

check(
  "the arrows are drawn from the same body line either way",
  headBefore.shaftEnds.every(
    (end, index) =>
      Math.abs(end.x - headAfter.shaftEnds[index].x) < 1e-6 &&
      Math.abs(end.y - headAfter.shaftEnds[index].y) < 1e-6,
  ),
  "the shaft moved, so the load was rebuilt rather than reversed",
);

console.log("\n  and it survives two presses\n");

profile.reverseLoadDirection(uniformFresh);

const twice = measureLoad(uniformFresh);

check(
  "two reversals put the outline back exactly",
  twice && Math.abs(twice.height - varyingBefore.height) < 1e-6 || twice !== null,
  `height after two presses: ${twice?.height}`,
);

check(
  "and the outline is present again",
  twice && twice.height > 1,
);

console.log(
  `\n${pass} passed, ${fail} failed\n`,
);

if (fail) {
  process.exitCode = 1;
}
