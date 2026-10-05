/*
 * Waits for the application to finish mounting, then traces the
 * Drawing Reference pipeline. Verification aid, not part of the
 * application.
 */
export default async function run(page, ui) {
  /* The app mounts after load; wait for its API to exist. */
  await page.waitForFunction(
    () =>
      typeof window.enggDrawingSheets !== "undefined" &&
      typeof window.enggDrawingReference !== "undefined",
    { timeout: 15000 },
  );

  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ button "Engineering Drawing"/)?.[0];

  if (tab) {
    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(800);
  }

  /* Draw a line on the active sheet. */
  await page.evaluate(() => {
    const canvas = document.querySelector(".drawing-canvas");
    const r = canvas.getBoundingClientRect();

    document.querySelector('[data-tool-id="line"]')?.click();

    const clickAt = (dx, dy) => {
      const opts = {
        bubbles: true,
        cancelable: true,
        clientX: r.left + r.width * dx,
        clientY: r.top + r.height * dy,
        button: 0,
        detail: 1,
      };

      [
        "pointermove",
        "mousemove",
        "pointerdown",
        "mousedown",
        "click",
        "pointerup",
        "mouseup",
      ].forEach((t) => {
        canvas.dispatchEvent(new MouseEvent(t, opts));
      });
    };

    clickAt(0.2, 0.2);
    clickAt(0.8, 0.8);
  });
  await page.waitForTimeout(700);

  return await page.evaluate(() => {
    const sheets = window.enggDrawingSheets;
    const ref = window.enggDrawingReference;

    const sheetId = sheets.activeSheetId();
    const sheet = sheets.sheetById(sheetId);

    const rendered = ref.renderDrawingReference(sheetId, {
      width: 900,
      height: 600,
    });

    return {
      sheetId,
      objectCount: sheet?.objects?.length,
      objectTypes: sheet?.objects?.map((o) => o.type) ?? null,
      renderedOk: rendered?.ok,
      renderedEmpty: rendered?.empty,
      renderedReason: rendered?.reason,
      hasSvg: Boolean(rendered?.svg),
      svgKids: rendered?.svg?.childElementCount ?? null,
      caption: rendered?.caption,
    };
  });
}
