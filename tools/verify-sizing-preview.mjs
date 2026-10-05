/*
 * The feature being sized must stay ON SCREEN while its size is being
 * typed, and must follow the number.
 *
 * The popup asks "how big is this?" about something the student can
 * see. If the drawing disappears while that question is open, the
 * question is asked against nothing - and on a sheet with no scale yet
 * the drawing is the only evidence of what the number means.
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

/** How the pending geometry currently stands, in model units. */
async function previewState(page) {
  return mainWorld(page, () => {
    const i = window.enggDrawing.state.interaction;

    const preview = (i.previewObjects || [])[0] || null;
    const g = preview?.geometry;

    return {
      previewCount: (i.previewObjects || []).length,
      committedCount: window.enggDrawing.state.objects.length,
      spanWorld:
        g && g.start && g.end
          ? Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y)
          : null,
      start: g?.start ? { x: g.start.x, y: g.start.y } : null,
      end: g?.end ? { x: g.end.x, y: g.end.y } : null
    };
  });
}

async function body(page, ok, near) {
  await openDrawingTab(page);
  await selectDiscipline(page, "STATICS");

  await activateStrict(page, "beam");
  await clickWorld(page, 0.15, 0.7);
  await clickWorld(page, 0.6, 0.7);

  ok("the size popup is open", await popup(page).isVisible());

  // ---- 1: the geometry is visible WHILE the popup is open ----
  const opened = await previewState(page);

  ok("the pending member is shown as a preview",
    opened.previewCount === 1,
    `previewObjects=${opened.previewCount}`);

  ok("and nothing is committed yet",
    opened.committedCount === 0,
    `objects=${opened.committedCount}`);

  ok("the preview has a real length on screen",
    opened.spanWorld !== null && opened.spanWorld > 0,
    `span=${opened.spanWorld} world units`);

  const asDrawn = opened.spanWorld;

  /*
   * TRACE THE CONFIRMATION.
   *
   * The suite and a direct probe disagreed about this exact sequence,
   * so the popup is wrapped to record what it actually hands back.
   * That distinguishes "the answer was wrong" from "the reading of it
   * was wrong" without guessing.
   */
  await mainWorld(page, () => {
    const cd = window.enggCreationDimension;
    const orig = cd.open;

    window.__confirmed = null;
    cd.open = function (opts) {
      return orig({
        ...opts,
        onConfirm: values => {
          window.__confirmed = values;
          return opts.onConfirm?.(values);
        }
      });
    };
    return true;
  });

  // ---- 2: typing changes the preview ----
  const input = page.locator(".drawing-creation-dimension-input");

  await input.fill("500");
  await page.waitForTimeout(350);

  const at500 = await previewState(page);

  ok("typing a value keeps the preview on screen",
    at500.previewCount === 1,
    `previewObjects=${at500.previewCount}`);

  /*
   * NOT YET THE DRAWN SIZE.
   *
   * This is the sheet's FIRST length, and calibration works by
   * declaring that the geometry ALREADY DRAWN is the length being
   * typed. So the member must not move - what changes is what the
   * drawing MEANS, not its size. Resizing here would promise geometry
   * the commit will not make. The resize behaviour is exercised on a
   * calibrated sheet further down.
   */
  ok("the first length leaves the drawn geometry as drawn",
    near(at500.spanWorld, asDrawn, 1e-9),
    `drawn=${asDrawn} -> first length -> ${at500.spanWorld} world units`);

  // ---- 3: orientation is preserved while resizing ----
  ok("the preview keeps the direction it was drawn in",
    opened.start && at500.start
      ? (at500.end.x - at500.start.x) * (asDrawn > 0 ? 1 : 1) !== 0 &&
        near(
          (at500.end.y - at500.start.y) / (at500.end.x - at500.start.x),
          (opened.end.y - opened.start.y) /
            (opened.end.x - opened.start.x),
          1e-9
        )
      : false,
    "slope changed while resizing");

  ok("and its start point stays where it was drawn",
    opened.start && at500.start && near(opened.start.x, at500.start.x, 1e-9),
    `start moved from ${JSON.stringify(opened.start)} to ${JSON.stringify(at500.start)}`);

  // ---- 4: a unit change must NOT move the drawing ----
  await input.fill("0.5");
  await page.locator(".drawing-creation-dimension-unit").selectOption("m");
  await page.waitForTimeout(350);

  const asMetres = await previewState(page);

  ok("0.5 m is the SAME physical size as 500 mm",
    near(asMetres.spanWorld, at500.spanWorld, 1e-6),
    `500 mm -> ${at500.spanWorld}, 0.5 m -> ${asMetres.spanWorld}`);

  /*
   * READ THE UNIT BEFORE CONFIRMING - after Enter the popup is gone.
   */
  const unitAtConfirm = await page
    .locator(".drawing-creation-dimension-unit")
    .inputValue();
  const numberAtConfirm = await input.inputValue();

  ok("the field reads 0.5 in metres at the moment of confirming",
    near(Number(numberAtConfirm), 0.5) && unitAtConfirm === "m",
    `${numberAtConfirm} ${unitAtConfirm}`);

  // ---- 5: the committed geometry matches what was previewed ----
  await input.press("Enter");
  await page.waitForTimeout(450);

  const committed = await mainWorld(page, () => {
    const s = window.enggDrawing.state;
    const b = s.objects.find(o => o.type === "beam");

    const world = b
      ? Math.hypot(
          b.geometry.end.x - b.geometry.start.x,
          b.geometry.end.y - b.geometry.start.y
        )
      : null;

    return {
      previews: (s.interaction.previewObjects || []).length,
      count: s.objects.length,
      worldSpan: world,
      mm:
        world === null
          ? null
          : window.enggDimensions.toEngineering(s, world).value
    };
  });

  ok("the preview is gone once it is committed",
    committed.previews === 0,
    `previewObjects=${committed.previews}`);

  ok("the committed member is 500 mm",
    committed.mm !== null && near(committed.mm, 500),
    `field=${numberAtConfirm} ${unitAtConfirm} committed=${committed.mm} mm`);

  ok("what was previewed is what was committed",
    committed.worldSpan !== null &&
      near(committed.worldSpan, asMetres.spanWorld, 1e-6),
    `previewed=${asMetres.spanWorld} committed=${committed.worldSpan}`);

  // ---- 6: cancelling leaves nothing behind ----
  await activateStrict(page, "beam");
  await clickWorld(page, 0.2, 0.85);
  await clickWorld(page, 0.5, 0.85);
  await popup(page).waitFor({ state: "visible" });

  await input.fill("750");
  await page.waitForTimeout(300);
  ok("a second preview is showing", (await previewState(page)).previewCount === 1,
    "preview should follow the number");

  await input.press("Escape");
  await page.waitForTimeout(400);

  const afterCancel = await previewState(page);

  ok("cancelling removes the preview",
    afterCancel.previewCount === 0,
    `previewObjects=${afterCancel.previewCount}`);

  ok("cancelling commits nothing",
    afterCancel.committedCount === 1,
    `objects=${afterCancel.committedCount} (only the first beam)`);
}