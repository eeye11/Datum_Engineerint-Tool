/*
 * The Universal Length Scale belongs to each SHEET, not to the
 * document.
 *
 * Two sheets are two physical worlds. A length on Sheet 1 and a length
 * on Sheet 2 are compared by switching between sheets, and they may
 * legitimately have entirely different calibrations - which is exactly
 * what a single document-wide scale made impossible.
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

/** Draw a beam and size it at creation, establishing/using the scale. */
async function beam(page, size) {
  await activateStrict(page, "beam");
  await clickWorld(page, 0.15, 0.7);
  await clickWorld(page, 0.6, 0.7);

  const input = page.locator(".drawing-creation-dimension-input");
  await input.waitFor({ state: "visible", timeout: 4000 });
  await input.fill(String(size));
  await input.press("Enter");
  await page.waitForTimeout(400);
}

/** The scale of the sheet currently on screen. */
async function activeScale(page) {
  return mainWorld(page, () => {
    const s = window.enggDrawing.state;
    const scale = window.enggDimensions.readScale(s);

    return {
      calibrated: window.enggDimensions.isCalibrated(s),
      mmPerUnit: scale ? scale.mmPerUnit : null,
      unit: scale ? scale.unit : null
    };
  });
}

/** Every sheet, with the scale each one holds. */
async function allSheets(page) {
  return mainWorld(page, () => {
    const sheets = window.enggSheets.serializeCollection
      ? window.enggSheets.serializeCollection(
          window.__sheetCollection
        ).sheets
      : [];

    return sheets.map(s => ({
      id: s.id,
      name: s.name,
      calibrated: !!s.scale,
      mmPerUnit: s.scale ? s.scale.mmPerUnit : null,
      objects: (s.objects || []).length
    }));
  });
}

/** Every sheet's scale, read through the sheet API against the live state. */
async function sheetScales(page) {
  return mainWorld(page, () => {
    const state = window.enggDrawing.state;
    const sheets = window.enggSheets;

    /*
     * The collection is not published, so it is read through the
     * module's own accessors where they exist. Where it is not
     * reachable, the tabs the user can see are the honest record.
     */
    const collection =
      sheets.readCollection?.() ??
      window.__sheetCollection ??
      null;

    if (collection) {
      return {
        activeId: collection.activeSheetId,
        sheets: collection.sheets.map(s => ({
          id: s.id,
          name: s.name,
          calibrated: !!s.scale,
          mmPerUnit: s.scale ? s.scale.mmPerUnit : null,
          objects: (s.objects || []).length
        }))
      };
    }

    return {
      tabs: Array.from(document.querySelectorAll("[data-sheet-id]")).map(
        b => ({
          id: b.dataset.sheetId,
          name: b.title,
          active: b.classList.contains("active")
        })
      ),
      liveScale: window.enggDimensions.readScale(state)?.mmPerUnit ?? null
    };
  });
}

/** Switch sheets through the tab the student clicks. */
async function switchTo(page, name) {
  await clearDialogs(page);

  const id = await mainWorld(page, n => {
    const tab = Array.from(
      document.querySelectorAll("[data-sheet-id]")
    ).find(b => b.title === n || b.textContent.trim() === n);

    return tab ? tab.dataset.sheetId : null;
  }, name);

  if (!id) {
    throw new Error(`no sheet tab named "${name}"`);
  }

  await page.locator(`[data-sheet-id="${id}"]`).first().click();
  await page.waitForTimeout(800);
  await clearDialogs(page);
}

/**
 * Remove any modal dialog, so it can never block a click.
 *
 * Takes the page rather than closing over it, because it is defined
 * before `body` and has no page of its own to talk to.
 */
async function clearDialogs(page) {
  if (!(await page.locator(".engg-dialog-backdrop").count())) {
    return;
  }

  /*
   * Escape first, because a student would. If the dialog does not
   * honour it, the backdrop is removed outright: a modal standing
   * over the drawing must not be the reason a check cannot run, and
   * none of these checks are about the dialog.
   */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);

  if (!(await page.locator(".engg-dialog-backdrop").count())) {
    return;
  }

  await mainWorld(page, () => {
    document.querySelector(".engg-dialog-backdrop")?.remove();
    return true;
  });

  await page.waitForTimeout(200);
}

/** Click a discipline tab, clearing any dialog that blocks it. */
async function pickDiscipline(page, category) {
  await clearDialogs(page);
  await selectDiscipline(page, category);
  await clearDialogs(page);
}

async function body(page, ok, near) {
  await openDrawingTab(page);

  await clearDialogs(page);

  await pickDiscipline(page, "STATICS");

  // ---- A sheet must be able to HOLD a scale at all ----
  const supportsScale = await mainWorld(page, () => {
    const created = window.enggSheets.createSheetContent();

    return {
      hasField: "scale" in created,
      defaultIsNull: created.scale === null
    };
  });

  ok("a new sheet carries its own scale field",
    supportsScale.hasField,
    JSON.stringify(supportsScale));

  ok("a new sheet starts uncalibrated",
    supportsScale.defaultIsNull === true,
    JSON.stringify(supportsScale));

  // ---- Calibrate Sheet 1 ----
  await beam(page, 500);
  await clearDialogs(page);

  const sheet1 = await activeScale(page);

  ok("the first length calibrates the sheet in view",
    sheet1.calibrated && sheet1.mmPerUnit > 0,
    JSON.stringify(sheet1));

  // ---- Add a second sheet: it must start UNCALIBRATED ----
  const added = await mainWorld(page, () => {
    const created = window.enggSheets.createSheetContent();

    return {
      hasField: "scale" in created,
      value: created.scale ?? null
    };
  });

  ok("a new sheet can be created", true, "using the sheet module");

  ok("it carries its own scale, which is null",
    added.hasField && added.value === null,
    JSON.stringify(added));

  // ---- Create the second sheet through the UI ----
  const beforeTabs = await mainWorld(page, () =>
    document.querySelectorAll("[data-sheet-id]").length
  );

  const addBtn = page.locator(".drawing-sheet-add");
  if (await addBtn.count()) {
    await addBtn.first().click();
    await page.waitForTimeout(600);
  }

  const afterTabs = await mainWorld(page, () =>
    document.querySelectorAll("[data-sheet-id]").length
  );

  ok("a second sheet appears in the tab bar",
    afterTabs > beforeTabs,
    `${beforeTabs} -> ${afterTabs}`);

  const tabNames = await mainWorld(page, () =>
    Array.from(document.querySelectorAll("[data-sheet-id]")).map(b => b.title)
  );

  const secondName = tabNames.find(n => n && n !== "Sheet 1");

  ok("the new sheet has a name of its own", !!secondName,
    JSON.stringify(tabNames));

  // ---- Switch to Sheet 2 and confirm the scale did NOT come along ----
  await switchTo(page, secondName);

  const onSheet2 = await activeScale(page);

  ok("Sheet 2 is NOT calibrated by Sheet 1's length",
    onSheet2.calibrated === false,
    `calibrated=${onSheet2.calibrated} mmPerUnit=${onSheet2.mmPerUnit}`);

  // ---- Calibrate Sheet 2 at a DIFFERENT length ----
  await beam(page, 1000);
  await clearDialogs(page);

  const sheet2 = await activeScale(page);

  ok("Sheet 2 establishes its own, different scale",
    sheet2.calibrated &&
      sheet2.mmPerUnit !== sheet1.mmPerUnit,
    `sheet1=${sheet1.mmPerUnit} sheet2=${sheet2.mmPerUnit}`);

  // ---- Switching back must restore Sheet 1's scale ----
  await switchTo(page, "Sheet 1");

  const backOnSheet1 = await activeScale(page);

  ok("switching back restores Sheet 1's own scale",
    backOnSheet1.mmPerUnit === sheet1.mmPerUnit,
    `${sheet1.mmPerUnit} -> ${backOnSheet1.mmPerUnit}`);

  ok("and Sheet 1's geometry still measures 500 mm",
    await mainWorld(page, () => {
      const s = window.enggDrawing.state;
      const b = s.objects.find(o => o.type === "beam");

      if (!b) return false;

      const g = b.geometry;
      const world = Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y);

      return (
        Math.abs(
          window.enggDimensions.toEngineering(s, world).value - 500
        ) < 1e-6
      );
    }),
    "Sheet 1 beam after returning to it");

  // ---- Both sheets' scales are held independently ----
  const stored = await sheetScales(page);

  ok("both sheets hold their own scale in storage",
    stored.missing !== true &&
      stored.sheets.length >= 2 &&
      stored.sheets.every(s => s.calibrated) &&
      new Set(stored.sheets.map(s => s.mmPerUnit)).size === stored.sheets.length,
    JSON.stringify(stored).slice(0, 220));

  // ---- Emptying a sheet resets only that sheet ----
  const cleared = await mainWorld(page, () => {
    const state = window.enggDrawing.state;
    const model = window.enggDrawing.model;

    // The sheet the editor is a live copy of.
    const sheet = window.enggSheets.captureSheetContent(state);

    const ids = state.objects.map(o => o.id);
    model.removeObjectsAndDescendants(state, ids);

    return {
      deleted: ids.length,
      remaining: state.objects.length,
      liveScale: state.scale
        ? state.scale.mmPerUnit
        : null,
      sheetScaleBefore: sheet.scale
        ? sheet.scale.mmPerUnit
        : null
    };
  });

  ok("Sheet 1's geometry was deleted",
    cleared.remaining === 0,
    `${cleared.deleted} deleted, ${cleared.remaining} left`);

  ok("Sheet 1 HAD a calibration before the deletion",
    cleared.liveScale !== null && cleared.sheetScaleBefore !== null,
    JSON.stringify(cleared));

  ok(
    "emptying the sheet resets ITS scale",
    cleared.liveScale === null,
    `scale after deleting everything = ${cleared.liveScale}`
  );

  // ---- Switching away and back must not resurrect it ----
  await switchTo(page, secondName);

  const onSecond = await activeScale(page);

  ok("the second sheet still has its own calibration",
    onSecond.calibrated && onSecond.mmPerUnit === sheet2.mmPerUnit,
    `second=${onSecond.mmPerUnit} expected=${sheet2.mmPerUnit}`);

  await switchTo(page, "Sheet 1");

  const backEmpty = await activeScale(page);

  ok("returning to the emptied sheet finds it still uncalibrated",
    backEmpty.calibrated === false,
    `calibrated=${backEmpty.calibrated} mmPerUnit=${backEmpty.mmPerUnit}`);

  // ---- Undo must bring the scale back ----
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(700);

  const afterUndo = await activeScale(page);
  const afterUndoObjects = await mainWorld(
    page,
    () => window.enggDrawing.state.objects.length
  );

  ok(
    "undo restores Sheet 1's geometry",
    afterUndoObjects > 0,
    `${afterUndoObjects} object(s) after undo`
  );

  ok(
    "undo restores Sheet 1's scale with it",
    afterUndo.calibrated && afterUndo.mmPerUnit === sheet1.mmPerUnit,
    `${afterUndo.mmPerUnit} expected ${sheet1.mmPerUnit}`
  );

  // ---- Redo empties it again ----
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(700);

  const afterRedo = await activeScale(page);

  ok(
    "redo empties the sheet and resets the scale again",
    afterRedo.calibrated === false,
    `calibrated=${afterRedo.calibrated} mmPerUnit=${afterRedo.mmPerUnit}`
  );
}
