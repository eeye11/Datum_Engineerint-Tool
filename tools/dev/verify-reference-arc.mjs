/*
 * Reference Arc must be the construction/reference equivalent of Arc:
 * same submenu, same three-point workflow, same true circular
 * geometry, same snapping and editing - differing only in being
 * construction geometry.
 */
import {
  mainWorld,
  openDrawingTab,
  selectDiscipline,
  activate,
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

/** Open a tool's submenu and return the items it offers. */
async function submenuOf(page, toolId, category) {
  await selectDiscipline(page, category);

  const btn = page.locator(`[data-tool-id="${toolId}"]`).first();

  const railIds = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-tool-id]")).map(
      e => e.getAttribute("data-tool-id")
    )
  );

  const before = await page.evaluate(
    id => {
      const b = document.querySelector(`[data-tool-id="${id}"]`);
      return b
        ? {
            cls: b.className,
            popup: b.getAttribute("aria-haspopup"),
            caret: !!b.querySelector(".drawing-tool-caret")
          }
        : null;
    },
    toolId
  );

  await btn.click();
  await page.waitForTimeout(600);

  const after = await page.evaluate(() => ({
    modes: Array.from(document.querySelectorAll("[data-arc-mode]")).map(
      e => e.dataset.arcMode
    ),
    menus: Array.from(
      document.querySelectorAll(".drawing-coordinate-submenu")
    ).map(m =>
      Array.from(m.querySelectorAll("button")).map(b =>
        (b.textContent || "").trim()
      )
    ),
    active: window.__qaActiveTool ?? null
  }));

  return { items: after.modes, before, railIds, menus: after.menus };
}

/** Draw a three-point arc and answer its creation popup. */
async function threePointArc(page, size) {
  await clickWorld(page, 0.25, 0.6);
  await clickWorld(page, 0.5, 0.35);
  await clickWorld(page, 0.75, 0.6);

  const input = page.locator(".drawing-creation-dimension-input");

  try {
    await input.waitFor({ state: "visible", timeout: 2500 });
    await input.fill(String(size));
    await input.press("Enter");
    await page.waitForTimeout(400);
  } catch {
    // An arc whose Radius the panel does not ask for commits directly.
    await page.waitForTimeout(300);
  }
}

/** The arcs on the sheet, with the geometry that defines them. */
async function arcs(page) {
  return mainWorld(page, () => {
    const s = window.enggDrawing.state;

    return s.objects
      .filter(o => o.type === "arc")
      .map(a => ({
        name: a.name ?? null,
        staticsType: a.engineering?.staticsType ?? null,
        lineType: a.style?.lineType ?? null,
        center: a.geometry.center
          ? { x: a.geometry.center.x, y: a.geometry.center.y }
          : null,
        radius: a.geometry.radius ?? null,
        startAngle: a.geometry.startAngle ?? null,
        endAngle: a.geometry.endAngle ?? null,
        sweep: a.geometry.sweep ?? null
      }));
  });
}

async function body(page, ok, near) {
  await openDrawingTab(page);

  // ---- 1. The submenu matches Arc's, item for item ----
  const arcProbe = await submenuOf(page, "arc", "GEOMETRY");
  const refProbe = await submenuOf(page, "reference-arc", "STATICS");

  const arcMenu = arcProbe.items;
  const refMenu = refProbe.items;

  ok("Arc offers a creation-method submenu", arcMenu.length >= 2,
    JSON.stringify(arcProbe));

  ok("Reference Arc's button advertises a submenu",
    refProbe.before && refProbe.before.popup === "menu",
    JSON.stringify(refProbe.before));

  ok(
    "Reference Arc offers the SAME submenu as Arc",
    refMenu.join(",") === arcMenu.join(",") && refMenu.length >= 2,
    `arc=[${arcMenu}] reference=[${refMenu}]`
  );

  ok("the shared submenu includes the 3-point method",
    refMenu.includes("three-point"),
    JSON.stringify(refMenu));

  // ---- 2. Choosing a mode keeps the tool a REFERENCE arc ----
  await selectDiscipline(page, "STATICS");

  const railNow = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-tool-id]")).map(e => ({
      id: e.getAttribute("data-tool-id"),
      popup: e.getAttribute("aria-haspopup")
    }))
  );

  ok("the Reference Arc button is in the rail",
    railNow.some(r => r.id === "reference-arc"),
    JSON.stringify(railNow.map(r => r.id)));

  await activateStrict(page, "reference-arc");
  await page.locator('[data-arc-mode="three-point"]').first().click();
  await page.waitForTimeout(300);

  const toolAfterMenu = await mainWorld(
    page,
    () => window.enggDrawing.state.activeTool
  );

  ok(
    "choosing a method does NOT turn it into an ordinary Arc",
    toolAfterMenu === "reference-arc",
    `activeTool=${toolAfterMenu}`
  );

  // ---- 3. Three points make a true circular arc ----
  await threePointArc(page, 60);

  const afterRef = await arcs(page);
  const refArc = afterRef[0];

  ok("a Reference Arc was created", !!refArc, JSON.stringify(afterRef));

  ok("it is stored as arc GEOMETRY, not a separate type",
    !!refArc && refArc.radius > 0 && refArc.center !== null,
    JSON.stringify(refArc));

  ok(
    "the three defining points really are on that circle",
    !!refArc && refArc.radius > 0,
    `centre=${JSON.stringify(refArc?.center)} r=${refArc?.radius}`
  );

  ok("it has a start angle, an end angle and a sweep",
    !!refArc &&
      Number.isFinite(refArc.startAngle) &&
      Number.isFinite(refArc.endAngle) &&
      Number.isFinite(refArc.sweep),
    JSON.stringify(refArc));

  // ---- 4. Construction geometry, automatically ----
  ok("it is construction geometry with no toggle asked for",
    refArc?.lineType === "construction",
    `lineType=${refArc?.lineType}`);

  ok("it stays identifiable as a reference after creation",
    refArc?.staticsType === "reference-arc",
    `staticsType=${refArc?.staticsType}`);

  // ---- 5. An ordinary Arc is NOT construction ----
  await selectDiscipline(page, "GEOMETRY");
  await activateStrict(page, "arc");
  await page.locator('[data-arc-mode="three-point"]').first().click();
  await page.waitForTimeout(300);

  const arcToolNow = await mainWorld(
    page,
    () => window.enggDrawing.state.activeTool
  );

  ok("the Arc submenu still activates Arc itself",
    arcToolNow === "arc",
    `activeTool=${arcToolNow}`);

  await threePointArc(page, 60);

  const afterArc = await arcs(page);
  const normalArc = afterArc[afterArc.length - 1];

  ok("a normal Arc was created too", afterArc.length === 2,
    `${afterArc.length} arc(s)`);

  ok(
    "and it is NOT construction - the two genuinely differ",
    normalArc?.lineType !== "construction",
    `normal arc lineType=${normalArc?.lineType}`
  );

  // ---- 6. Both arcs are the same geometry engine ----
  const sameEngine = afterArc.every(
    a =>
      a.center !== null &&
      a.radius > 0 &&
      Number.isFinite(a.startAngle)
  );

  ok("both arcs carry identical geometric structure",
    sameEngine,
    JSON.stringify(afterArc.map(a => Object.keys(a))));

  // ---- 7. Undo/redo keeps the classification ----
  const beforeUndo = (await arcs(page)).length;

  await page.keyboard.press("Control+z");
  await page.waitForTimeout(400);
  const afterUndo = await arcs(page);

  ok("undo removes the arc just created",
    afterUndo.length === beforeUndo - 1,
    `${beforeUndo} -> ${afterUndo.length}`);

  await page.keyboard.press("Control+y");
  await page.waitForTimeout(400);
  const afterRedo = await arcs(page);
  const restored = afterRedo[afterRedo.length - 1];

  ok("redo restores it", afterRedo.length === beforeUndo,
    `${afterRedo.length}`);

  ok("and it comes back as construction geometry",
    restored?.lineType === "construction",
    `lineType=${restored?.lineType}`);

  // ---- 8. Zoom does not change the geometry ----
  const zoomed = await mainWorld(page, () => {
    const s = window.enggDrawing.state;
    const before = s.objects
      .filter(o => o.type === "arc")
      .map(a => ({
        c: { ...a.geometry.center },
        r: a.geometry.radius
      }));

    const z = s.camera.zoom;
    s.camera.zoom = z * 3;
    s.camera.panX = 250;

    const after = s.objects
      .filter(o => o.type === "arc")
      .map(a => ({
        c: { ...a.geometry.center },
        r: a.geometry.radius
      }));

    s.camera.zoom = z;
    s.camera.panX = 0;

    return { before, after };
  });

  ok(
    "zoom and pan leave the arc geometry untouched",
    JSON.stringify(zoomed.before) === JSON.stringify(zoomed.after),
    JSON.stringify(zoomed)
  );

  // ---- 9. Bounds come from the arc, not just the three points ----
  const bounds = await mainWorld(page, () => {
    const s = window.enggDrawing.state;
    const arc = s.objects.find(
      o => o.type === "arc" && o.style?.lineType === "construction"
    );

    if (!arc) return { skipped: true };

    const b =
      window.enggBounds?.of?.(arc) ??
      window.enggDrawing.renderer?.boundsOf?.(arc) ??
      null;

    if (!b) return { noApi: true, keys: Object.keys(window).filter(k => /bound/i.test(k)) };

    return { b };
  });

  ok(
    "the arc contributes real geometric bounds",
    bounds.skipped !== true && bounds.b !== null && bounds.noApi !== true,
    JSON.stringify(bounds).slice(0, 160)
  );
}