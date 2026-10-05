/*
 * The Feature panel must show the entered value, and editing it there
 * must move the same geometry the creation popup moved.
 */
import {
  mainWorld,
  readState,
  openDrawingTab,
  activateStrict,
  clickWorld,
  answer,
  popup
} from "./qa-bridge-driver.mjs";

const results = [];
const ok = (n, p, d) => results.push({ name: n, pass: !!p, detail: d });
const near = (a, b, t = 1e-6) => Math.abs(a - b) < t;

async function panelInputs(page) {
  return mainWorld(page, () => {
    const host = document.getElementById("drawingProperties");
    if (!host) return null;
    return {
      selectedId: host.dataset.selectedObjectId || null,
      text: (host.innerText || "").replace(/\s+/g, " ").trim(),
      values: Array.from(host.querySelectorAll("input")).map(i => i.value)
    };
  });
}

/** The Length field, addressed by the property key it edits. */
function lengthField(page) {
  return page
    .locator('#drawingProperties input[data-property="length"]')
    .first();
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
  const input = page.locator(".drawing-creation-dimension-input");

  await openDrawingTab(page);

  // ---- Creation popup -> Feature panel ----
  await activateStrict(page, "beam");
  await clickWorld(page, 0.2, 0.3);
  await clickWorld(page, 0.5, 0.3);
  await answer(page, 500);

  const panel = await panelInputs(page);
  const s1 = await readState(page);
  const beam = s1.objects.find(o => o.type === "beam");

  ok("the beam is still selected after the popup closes",
    s1.objects.length === 1 && panel?.selectedId !== null,
    `selectedId=${panel?.selectedId}`);
  ok("the panel opened on the new beam",
    /BEAM/i.test(panel?.text || ""), (panel?.text || "").slice(0, 60));
  ok("the panel shows a GEOMETRY section with Length",
    /GEOMETRY/i.test(panel?.text || "") && /Length/i.test(panel?.text || ""),
    (panel?.text || "").slice(0, 80));
  ok("the panel's Length field reads 500",
    (panel?.values || []).includes("500"),
    JSON.stringify((panel?.values || []).slice(0, 3)));
  ok("the panel Length agrees with the geometry (both 500 mm)",
    near(beam.spanMm, 500),
    `geometry=${beam?.spanMm} panel=500`);

  // ---- Editing it in the panel moves the SAME geometry ----
  await lengthField(page).fill("750");
  await lengthField(page).press("Enter");
  await page.waitForTimeout(400);

  const s2 = await readState(page);
  const beam2 = s2.objects.find(o => o.type === "beam");

  ok("editing the panel length to 750 mm resizes the beam",
    beam2 && near(beam2.spanMm, 750),
    `typed 750, geometry now ${beam2?.spanMm}`);

  const panel2 = await panelInputs(page);
  ok("the panel still reads 750 after its own edit",
    (panel2?.values || []).includes("750"),
    JSON.stringify((panel2?.values || []).slice(0, 3)));

  // ---- A unit chosen at creation shows as millimetres in the panel ----
  await activateStrict(page, "beam");
  await clickWorld(page, 0.2, 0.7);
  await clickWorld(page, 0.5, 0.7);
  await input.fill("0.5");
  await page.locator(".drawing-creation-dimension-unit").selectOption("m");
  await input.press("Enter");
  await page.waitForTimeout(400);

  const panel3 = await panelInputs(page);
  const s3 = await readState(page);
  const beam3 = s3.objects.filter(o => o.type === "beam").pop();

  ok("0.5 m at creation gives a 500 mm beam", beam3 && near(beam3.spanMm, 500),
    `geometry=${beam3?.spanMm}`);
  ok("the panel shows it as 500 mm, not 0.5",
    (panel3?.values || []).includes("500"),
    JSON.stringify((panel3?.values || []).slice(0, 3)));
  ok("the panel does not echo the entered unit",
    !(panel3?.values || []).includes("0.5"),
    JSON.stringify((panel3?.values || []).slice(0, 3)));

  // ---- Two-dimensional feature: both values reach the panel ----
  await activateStrict(page, "rectangle");
  await clickWorld(page, 0.6, 0.2);
  await clickWorld(page, 0.8, 0.4);
  await input.fill("500");
  await input.press("Enter");
  await page.waitForTimeout(250);
  await input.fill("300");
  await input.press("Enter");
  await page.waitForTimeout(450);

  const panel4 = await panelInputs(page);
  const s4 = await readState(page);
  const rect = s4.objects.find(o => o.type === "rectangle");

  ok("the rectangle is 500 x 300 mm",
    rect && near(rect.widthMm, 500) && near(rect.heightMm, 300),
    `${rect?.widthMm} x ${rect?.heightMm}`);
  ok("the panel shows both 500 and 300",
    (panel4?.values || []).includes("500") &&
    (panel4?.values || []).includes("300"),
    JSON.stringify((panel4?.values || []).slice(0, 6)));

  // ---- A feature with no size is not dragged into the editor ----
  await activateStrict(page, "point");
  await clickWorld(page, 0.9, 0.9);
  await page.waitForTimeout(350);

  const panel5 = await panelInputs(page);
  ok("a Point opens no length popup", !(await popup(page).isVisible()));
  ok("a Point's panel is not forced into a size editor",
    !/GEOMETRY/i.test(panel5?.text || "") || panel5 === null,
    (panel5?.text || "none").slice(0, 50));
}