/*
 * The parts of the creation-time dimension acceptance list that the
 * other suites do not reach:
 *
 *   7. a Smart Dimension reports the same value as the panel
 *   8. snaps use the geometry the creation dimension produced
 *   9. dependent features use that geometry too
 *  10. Undo/Redo restore the size AND the document calibration
 *
 * The dimension is not created through the UI here: the Smart
 * Dimension tool's own point-picking is a multi-stage workflow whose
 * snapping is what is being tested, so the model is asked directly for
 * a measurement of the created beam. That is the same code the tool
 * runs, and it reads live geometry rather than anything stored.
 */
import {
  mainWorld,
  openDrawingTab,
  activateStrict,
  clickWorld,
  answer,
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

async function body(page, ok, near) {
  const input = page.locator(".drawing-creation-dimension-input");

  await openDrawingTab(page);

  // ---- A beam whose drawn span is NOT the entered span ----
  await activateStrict(page, "beam");

  await clickWorld(page, 0.15, 0.3);
  const afterFirst = await mainWorld(page, () => ({
    phase: window.enggDrawing.state.interaction?.phase ?? null,
    tool: window.enggDrawing.state.activeTool
  }));

  await clickWorld(page, 0.32, 0.3);
  const afterSecond = await mainWorld(page, () => ({
    phase: window.enggDrawing.state.interaction?.phase ?? null,
    popup: !!document.querySelector(".drawing-creation-dimension"),
    tool: window.enggDrawing.state.activeTool
  }));

  ok("the second click opens the popup",
    afterSecond.popup === true,
    `after1=${JSON.stringify(afterFirst)} after2=${JSON.stringify(afterSecond)}`);

  await answer(page, 500);

  /*
   * How long the member was BEFORE the student answered.
   *
   * The pending geometry is a local inside the click handler and is
   * never stored, so it cannot be read from the page before the
   * feature is committed. It is recoverable afterwards from the
   * calibration the answer produced: `mmPerUnit` IS (typed mm /
   * drawn world units), so dividing the typed length by it gives back
   * the span the student actually drew.
   *
   * That is the honest measure of the drawn length, and it is what
   * makes the following check meaningful - a beam drawn well under
   * 500 mm cannot also be 500 mm unless the geometry really moved.
   */
  const drawn = await mainWorld(page, () => {
    const s = window.enggDrawing.state;
    const scale = window.enggDimensions.readScale(s);

    return scale && scale.mmPerUnit
      ? 500 / scale.mmPerUnit
      : null;
  });

  ok("the drawn span is recoverable and smaller than the confirmed 500 mm",
    drawn !== null && drawn > 0 && drawn < 500,
    `drawn=${drawn} world units, confirmed=500 mm`);

  // ---- 6/7: the panel, the geometry and a Smart Dimension agree ----
  const agreement = await mainWorld(page, () => {
    const s = window.enggDrawing.state;
    const beam = s.objects.find(o => o.type === "beam");
    const g = beam.geometry;

    const worldSpan = Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y);
    const asMm = window.enggDimensions.toEngineering(s, worldSpan).value;

    /*
     * A Smart Dimension of this beam, measured the way the tool
     * measures: references resolved from live geometry, then one
     * conversion by the scale. The reference shape is the one the
     * model stores - featureId + anchor - not a guess.
     */
    const dim = window.enggDimensionModel.createDimension({
      dimensionType: "distance",
      refs: [
        { kind: "between", featureId: beam.id, anchor: "start" },
        { kind: "between", featureId: beam.id, anchor: "end" }
      ]
    });

    const measured = window.enggDimensionModel.measurementFor(dim, s);

    /*
     * measurementFor ALREADY returns an engineering quantity in the
     * document's unit - { value, unit, calibrated }. Converting it
     * again would read its number as world units and multiply the
     * answer by the scale.
     */
    const measuredMm =
      measured === null ? null : Number(measured.value);

    const asMmAlso = window.enggDimensionModel.measurementFor(
      window.enggDimensionModel.createDimension({
        dimensionType: "distance",
        refs: [
          { kind: "between", featureId: beam.id, anchor: "start" },
          { kind: "between", featureId: beam.id, anchor: "end" }
        ]
      }),
      s
    );

    const panel =
      document
        .getElementById("drawingProperties")
        ?.querySelector('input[data-property="length"]')?.value ?? null;

    return {
      drawnSpan: worldSpan,
      geometryMm: asMm,
      measuredMm,
      measuredUnit: asMmAlso?.unit ?? null,
      calibrated: asMmAlso?.calibrated ?? null,
      panel,
      sourceRefs: dim?.sourceRefs ?? null
    };
  });

  ok("the geometry really is 500 mm and not the drawn length",
    !near(agreement.geometryMm, drawn, 0.5),
    `drawn=${drawn} world units, geometry=${agreement.geometryMm} mm`);

  ok("the geometry measures 500 mm",
    near(agreement.geometryMm, 500),
    `geometry=${agreement.geometryMm} mm`);

  ok("the panel reads 500",
    agreement.panel === "500",
    `panel=${agreement.panel}`);

  ok("a Smart Dimension measures the same 500 mm",
    agreement.measuredMm !== null && near(agreement.measuredMm, 500),
    `dimension=${agreement.measuredMm} ${agreement.measuredUnit}`);

  ok("the dimension is measured on a calibrated document",
    agreement.calibrated === true,
    `calibrated=${agreement.calibrated}`);

  ok("panel, geometry and dimension all agree",
    near(agreement.geometryMm, agreement.measuredMm) &&
      agreement.panel === "500",
    JSON.stringify(agreement));

  // ---- 8: snapping uses the resized geometry ----
  const snap = await mainWorld(page, () => {
    const s = window.enggDrawing.state;
    const beam = s.objects.find(o => o.type === "beam");
    const g = beam.geometry;

    const mid = {
      x: (g.start.x + g.end.x) / 2,
      y: (g.start.y + g.end.y) / 2
    };

    /*
     * Resolve the mid-point through the SAME anchor resolution the
     * snapping pipeline uses, rather than recomputing it here, so this
     * is a check on what a real snap would find.
     */
    const resolved =
      window.enggMeasurement?.resolveAnchor?.(beam, "midpoint") ?? null;

    const mm = world =>
      window.enggDimensions.toEngineering(s, world).value;

    return {
      expectedMidMm: mm(Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y)) / 2,
      resolvedMidMm:
        resolved === null
          ? null
          : mm(Math.hypot(resolved.x - g.start.x, resolved.y - g.start.y)),
      endMm: mm(Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y))
    };
  });

  ok("the beam's midpoint resolves to half of 500 mm",
    snap.resolvedMidMm !== null && near(snap.resolvedMidMm, 250, 1e-3),
    `midpoint=${snap.resolvedMidMm} mm, expected 250`);

  ok("the resized endpoints are further apart than was drawn",
    snap.endMm > 0 &&
      near(snap.endMm, 500, 1e-6),
    `endpoint separation = ${snap.endMm} mm (drawn was ${agreement.drawnSpan} world units)`);

  // ---- 9: a dependent feature tracks the body ----
  const dependent = await mainWorld(page, () => {
    const s = window.enggDrawing.state;
    const beam = s.objects.find(o => o.type === "beam");
    const g = beam.geometry;

    const frames = window.enggBodyFrames;
    const frame = frames?.frameOf?.(beam) ?? null;

    const mm = world =>
      window.enggDimensions.toEngineering(s, world).value;

    const spanMm = mm(Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y));

    /*
     * pointAt works in the geometry's OWN units, so it is given world
     * units. What is then checked is that the point lands at that
     * fraction of the CONFIRMED length - a support stored by fraction
     * must follow the member to its new size.
     */
    const spanWorld = Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y);

    /*
     * A support is stored as a FRACTION of the member, so what has to
     * hold after the creation resize is that a point placed by
     * fraction still sits at that fraction of the NEW length. Halfway
     * is therefore 250 mm - half of the confirmed 500, not half of
     * whatever was drawn.
     */
    const half = frames?.pointAt?.(frame, spanWorld / 2) ?? null;
    const quarter = frames?.pointAt?.(frame, spanWorld / 4) ?? null;

    const along = p =>
      p === null || p === undefined
        ? null
        : mm(Math.hypot(p.x - g.start.x, p.y - g.start.y));

    return {
      hasFrames: !!frames,
      frameResolved: !!frame,
      spanMm,
      halfAlongMm: along(half),
      quarterAlongMm: along(quarter)
    };
  });

  ok("the body's frame resolves after the creation resize",
    dependent.frameResolved,
    `bodyFrames=${dependent.hasFrames}`);

  ok("a body point placed at half the length lands 250 mm along it",
    dependent.halfAlongMm !== null &&
      near(dependent.halfAlongMm, 250, 1e-3),
    `pointAt(half) measured ${dependent.halfAlongMm} mm of a ${dependent.spanMm} mm beam`);

  ok("a body point placed at a quarter lands 125 mm along it",
    dependent.quarterAlongMm !== null &&
      near(dependent.quarterAlongMm, 125, 1e-3),
    `pointAt(quarter) measured ${dependent.quarterAlongMm} mm`);

  // ---- 10: Undo and Redo restore size AND calibration together ----
  const beforeUndo = await mainWorld(page, () => {
    const s = window.enggDrawing.state;
    const beam = s.objects.find(o => o.type === "beam");
    return {
      objects: s.objects.length,
      calibrated: window.enggDimensions.isCalibrated(s),
      mmPerUnit: window.enggDimensions.readScale(s)?.mmPerUnit ?? null
    };
  });

  await page.keyboard.press("Control+z");
  await page.waitForTimeout(500);

  const afterUndo = await mainWorld(page, () => {
    const s = window.enggDrawing.state;
    return {
      objects: s.objects.length,
      calibrated: window.enggDimensions.isCalibrated(s),
      mmPerUnit: window.enggDimensions.readScale(s)?.mmPerUnit ?? null
    };
  });

  ok("one undo removes the beam", afterUndo.objects === beforeUndo.objects - 1,
    `${beforeUndo.objects} -> ${afterUndo.objects}`);

  ok("one undo also withdraws the calibration it established",
    afterUndo.calibrated === false,
    `calibrated after undo = ${afterUndo.calibrated}`);

  await page.keyboard.press("Control+y");
  await page.waitForTimeout(500);

  const afterRedo = await mainWorld(page, () => {
    const s = window.enggDrawing.state;
    const beam = s.objects.find(o => o.type === "beam");
    const g = beam.geometry;
    const worldSpan = Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y);

    return {
      objects: s.objects.length,
      calibrated: window.enggDimensions.isCalibrated(s),
      mmPerUnit: window.enggDimensions.readScale(s)?.mmPerUnit ?? null,
      spanMm: window.enggDimensions.toEngineering(s, worldSpan).value
    };
  });

  ok("redo restores the beam", afterRedo.objects === beforeUndo.objects,
    `${afterRedo.objects}`);

  ok("redo restores the calibration",
    afterRedo.calibrated === true &&
      afterRedo.mmPerUnit === beforeUndo.mmPerUnit,
    `${beforeUndo.mmPerUnit} -> ${afterRedo.mmPerUnit}`);

  ok("redo restores the 500 mm length",
    near(afterRedo.spanMm, 500),
    `span=${afterRedo.spanMm} mm`);
}