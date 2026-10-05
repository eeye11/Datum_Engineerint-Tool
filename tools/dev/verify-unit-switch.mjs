/*
 * Does changing the unit in the creation popup keep the popup open?
 *
 * Reproduces the reported interaction: open a Beam's length popup,
 * choose a unit, then carry on typing and confirming.
 */
import {
  mainWorld,
  openDrawingTab,
  activateStrict,
  clickWorld,
  popup
} from "./qa-bridge-driver.mjs";

const results = [];
const ok = (n, p, d) => results.push({ name: n, pass: !!p, detail: d });
const near = (a, b) => Math.abs(a - b) < 1e-6;

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
  const unit = page.locator(".drawing-creation-dimension-unit");

  await openDrawingTab(page);

  // ---- The reported bug: choosing a unit must not dismiss it ----
  await activateStrict(page, "beam");
  await clickWorld(page, 0.2, 0.3);
  await clickWorld(page, 0.5, 0.3);

  ok("the popup is open before the unit is touched",
    await popup(page).isVisible());

  await unit.selectOption("m");
  await page.waitForTimeout(300);

  ok("the popup is STILL OPEN after choosing a unit",
    await popup(page).isVisible());

  ok("the chosen unit is still shown",
    (await unit.inputValue()) === "m",
    await unit.inputValue());

  // ---- And the workflow continues normally afterwards ----
  await input.fill("0.5");
  await input.press("Enter");
  await page.waitForTimeout(400);

  ok("Enter still commits after a unit change",
    !(await popup(page).isVisible()));

  /*
   * The FIRST dimension decides the unit the document is read in, so
   * entering "0.5 m" makes metres the document unit and the panel
   * correctly shows "0.5 m" - not "500 mm". The check is therefore on
   * the PHYSICAL LENGTH the panel states, not on it being in
   * millimetres.
   */
  const panel = await mainWorld(page, () => {
    const el = document.getElementById("drawingProperties");
    const field = el?.querySelector('input[data-property="length"]');
    const row = field?.closest(".drawing-property-grid");

    return {
      value: field ? field.value : null,
      rowText: (row?.innerText || "").replace(/\s+/g, " ")
    };
  });

  ok(
    "a beam entered as 0.5 m reads 0.5 m in the panel",
    panel.value === "0.5",
    JSON.stringify(panel)
  );

  // ---- Switching a suggestion must keep it in the same length ----
  await activateStrict(page, "beam");
  await clickWorld(page, 0.2, 0.7);
  await clickWorld(page, 0.5, 0.7);
  ok("a second popup opens", await popup(page).isVisible());

  const before = await input.inputValue();
  const unitBefore = await unit.inputValue();

  await unit.selectOption("cm");
  await page.waitForTimeout(300);
  ok("still open after a second unit change", await popup(page).isVisible());

  const after = await input.inputValue();
  const unitAfter = await unit.inputValue();

  ok("the suggestion was converted, not left alone",
    Number.isFinite(Number(before)) && Number(before) !== Number(after),
    `${before} ${unitBefore} -> ${after} ${unitAfter}`);

  /*
   * Compared through the SHARED unit table rather than a hard-coded
   * factor: the document unit is metres here, so the suggestion is
   * not in millimetres and multiplying by ten would be wrong.
   */
  const sameLength = await mainWorld(
    page,
    ({ a, b, ua, ub }) => {
      const U = window.enggQuantities.LENGTH_UNITS;
      return Math.abs(Number(a) * U[ua].mm - Number(b) * U[ub].mm) < 1;
    },
    { a: before, b: after, ua: unitBefore, ub: unitAfter }
  );

  ok("both readings are the same physical length", sameLength,
    `${before} ${unitBefore} vs ${after} ${unitAfter}`);

  // Escape must still cancel cleanly.
  await input.press("Escape");
  await page.waitForTimeout(300);
  ok("Escape still closes the popup", !(await popup(page).isVisible()));

  // ---- A genuine click-away must still cancel ----
  await activateStrict(page, "beam");
  await clickWorld(page, 0.2, 0.85);
  await clickWorld(page, 0.5, 0.85);
  ok("a third popup opens", await popup(page).isVisible());

  await page.locator(".drawing-canvas").first().click({ position: { x: 20, y: 20 } });
  await page.waitForTimeout(400);

  ok("clicking away still cancels the popup",
    !(await popup(page).isVisible()),
    "clicking the canvas must remain a cancel");
}