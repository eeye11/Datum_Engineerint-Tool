/*
 * Persistence check: the document scale established by the FIRST
 * creation dimension, and the geometry every dimension set, must
 * survive a save/reload cycle.
 */
import {
  mainWorld,
  readState,
  openDrawingTab,
  activateStrict,
  clickWorld,
  answer
} from "./qa-bridge-driver.mjs";

export default async function run(page) {
  const results = [];
  const ok = (n, p, d) => results.push({ name: n, pass: !!p, detail: d });
  const near = (a, b) => Math.abs(a - b) < 1e-6;

  await openDrawingTab(page);

  await activateStrict(page, "beam");
  await clickWorld(page, 0.2, 0.4);
  await clickWorld(page, 0.5, 0.4);
  await answer(page, 500);

  await activateStrict(page, "beam");
  await clickWorld(page, 0.2, 0.6);
  await clickWorld(page, 0.35, 0.6);
  await answer(page, 250);

  // Round-trip through the document model's OWN save/load path: the
  // same serialize/restore the Save and Open commands use.
  const before = await readState(page);

  ok("calibrated before reload", before.calibrated);
  ok("two beams exist",
    before.objects.filter(o => o.type === "beam").length === 2);

  const after = await mainWorld(page, () => {
    const live = window.enggDrawing.state;
    const model = window.enggDrawing.model;

    const body = JSON.parse(model.serializeDrawing(live));

    const fresh = model.createDrawingState();

    const file = window.enggDocumentFile.createDocument(body);
    const read = window.enggDocumentFile.readDocument(file);

    if (!read.ok) return { skipped: true, detail: read.detail };

    model.restoreDocument(fresh, read.document ?? read.body ?? read.value);

    const scale = window.enggDimensions.readScale(fresh);

    return {
      calibrated: window.enggDimensions.isCalibrated(fresh),
      mmPerUnit: scale ? scale.mmPerUnit : null,
      readKeys: Object.keys(read),
      beams: fresh.objects.filter(o => o.type === "beam").map(b => ({
        spanMm: window.enggDimensions
          .toEngineering(
            fresh,
            Math.hypot(
              b.geometry.end.x - b.geometry.start.x,
              b.geometry.end.y - b.geometry.start.y
            )
          ).value
      }))
    };
  });

  ok("document file model was found", !after.skipped,
    JSON.stringify(after).slice(0, 200));
  ok("calibration survives reload", after.calibrated === true,
    String(after.calibrated));
  ok("the scale value survives reload",
    near(after.mmPerUnit, before.mmPerUnit),
    `${before.mmPerUnit} -> ${after.mmPerUnit}`);
  ok("both beams survive reload", (after.beams || []).length === 2,
    JSON.stringify(after.beams));
  ok("the 500 mm beam still reads 500",
    (after.beams || [])[0] && near(after.beams[0].spanMm, 500),
    JSON.stringify(after.beams?.[0]));
  ok("the 250 mm beam still reads 250",
    (after.beams || [])[1] && near(after.beams[1].spanMm, 250),
    JSON.stringify(after.beams?.[1]));

  const after2 = await mainWorld(page, () => {
    const live = window.enggDrawing.state;
    const model = window.enggDrawing.model;
    const file = window.enggDocumentFile;
    const body = JSON.parse(model.serializeDrawing(live));
    const payload = file.createDocument(body);
    const read = file.readDocument(payload);
    return { ok: read.ok, keys: Object.keys(read), detail: read.detail };
  });

  return {
    roundTripShape: after2,
    passed: results.filter(r => r.pass).length,
    total: results.length,
    failed: results.filter(r => !r.pass)
  };
}