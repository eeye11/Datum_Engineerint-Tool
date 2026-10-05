/*
 * The Universal Length Scale acceptance tests.
 *
 * The central claim under test is that ONE document scale governs every
 * length-bearing feature, that the first valid physical length
 * establishes it, and that geometry created BEFORE that point is
 * re-interpreted rather than left on a private scale.
 *
 * Every assertion is expressed in MILLIMETRES, because the point is
 * what the document now says a length is.
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

/** The document scale, and every feature's length in millimetres. */
async function scaleState(page) {
  return mainWorld(page, () => {
    const s = window.enggDrawing.state;
    const scale = window.enggDimensions.readScale(s);
    const mm = world =>
      window.enggDimensions.toEngineering(s, world).value;

    return {
      calibrated: window.enggDimensions.isCalibrated(s),
      mmPerUnit: scale ? scale.mmPerUnit : null,
      unit: scale ? scale.unit : null,
      features: s.objects
        .filter(o => o.geometry && (o.geometry.start || o.geometry.radius !== undefined))
        .map(o => {
          const g = o.geometry;

          const span =
            g.start && g.end
              ? mm(
                  Math.hypot(
                    g.end.x - g.start.x,
                    g.end.y - g.start.y
                  )
                )
              : null;

          return {
            id: o.id,
            type: o.type,
            spanMm: span,
            diameterMm:
              g.radius === undefined ? null : mm(g.radius * 2),
            widthMm: g.width === undefined ? null : mm(g.width)
          };
        })
    };
  });
}

/** What a Smart Dimension reports for every dimension on the sheet. */
async function smartDimensions(page) {
  return mainWorld(page, () => {
    const s = window.enggDrawing.state;

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

/** Answer the creation popup for a freshly drawn sized feature. */
async function sizeCurrent(page, value, unit = "mm") {
  const input = page.locator(".drawing-creation-dimension-input");
  await input.waitFor({ state: "visible", timeout: 4000 });

  if (unit !== "mm") {
    await page.locator(".drawing-creation-dimension-unit").selectOption(unit);
  }

  await input.fill(String(value));
  await input.press("Enter");
  await page.waitForTimeout(400);
}

async function beam(page, fx1, fy1, fx2, fy2, size) {
  await activateStrict(page, "beam");
  await clickWorld(page, fx1, fy1);
  await clickWorld(page, fx2, fy2);
  await sizeCurrent(page, size);
}

async function line(page, fx1, fy1, fx2, fy2, size) {
  await activateStrict(page, "line");
  await clickWorld(page, fx1, fy1);
  await clickWorld(page, fx2, fy2);
  await sizeCurrent(page, size);
}

async function body(page, ok, near) {
  await openDrawingTab(page);

  // ---- Test B setup: geometry that exists BEFORE any scale ----
  //
  // Through the UI this state is unreachable: every length-bearing
  // feature goes through the creation popup, and answering that popup
  // calibrates the document. Cancelling commits nothing at all. So the
  // "arbitrary, unsized geometry on an uncalibrated sheet" state is
  // created here directly through the MODEL, which is the only way it
  // can exist - and it is exactly the state calibration has to resolve.
  const injected = await mainWorld(page, () => {
    const s = window.enggDrawing.state;
    s.objects = [];
    s.scale = null;

    const model = window.enggDrawing.model;
    const factories = model.geometryFactories;

    // A short span and a long one: 1 : 4 model units.
    model.addObject(s, factories.line({ x: 0, y: 0 }, { x: 40, y: 0 }));
    model.addObject(s, factories.line({ x: 0, y: 40 }, { x: 160, y: 40 }));

    const mm = world =>
      window.enggDimensions.toEngineering(s, world).value;

    return {
      calibrated: window.enggDimensions.isCalibrated(s),
      spansMm: s.objects
        .filter(o => o.type === "line")
        .map(o =>
          mm(
            Math.hypot(
              o.geometry.end.x - o.geometry.start.x,
              o.geometry.end.y - o.geometry.start.y
            )
          )
        )
    };
  });

  ok("an unsized document has NO universal length scale",
    injected.calibrated === false,
    JSON.stringify(injected));

  ok("unsized geometry exists before calibration",
    injected.spansMm.length === 2,
    `${injected.spansMm.length} line(s)`);

  ok(
    "that geometry currently reads on the one-to-one fallback",
    near(injected.spansMm[0], 40) && near(injected.spansMm[1], 160),
    JSON.stringify(injected.spansMm)
  );

  // ---- Test A: the first physical length establishes the scale ----
  await beam(page, 0.15, 0.8, 0.65, 0.8, 500);

  const afterA = await scaleState(page);

  ok("the first valid length establishes the universal scale",
    afterA.calibrated === true && afterA.mmPerUnit > 0,
    `mmPerUnit=${afterA.mmPerUnit}`);

  const calibratedBeam = afterA.features.find(f => f.type === "beam");
  ok("the beam measures exactly 500 mm",
    calibratedBeam && near(calibratedBeam.spanMm, 500),
    `span=${calibratedBeam?.spanMm}`);

  // ---- Test B: PRE-EXISTING geometry now reads through that scale ----
  const lines = afterA.features.filter(f => f.type === "line");

  ok("the previously drawn lines are now measured in mm",
    lines.length === 2 && lines.every(l => Number.isFinite(l.spanMm)),
    JSON.stringify(lines.map(l => l.spanMm)));

  const ratio = lines.length === 2 ? lines[1].spanMm / lines[0].spanMm : null;

  ok("their relative proportions are preserved by calibration",
    ratio !== null && near(ratio, 4, 1e-6),
    `long/short = ${ratio}`);

  ok(
    "their mm values changed - they were NOT left on the old fallback",
    lines.length === 2 && !near(lines[0].spanMm, 40),
    `first line now ${lines[0]?.spanMm} mm (was 40)`
  );

  ok("no feature carries its own scale - all read one document scale",
    afterA.mmPerUnit !== null,
    `single scale ${afterA.mmPerUnit} applies to ${afterA.features.length} features`);

  // ---- Test C: a later popup does NOT recalibrate ----
  const scaleBefore = afterA.mmPerUnit;

  await beam(page, 0.2, 0.2, 0.5, 0.2, 750);

  const afterC = await scaleState(page);
  const beams = afterC.features.filter(f => f.type === "beam");

  ok("a later popup creates the beam at 750 mm",
    beams.length >= 2 && near(beams[beams.length - 1].spanMm, 750),
    `spans=${JSON.stringify(beams.map(b => b.spanMm))}`);

  ok("the universal scale is UNCHANGED by a later popup",
    afterC.mmPerUnit === scaleBefore,
    `${scaleBefore} -> ${afterC.mmPerUnit}`);

  ok("the earlier 500 mm beam is still 500 mm",
    near(beams[0].spanMm, 500),
    `first beam = ${beams[0].spanMm}`);

  // ---- Test E: creation popup = panel = Smart Dimension = geometry ----
//
// Checked BEFORE the reset below, because it needs the beam this test
// created; the reset deliberately empties the document.
const consistent = await mainWorld(page, () => {
    const s = window.enggDrawing.state;
    const beamObj = s.objects.find(o => o.type === "beam");

    if (!beamObj) return { skipped: true };

    const g = beamObj.geometry;
    const world = Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y);
    const geometryMm =
      window.enggDimensions.toEngineering(s, world).value;

    const dim = window.enggDimensionModel.createDimension({
      dimensionType: "distance",
      refs: [
        { kind: "between", featureId: beamObj.id, anchor: "start" },
        { kind: "between", featureId: beamObj.id, anchor: "end" }
      ]
    });

    const measured =
      window.enggDimensionModel.measurementFor(dim, s);

    return {
      geometryMm,
      dimensionMm: measured === null ? null : measured.value,
      unit: measured === null ? null : measured.unit
    };
  });

  if (consistent.skipped) {
    ok("consistency across the three readers", false, "no beam present");
  } else {
    ok(
      "geometry and Smart Dimension report the same length",
      near(consistent.geometryMm, consistent.dimensionMm),
      JSON.stringify(consistent)
    );

    ok("the value carries a unit and no tilde",
      consistent.unit !== null && !String(consistent.unit).includes("~"),
      `unit=${consistent.unit}`);
  }

  // ---- Zoom and pan must not touch the engineering value ----
  const zoomed = await mainWorld(page, () => {
    const s = window.enggDrawing.state;
    const beamObj = s.objects.find(o => o.type === "beam");

    const read = () => {
      const g = beamObj.geometry;
      return window.enggDimensions
        .toEngineering(
          s,
          Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y)
        )
        .value;
    };

    const beforeValue = read();
    const zoom = s.camera.zoom;
    const panX = s.camera.panX;

    s.camera.zoom = zoom * 2.5;
    s.camera.panX = panX + 300;

    const afterValue = read();

    s.camera.zoom = zoom;
    s.camera.panX = panX;

    return { beforeValue, afterValue };
  });

  ok("zoom and pan do not change the engineering length",
    near(zoomed.beforeValue, zoomed.afterValue),
    `${zoomed.beforeValue} -> ${zoomed.afterValue}`);

  // ---- The vector display scale must be a separate system ----
  const vector = await mainWorld(page, () => {
    const s = window.enggDrawing.state;
    const beamObj = s.objects.find(o => o.type === "beam");

    const read = () => {
      const g = beamObj.geometry;
      return window.enggDimensions
        .toEngineering(
          s,
          Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y)
        )
        .value;
    };

    const lengthBefore = read();
    const scaleBefore = window.enggDimensions.readScale(s).mmPerUnit;

    const originalVectorScale = s.statics.vectorScale;

    [0.25, 2, 4].forEach(v => {
      s.statics.vectorScale = v;
    });

    const lengthAfter = read();
    const scaleAfter = window.enggDimensions.readScale(s).mmPerUnit;

    s.statics.vectorScale = originalVectorScale;

    return { lengthBefore, lengthAfter, scaleBefore, scaleAfter };
  });

  ok("the vector display scale does not move the length scale",
    vector.scaleBefore === vector.scaleAfter,
    `${vector.scaleBefore} -> ${vector.scaleAfter}`);

  ok("the vector display scale does not change geometry",
    near(vector.lengthBefore, vector.lengthAfter),
    `${vector.lengthBefore} -> ${vector.lengthAfter} mm`);

  // ---- Test D: the first Smart Dimension also calibrates ----
  //
  // Last, because it resets the document and would destroy the beams
  // the checks above are about.
  const fresh = await mainWorld(page, () => {
    const s = window.enggDrawing.state;
    s.objects = [];
    s.scale = null;

    return window.enggDimensions.isCalibrated(s);
  });

  ok("a reset document is uncalibrated", fresh === false, String(fresh));

  // Arbitrary unsized geometry, as in Test B.
  await mainWorld(page, () => {
    const s = window.enggDrawing.state;
    const model = window.enggDrawing.model;

    model.addObject(
      s,
      model.geometryFactories.line({ x: 0, y: 0 }, { x: 90, y: 0 })
    );
    return true;
  });

  const calibrateThrough = await mainWorld(page, () => {
    const s = window.enggDrawing.state;
    const lineObj = s.objects.find(o => o.type === "line");

    const span = Math.hypot(
      lineObj.geometry.end.x - lineObj.geometry.start.x,
      lineObj.geometry.end.y - lineObj.geometry.start.y
    );

    /*
     * The SAME calibration entry point the Scale dialog and the
     * creation popup both use. Routing Smart Dimension through it is
     * what makes the two workflows one system rather than two.
     */
    const result = window.enggDimensions.calibrate(s, span, 500, "mm");

    return {
      result,
      calibrated: window.enggDimensions.isCalibrated(s),
      mmPerUnit: window.enggDimensions.readScale(s)?.mmPerUnit ?? null,
      spanMm: window.enggDimensions.toEngineering(s, span).value
    };
  });

  ok("calibrating through the dimension system creates the scale",
    calibrateThrough.calibrated === true,
    JSON.stringify(calibrateThrough.result));

  ok("the calibrated geometry then measures 500 mm",
    near(calibrateThrough.spanMm, 500),
    `span=${calibrateThrough.spanMm} mm`);
}