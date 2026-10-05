/*
 * "Length" is the one word for the end-to-end distance of a
 * length-bearing body, and it is editable on every one of them -
 * including the cable, where it previously did nothing.
 */
import {
  mainWorld,
  openDrawingTab,
  selectDiscipline,
  activateStrict,
  clickWorld
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

/** Draw a statics member and give it a size at creation. */
async function member(page, toolId, size) {
  await activateStrict(page, toolId);
  await clickWorld(page, 0.15, 0.75);

  /*
   * A TRUSS is a multi-click construction finished with Enter, so it
   * needs its own ending; everything else here is a two-click span.
   */
  if (toolId === "truss") {
    await clickWorld(page, 0.4, 0.6);
    await clickWorld(page, 0.55, 0.75);

    const memberCount = await mainWorld(
      page,
      () => window.enggDrawing.state.interaction?.phase ?? ""
    );

    if (String(memberCount).includes("truss")) {
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
    }
  } else {
    await clickWorld(page, 0.55, 0.75);
  }

  /*
   * Not every length-bearing member opens the creation popup - a
   * Reference Line is construction geometry and is committed on the
   * second click. So the popup is optional here, and the members are
   * sized afterwards through the panel, which is the behaviour this
   * suite is actually about.
   */
  const input = page.locator(".drawing-creation-dimension-input");

  try {
    await input.waitFor({ state: "visible", timeout: 2500 });
    await input.fill(String(size));
    await input.press("Enter");
  } catch {
    // No creation popup for this one.
  }

  await page.waitForTimeout(500);
}

/** The GEOMETRY rows currently on the panel for the selection. */
async function panelRows(page) {
  return mainWorld(page, () => {
    const host = document.getElementById("drawingProperties");

    if (!host) return null;

    return Array.from(host.querySelectorAll("input[data-property]")).map(
      i => ({
        property: i.dataset.property,
        value: i.value,
        disabled: i.disabled,
        label: (
          i.closest(".drawing-property-grid")?.querySelector(
            ".drawing-property-grid-label"
          )?.textContent || ""
        ).trim()
      })
    );
  });
}

/** The member's length in millimetres, read from the geometry. */
async function lengthMm(page, type) {
  return mainWorld(page, t => {
    const s = window.enggDrawing.state;
    const o = s.objects.filter(x => x.type === t).pop();

    if (!o) return null;

    const g = o.geometry;
    const world = Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y);

    return {
      mm: window.enggDimensions.toEngineering(s, world).value,
      world
    };
  }, type);
}

/** Type a new Length into the panel and press Enter. */
async function editLength(page, value) {
  const field = page
    .locator('#drawingProperties input[data-property="length"]')
    .first();

  await field.fill(String(value));
  await field.press("Enter");
  await page.waitForTimeout(400);
}

async function body(page, ok, near) {
  await openDrawingTab(page);
  await selectDiscipline(page, "STATICS");

  // ---- The cable: the case that was broken ----
  await member(page, "cable", 500);

  let cablePanel = await panelRows(page);
  const cableLengthField = (cablePanel || []).find(
    r => r.property === "length"
  );

  ok("the cable panel has a Length field",
    !!cableLengthField,
    JSON.stringify(cablePanel));

  ok("it is named Length, not Span",
    cableLengthField?.label === "Length",
    `label="${cableLengthField?.label}"`);

  ok("it is editable", cableLengthField && !cableLengthField.disabled,
    `disabled=${cableLengthField?.disabled}`);

  const cableBefore = await lengthMm(page, "cable");
  ok("the cable is 500 mm after creation",
    cableBefore && near(cableBefore.mm, 500),
    `${cableBefore?.mm} mm`);

  await editLength(page, 800);

  const cableAfter = await lengthMm(page, "cable");

  ok("editing the cable Length to 800 actually changes the GEOMETRY",
    cableAfter && near(cableAfter.mm, 800),
    `before=${cableBefore?.mm} after=${cableAfter?.mm}`);

  ok("the geometry really moved, not just the label",
    cableAfter && cableBefore && !near(cableAfter.world, cableBefore.world),
    `world ${cableBefore?.world} -> ${cableAfter?.world}`);

  const cablePanelAfter = await panelRows(page);
  const cableRead = (cablePanelAfter || []).find(
    r => r.property === "length"
  );

  ok("the cable panel reads back 800",
    cableRead?.value === "800",
    `panel=${cableRead?.value}`);

  // ---- Every other member uses the same word and the same behaviour ----
  for (const [toolId, label] of [
    ["beam", "Beam"],
    ["shaft", "Shaft"],
    ["reference-line", "Reference Line"]
  ]) {
    await member(page, toolId, 400);

    const rows = await panelRows(page);
    const field = (rows || []).find(r => r.property === "length");

    ok(`${label} names the field "Length"`, field?.label === "Length",
      `${label}: label="${field?.label}"`);

    ok(`${label} Length is editable`, field && !field.disabled,
      `${label}: disabled=${field?.disabled}`);

    await editLength(page, 900);

    const after = await lengthMm(
      page,
      toolId === "reference-line" ? "line" : toolId
    );

    ok(`${label} Length edit resizes the geometry`,
      after && near(after.mm, 900),
      `${label}: ${after?.mm} mm`);
  }

  // ---- The truss: its Length must be named and editable too ----
  //
  // Created at the model level because a truss is a multi-click
  // construction with its own Enter-to-finish, which is not what this
  // check is about; what matters is the PANEL for a truss, and that is
  // read from a real committed truss.
  await mainWorld(page, () => {
    const s = window.enggDrawing.state;
    const model = window.enggDrawing.model;

    const truss = model.geometryFactories.truss
      ? model.geometryFactories.truss(
          [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 60 }
          ],
          { height: 60 }
        )
      : null;

    if (truss) model.addObject(s, truss);
    return !!truss;
  });

  await mainWorld(page, id => {
    const s = window.enggDrawing.state;
    const truss = s.objects.filter(o => o.type === "truss").pop();

    if (truss) window.enggDrawing.model.selectObject(s, truss.id);

    return !!truss;
  });

  await page.waitForTimeout(400);

  const trussRows = await panelRows(page);
  const trussField = (trussRows || []).find(r => r.property === "length");

  ok('Truss names the field "Length"', trussField?.label === "Length",
    `label="${trussField?.label}" rows=${JSON.stringify(trussRows)}`);

  ok("Truss Length is editable", trussField && !trussField.disabled,
    `disabled=${trussField?.disabled}`);

  // ---- No member uses the word "Span" for its length ----
  const anySpan = await mainWorld(page, () => {
    const host = document.getElementById("drawingProperties");

    return Array.from(
      host?.querySelectorAll(".drawing-property-grid-label") || []
    )
      .map(e => (e.textContent || "").trim())
      .filter(t => /span/i.test(t));
  });

  ok("no panel calls its length a Span",
    anySpan.length === 0,
    JSON.stringify(anySpan));
}