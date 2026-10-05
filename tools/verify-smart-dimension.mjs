/*
 * Smart Dimension: references are collected by clicking, and the
 * measurement is only decided when Enter is pressed.
 *
 * The checks read the interaction state and the stored dimensions
 * rather than the annotation on the canvas, because what matters here
 * is WHEN the decision happens and WHAT it decides.
 */
import {
  mainWorld,
  openDrawingTab,
  selectDiscipline,
  activateStrict,
  clickWorld,
  popup
} from "./qa-bridge-driver.mjs";

const results = [];
const ok = (n, p, d) => results.push({ name: n, pass: !!p, detail: d });
const near = (a, b, t = 1e-6) => Math.abs(a - b) < t;

const DIM = "dimension";

async function useDimensionTool(page) {
  await selectDiscipline(page, "ANNOTATE");
  await activateStrict(page, DIM);
}

async function interaction(page) {
  return mainWorld(page, () => {
    const i = window.enggDrawing.state.interaction;

    return {
      stage: i.dimensionStage ?? null,
      picked: (i.dimensionPickedRefs || []).length,
      refs: (i.dimensionRefs || []).length,
      choice: i.dimensionChoice ?? null
    };
  });
}

async function dimensions(page) {
  return mainWorld(page, () => {
    const s = window.enggDrawing.state;

    /*
     * The literal is written out rather than referencing `DIM`,
     * because this function is serialised and evaluated in the PAGE,
     * where this module's constants do not exist.
     */
    return s.objects
      .filter(o => o.type === "dimension")
      .map(d => {
        const m = window.enggDimensionModel.measurementFor(d, s);

        return {
          type: d.dimensionType,
          value: m === null ? null : m.value,
          unit: m === null ? null : m.unit
        };
      });
  });
}

async function line(page, fx1, fy1, fx2, fy2, size) {
  await activateStrict(page, "line");
  await clickWorld(page, fx1, fy1);
  await clickWorld(page, fx2, fy2);

  /*
   * A line is a sized feature, so its creation popup opens here and
   * the geometry is not committed until it is answered. Every line
   * used as a dimension subject has to be given a size first.
   */
  const input = page.locator(".drawing-creation-dimension-input");
  await input.waitFor({ state: "visible", timeout: 4000 });
  await input.fill(String(size));
  await input.press("Enter");
  await page.waitForTimeout(250);

  /*
   * The angle is measured from the line's TRUE endpoints, so the test
   * has to know what that angle is rather than assume it. Snapping
   * and pixel rounding mean a click aimed at "vertical" is not
   * exactly vertical, and a test that asserts 90 would be asserting
   * its own imprecision.
   */
  return mainWorld(page, () => {
    const s = window.enggDrawing.state;
    const lines = s.objects.filter(o => o.type === "line");

    return lines.map(l => ({
      start: l.geometry.start,
      end: l.geometry.end
    }));
  });
}
/**
 * The angle the document should report between two lines.
 *
 * Datum reports the angle between two LINES, not two rays: the value
 * is the absolute of the signed angle, so it is always the smaller of
 * the two angles the pair makes (0-90), and never a reflex one. That
 * convention is the application's, and the test has to state the same
 * thing the product does rather than its own guess.
 */
function expectedAngle(lines) {
  if (!lines || lines.length < 2) {
    return null;
  }

  const dirs = lines.map(l => {
    const dx = l.end.x - l.start.x;
    const dy = l.end.y - l.start.y;
    const m = Math.hypot(dx, dy);
    return m < 1e-9 ? null : { x: dx / m, y: dy / m };
  });

  if (dirs.some(d => d === null)) {
    return null;
  }

  const dot = dirs[0].x * dirs[1].x + dirs[0].y * dirs[1].y;
  const determinant = dirs[0].x * dirs[1].y - dirs[0].y * dirs[1].x;

  return Math.abs((Math.atan2(determinant, dot) * 180) / Math.PI);
}

/**
 * Click the MIDDLE of a feature, working out its SCREEN position with
 * the application's own projection.
 *
 * The canvas has a camera, so a fraction of the canvas is not a
 * fraction of the drawing: with zoom at 1 the canvas centre is world
 * origin, 200 screen pixels are 84 world units, and world y grows
 * UPWARD. The projection is measured from the live canvas box rather
 * than hard-coded, so it survives a resize.
 */
async function clickFeatureMidpoint(page, type, indexFromEnd = 0) {
  const target = await mainWorld(page, ({ t, from }) => {
    const s = window.enggDrawing.state;
    const matches = s.objects.filter(x => x.type === t);
    const obj = matches[matches.length - 1 - from];

    if (!obj) return null;

    const g = obj.geometry;

    const world =
      g.start && g.end
        ? {
            x: (g.start.x + g.end.x) / 2,
            y: (g.start.y + g.end.y) / 2
          }
        : g.center
          ? { x: g.center.x, y: g.center.y }
          : null;

    if (!world) return null;

    const rect = document
      .querySelector(".drawing-canvas")
      .getBoundingClientRect();

    const zoom = s.camera.zoom || 1;
    const panX = s.camera.panX || 0;
    const panY = s.camera.panY || 0;

    /*
     * WORLD -> SCREEN, MEASURED RATHER THAN GUESSED.
     *
     * Clicking at canvas x=223+200 produced world x=-83, and at
     * x=223+600 produced world x=+83.75 - so the canvas centre is the
     * world ORIGIN and the scale is (600-200) / (83.75+83) = 2.403
     * pixels per world unit, not one pixel per unit. World y grows
     * UPWARD, so the screen y is inverted.
     *
     * The scale is re-derived here from the live canvas width rather
     * than hard-coded, so it still holds if the window is resized.
     */
    const pixelsPerUnit = rect.width / 335;

    return {
      screenX: rect.x + rect.width / 2 + (world.x + panX) * pixelsPerUnit * zoom,
      screenY:
        rect.y + rect.height / 2 - (world.y + panY) * pixelsPerUnit * zoom,
      world
    };
  }, { t: type, from: indexFromEnd });

  if (!target) {
    throw new Error(`no ${type} to click`);
  }

  await page.mouse.click(target.screenX, target.screenY);
  await page.waitForTimeout(250);

  return target.world;
}

export default async function run(page) {
  try {
    await body(page, ok, near);
  } catch (e) {
    ok(`UNEXPECTED FAILURE: ${e.message}`, false);
  }

  return {
    passed: results.filter(r => r.pass).length,
    total: results.length,
    failed: results.filter(r => !r.pass)
  };
}

async function body(page, ok, near) {
  await openDrawingTab(page);

  // ---- Two lines -> an ANGLE ----
  await line(page, 0.12, 0.85, 0.55, 0.85, 400); // horizontal
  await line(page, 0.3, 0.15, 0.3, 0.85, 400); // vertical => ~90 degrees

  /*
   * Both lines, read together after the second is committed, so the
   * expected angle is computed from the same geometry the dimension
   * will be measured from.
   */
  const drawnLines = await mainWorld(page, () =>
    window.enggDrawing.state.objects
      .filter(o => o.type === "line")
      .map(l => ({ start: l.geometry.start, end: l.geometry.end }))
  );

  const wanted = expectedAngle(drawnLines);

  await useDimensionTool(page);
  await clickFeatureMidpoint(page, "line");
  const afterFirst = await interaction(page);
  ok(
    "one click records one reference and does not measure",
    afterFirst.stage === "selecting" && afterFirst.picked === 1,
    JSON.stringify(afterFirst)
  );

  // A DIFFERENT line, so the pair is genuinely two references.
  await clickFeatureMidpoint(page, "line", 1);
  const afterSecond = await interaction(page);
  ok(
    "two clicks STILL select - Enter decides",
    afterSecond.stage === "selecting" && afterSecond.picked === 2,
    JSON.stringify(afterSecond)
  );

  const kinds = await mainWorld(page, () => {
    const i = window.enggDrawing.state.interaction;
    return (i.dimensionPickedRefs || []).map(r => ({
      kind: r.kind,
      featureId: r.featureId,
      anchor: r.anchor
    }));
  });

  ok(
    "nothing is created before Enter",
    (await dimensions(page)).length === 0,
    "no dimension yet"
  );

  await page.keyboard.press("Enter");
  await page.waitForTimeout(350);

  ok(
    "Enter moves to placement",
    (await interaction(page)).stage === "placement",
    JSON.stringify(await interaction(page))
  );

  await clickWorld(page, 0.06, 0.95); // place the annotation
  await page.waitForTimeout(300);

  const dims = await dimensions(page);
  const angularDim = dims.find(d => d.type === "angular");

  ok("two lines create an ANGULAR dimension", !!angularDim, JSON.stringify(dims));

  const exact = angularDim && near(angularDim.value, wanted, 1e-6);
  ok(
    "the angle matches the lines' TRUE geometry",
    exact,
    `refs=${JSON.stringify(kinds)} wanted=${wanted} got=${angularDim?.value}`
  );

  // ---- A single line -> its LENGTH ----
  //
  // A FRESH line, well inside the canvas so the placement click cannot
  // land on its edge or off the sheet.
  await line(page, 0.1, 0.95, 0.35, 0.95, 300);

  await useDimensionTool(page);
  await clickFeatureMidpoint(page, "line");
  ok(
    "one click on a line is one reference",
    (await interaction(page)).picked === 1,
    JSON.stringify(await interaction(page))
  );

  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);

  const afterSingleEnter = await interaction(page);
  ok(
    "Enter on one reference moves to placement",
    afterSingleEnter.stage === "placement",
    JSON.stringify(afterSingleEnter)
  );

  await clickWorld(page, 0.45, 0.92);
  await page.waitForTimeout(300);

  const all = await dimensions(page);
  const lengths = all.filter(d => d.type !== "angular");
  const freshLength = lengths.find(d => near(d.value, 300, 1e-6));

  ok(
    "a single line yields ITS OWN length dimension",
    !!freshLength,
    JSON.stringify(all.map(d => `${d.type}:${d.value}${d.unit}`))
  );

  // ---- A single Beam -> 500 mm ----
  await activateStrict(page, "beam");
  await clickWorld(page, 0.6, 0.8);
  await clickWorld(page, 0.9, 0.8);
  await popup(page).waitFor({ state: "visible" });
  await page.locator(".drawing-creation-dimension-input").fill("500");
  await page.locator(".drawing-creation-dimension-input").press("Enter");
  await page.waitForTimeout(400);

  await useDimensionTool(page);
  await clickFeatureMidpoint(page, "beam");
  ok(
    "one click on a Beam is one reference",
    (await interaction(page)).picked === 1,
    JSON.stringify(await interaction(page))
  );

  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  await clickWorld(page, 0.7, 0.68);
  await page.waitForTimeout(300);

  const beamDim = (await dimensions(page)).find(
    d => d.type !== "angular" && near(d.value, 500, 1e-6)
  );

  ok("a single Beam yields a 500 mm length dimension", !!beamDim,
    JSON.stringify((await dimensions(page)).map(d => `${d.type}:${d.value}${d.unit}`)));

  // ---- Escape abandons the selection ----
  const beforeEsc = (await dimensions(page)).length;

  await useDimensionTool(page);
  await clickWorld(page, 0.32, 0.85);
  await clickWorld(page, 0.3, 0.5);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  const afterEsc = await interaction(page);
  ok(
    "Escape clears the accumulated references",
    afterEsc.picked === 0 && afterEsc.stage !== "selecting",
    JSON.stringify(afterEsc)
  );

  ok(
    "Escape creates nothing",
    (await dimensions(page)).length === beforeEsc,
    `${beforeEsc} -> ${(await dimensions(page)).length}`
  );
}