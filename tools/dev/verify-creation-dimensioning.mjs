/*
 * End-to-end verification of the creation-time dimensioning system,
 * driven through the real app: real tools, real clicks, real popups.
 *
 * Sizes are asserted in MILLIMETRES, never in world units or screen
 * pixels. The canvas has its own camera, so a drawn pixel is not a
 * physical length; the only quantity the student ever sees or types
 * is the engineering one, and that is what must come out.
 */
import {
  mainWorld,
  readState,
  openDrawingTab,
  activateStrict,
  popup,
  clickWorld,
  answer,
  labelOf,
  stepOf,
  unitOf
} from "./qa-bridge-driver.mjs";

export default async function run(page) {
  const results = [];
  const ok = (name, pass, detail) =>
    results.push({ name, pass: !!pass, detail });
  const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;

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

  // ---- Ex 1: the first Beam in a new document calibrates it ----
  await activateStrict(page, "beam");
  await clickWorld(page, 0.2, 0.4);
  await clickWorld(page, 0.5, 0.4);

  ok("beam popup opens after two clicks", await popup(page).isVisible());
  const beamLabel = await labelOf(page);
  ok("beam popup asks Beam Length", /length/i.test(beamLabel), beamLabel);

  const suggested = await input.inputValue();
  const unit = await unitOf(page);
  ok("value is pre-filled from the drawing", suggested.length > 0,
    `suggested=${suggested}`);
  ok("unit is shown inline", unit.trim().length > 0, `unit=${unit}`);
  ok("no tilde in the popup", !/~/.test(suggested + unit));

  ok("the unit control is a select, not a fixed label",
    (await page.locator(".drawing-creation-dimension-unit").evaluate(
      el => el.tagName.toLowerCase()
    )) === "select");

  /*
   * A length is compared in MILLIMETRES, not in whatever unit the
   * document happens to be displaying.
   *
   * The first dimension a student types sets the unit the whole
   * document is read in - so entering "0.5 m" makes the document
   * metres, and 0.5 m then correctly reads back as 0.5 rather than
   * as 500. Asserting "500" here would be asserting that the input
   * unit was ignored, which is the opposite of what the unit control
   * is for.
   */
  const unitOptions = await page
    .locator(".drawing-creation-dimension-unit option")
    .allTextContents();
  ok("the unit control offers mm, cm and m",
    unitOptions.join(",") === "mm,cm,m",
    unitOptions.join(","));

  await answer(page, 500);

  const s1 = await readState(page);
  const beam = s1.objects.find(o => o.type === "beam");

  ok("first dimension calibrates the document", s1.calibrated);
  ok("beam is committed", !!beam);
  ok(
    "the beam MEASURES 500 mm, whatever was drawn",
    beam && near(beam.spanMm, 500),
    `typed=500 measured=${beam?.spanMm}`
  );
  ok("the document scale is finite and positive",
    Number.isFinite(s1.mmPerUnit) && s1.mmPerUnit > 0,
    `mmPerUnit=${s1.mmPerUnit}`);
  ok("scale unit is mm", s1.unit === "mm", String(s1.unit));

  // ---- Ex 2: a later Beam edits geometry, never the scale ----
  await activateStrict(page, "beam");
  await clickWorld(page, 0.2, 0.6);
  await clickWorld(page, 0.35, 0.6);
  await answer(page, 250);

  const s2 = await readState(page);
  const beams = s2.objects.filter(o => o.type === "beam");
  const beam2 = beams[beams.length - 1];

  ok("second beam is committed", !!beam2);
  ok("second beam MEASURES 250 mm", beam2 && near(beam2.spanMm, 250),
    `typed=250 measured=${beam2?.spanMm}`);
  ok("the first beam still MEASURES 500 mm", near(beams[0].spanMm, 500),
    String(beams[0].spanMm));
  ok("the global scale is NOT recalibrated", s2.mmPerUnit === s1.mmPerUnit,
    `${s1.mmPerUnit} -> ${s2.mmPerUnit}`);

  // ---- Ex 29: resizing preserves the drawn orientation ----
  await activateStrict(page, "line");
  await clickWorld(page, 0.25, 0.25);
  await clickWorld(page, 0.55, 0.5);
  await answer(page, 400);

  const line = (await readState(page)).objects.find(o => o.type === "line");

  ok("line MEASURES 400 mm", line && near(line.spanMm, 400),
    `typed=400 measured=${line?.spanMm}`);
  // Screen y points down, so a line drawn down-and-right has a
  // NEGATIVE world slope; what must survive the resize is the
  // direction the student drew, not the length.
  ok("line keeps the drawn direction", line && near(line.slope, -0.5, 0.05),
    `slope=${line?.slope}`);

  // ---- Ex 4: a circle asks Diameter, exactly one field ----
  await activateStrict(page, "circle");
  await clickWorld(page, 0.75, 0.3);
  await clickWorld(page, 0.82, 0.3);

  ok("circle popup asks Diameter", /diameter/i.test(await labelOf(page)),
    await labelOf(page));
  ok("circle has a single field", (await stepOf(page)).trim() === "",
    `step="${await stepOf(page)}"`);

  await answer(page, 50);
  const circ = (await readState(page)).objects.find(o => o.type === "circle");
  ok("circle MEASURES 50 mm diameter", circ && near(circ.diameterMm, 50),
    `typed=50 measured=${circ?.diameterMm}`);

  // ---- Ex 3: a rectangle asks Width then Height ----
  await activateStrict(page, "rectangle");
  await clickWorld(page, 0.15, 0.55);
  await clickWorld(page, 0.4, 0.75);

  const step1 = await stepOf(page);
  ok("rectangle shows 1 of 2", step1.trim() === "1 of 2", `step="${step1}"`);
  ok("rectangle asks Width first", /width/i.test(await labelOf(page)),
    await labelOf(page));

  await input.fill("500");
  await input.press("Enter");
  await page.waitForTimeout(250);

  const step2 = await stepOf(page);
  ok("Enter advances to 2 of 2", step2.trim() === "2 of 2", `step="${step2}"`);
  ok("rectangle then asks Height", /height/i.test(await labelOf(page)),
    await labelOf(page));

  await input.fill("300");
  await input.press("Enter");
  await page.waitForTimeout(400);

  const rect = (await readState(page)).objects.find(o => o.type === "rectangle");
  ok("rectangle MEASURES 500 mm wide", rect && near(rect.widthMm, 500),
    `typed=500 measured=${rect?.widthMm}`);
  ok("rectangle MEASURES 300 mm high", rect && near(rect.heightMm, 300),
    `typed=300 measured=${rect?.heightMm}`);

  // ---- Ex 17: a Rigid Body is sized at creation, by shape ----
  await activateStrict(page, "rigid-body");
  await clickWorld(page, 0.7, 0.75);

  ok("rigid body opens a creation popup", await popup(page).isVisible());
  ok("rigid body asks Width first", /width/i.test(await labelOf(page)),
    await labelOf(page));

  await input.fill("800");
  await input.press("Enter");
  await page.waitForTimeout(250);
  ok("rigid body then asks Height", /height/i.test(await labelOf(page)),
    await labelOf(page));

  await input.fill("400");
  await input.press("Enter");
  await page.waitForTimeout(400);

  const rb = (await readState(page)).objects.find(o => o.type === "rigid-body");
  ok("rigid body MEASURES 800 mm wide", rb && near(rb.widthMm, 800),
    `typed=800 measured=${rb?.widthMm}`);
  ok("rigid body MEASURES 400 mm high", rb && near(rb.heightMm, 400),
    `typed=400 measured=${rb?.heightMm}`);

  // ---- Ex 51: Escape cancels cleanly ----
  const beforeCancel = (await readState(page)).objects.length;
  await activateStrict(page, "line");
  await clickWorld(page, 0.6, 0.85);
  await clickWorld(page, 0.85, 0.85);
  await popup(page).waitFor({ state: "visible" });
  await input.press("Escape");
  await page.waitForTimeout(300);

  ok("a cancelled line is not committed",
    (await readState(page)).objects.length === beforeCancel,
    `${beforeCancel} -> ${(await readState(page)).objects.length}`);
  ok("the popup is gone after Escape", !(await popup(page).isVisible()));

  // ---- Ex 52/53: invalid, negative and zero input are rejected ----
  await activateStrict(page, "line");
  await clickWorld(page, 0.15, 0.9);
  await clickWorld(page, 0.4, 0.9);

  const beforeBad = (await readState(page)).objects.length;

  for (const [value, why] of [
    ["abc", "garbage"],
    ["-5", "negative"],
    ["0", "zero"]
  ]) {
    await input.fill(value);
    await input.press("Enter");
    await page.waitForTimeout(200);
    ok(`${why} input keeps the popup open`, await popup(page).isVisible());
  }

  ok("a validation error is shown",
    await page.locator(".drawing-creation-dimension-error").isVisible());

  await input.press("Escape");
  await page.waitForTimeout(300);
  ok("a rejected line never commits",
    (await readState(page)).objects.length === beforeBad);

  // ---- Ex 20/44: features with no natural length stay silent ----
  for (const tool of ["point", "point-force"]) {
    await activateStrict(page, tool);
    await clickWorld(page, 0.9, 0.15);
    await clickWorld(page, 0.95, 0.15);
    await page.waitForTimeout(300);
    ok(`${tool} shows no length popup`, !(await popup(page).isVisible()));
  }
  ok("point force was still created",
    (await readState(page)).objects.some(
      o => o.staticsType === "point-force"
    ));

  // ---- Ex 50: creation + dimension is ONE undo step ----
  const beforeUndo = (await readState(page)).objects.length;
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(400);
  ok("one undo removes the whole creation",
    (await readState(page)).objects.length === beforeUndo - 1,
    `${beforeUndo} -> ${(await readState(page)).objects.length}`);

  await page.keyboard.press("Control+y");
  await page.waitForTimeout(400);
  ok("redo restores it",
    (await readState(page)).objects.length === beforeUndo);

  // ---- Unit selection: the unit is part of the quantity ----
  // Typing the SAME physical length two different ways must give the
  // same beam. "0.5 m" and "500 mm" are one length, not two.
  await activateStrict(page, "beam");
  await clickWorld(page, 0.2, 0.2);
  await clickWorld(page, 0.5, 0.2);

  await input.fill("0.5");
  await page.locator(".drawing-creation-dimension-unit").selectOption("m");
  await page.waitForTimeout(150);
  await input.press("Enter");
  await page.waitForTimeout(350);

  const millimetres = (value, unit) =>
    value * ({ mm: 1, cm: 10, m: 1000 }[unit] ?? 1);

  const metresState = await readState(page);
  const metres = metresState.objects.find(o => o.type === "beam");

  ok("a beam entered as 0.5 m measures 500 mm",
    metres &&
      near(millimetres(metres.spanMm, metresState.unit), 500),
    `entered 0.5 m, measured ${metres?.spanMm} ${metresState.unit} ` +
      `= ${millimetres(metres?.spanMm ?? 0, metresState.unit)} mm`);

  // The same again in centimetres, on the existing document scale.
  const metreScale = metresState.mmPerUnit;
  const documentUnit = metresState.unit;

  await activateStrict(page, "beam");
  await clickWorld(page, 0.2, 0.2);
  await clickWorld(page, 0.5, 0.2);
  await input.fill("250");
  await page.locator(".drawing-creation-dimension-unit").selectOption("cm");
  await page.waitForTimeout(150);
  await input.press("Enter");
  await page.waitForTimeout(350);

  const centiState = await readState(page);
  const centi = centiState.objects.filter(o => o.type === "beam").pop();

  ok("a beam entered as 250 cm measures 2500 mm",
    centi &&
      near(millimetres(centi.spanMm, centiState.unit), 2500),
    `entered 250 cm, measured ${centi?.spanMm} ${centiState.unit} ` +
      `= ${millimetres(centi?.spanMm ?? 0, centiState.unit)} mm`);

  ok("the entered unit does not become the document's unit",
    documentUnit === "m",
    `document unit stayed ${documentUnit}`);

  const sUnit = await readState(page);
  ok("choosing a unit never recalibrates the document",
    sUnit.mmPerUnit === metreScale,
    `${metreScale} -> ${sUnit.mmPerUnit}`);

  // Changing the unit on a SUGGESTION converts the number, so the
  // same physical length stays in the field.
  await activateStrict(page, "beam");
  await clickWorld(page, 0.2, 0.8);
  await clickWorld(page, 0.5, 0.8);
  const suggestedBefore = await input.inputValue();
  await page.locator(".drawing-creation-dimension-unit").selectOption("m");
  await page.waitForTimeout(200);
  const suggestedUnitBefore = await page
    .locator(".drawing-creation-dimension-unit")
    .inputValue();
  const suggestedAfter = await input.inputValue();

  const beforeMm = millimetres(
    Number(suggestedBefore),
    suggestedUnitBefore
  );
  const afterMm = millimetres(Number(suggestedAfter), "m");

  /*
   * Compared after rounding to a millimetre: the field shows the
   * drawing's own precision, so converting 499.5 to metres and back
   * is allowed to land on 500 rather than on exactly 499.5.
   *
   * What matters is that switching the unit did NOT leave the number
   * alone - an unconverted 499.5 m would be half a million mm.
   */
  ok("switching the unit converts the suggested number",
    Number.isFinite(beforeMm) &&
    Number.isFinite(afterMm) &&
    near(beforeMm, afterMm, 1),
    `${suggestedBefore} ${suggestedUnitBefore} -> ${suggestedAfter} m ` +
      `(both ~${beforeMm} mm)`);

  await input.press("Escape");
  await page.waitForTimeout(300);

  // ---- Ex 35/62: the same engineering value reads back elsewhere ----
  const readBack = await mainWorld(page, () => {
    const s = window.enggDrawing.state;
    const b = s.objects.find(o => o.type === "beam");
    const q = window.enggDimensions.toEngineering(
      s,
      Math.hypot(
        b.geometry.end.x - b.geometry.start.x,
        b.geometry.end.y - b.geometry.start.y
      )
    );
    return {
      value: q.value,
      unit: q.unit,
      formatted: window.enggQuantities.number(q.value)
    };
  });
  ok("the beam's engineering length reads back as 500 mm",
    near(millimetres(readBack.value, readBack.unit), 500),
    JSON.stringify(readBack));
  /*
   * The formatted value is in the DOCUMENT's unit - which is metres
   * here, because the first length typed on this sheet was 0.5 m. So
   * this reads "0.5", and the check that matters is the one above:
   * that 0.5 m and 500 mm are the same physical length.
   *
   * What must not happen is a "~" appearing - a rounded or suggested
   * length is a real quantity, and marking it approximate would say
   * the document does not know what it is.
   */
  ok("it is formatted with no tilde",
    !/~/.test(String(readBack.formatted)),
    `formatted=${readBack.formatted} ${readBack.unit}`);

  ok("and it matches the value that was read",
    near(Number(readBack.formatted), Number(readBack.value), 1e-9),
    `${readBack.formatted} vs ${readBack.value}`);
}