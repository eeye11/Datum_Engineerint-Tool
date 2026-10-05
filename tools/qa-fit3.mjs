/*
 * Checks that a dimension extending past the geometry is included
 * in the Fit bounds, so it is not clipped. Verification aid.
 */
export default async function run(page, ui) {
  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ button "Engineering Drawing"/)?.[0];

  if (!tab) return { error: "no drawing tab", snap };

  await ui.click(tab.match(/@e\d+/)[0]);
  await page.waitForTimeout(700);

  return await page.evaluate(() => {
    const canvas = document.querySelector(".drawing-canvas");
    const r = canvas.getBoundingClientRect();

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
      ].forEach((type) => {
        canvas.dispatchEvent(new MouseEvent(type, opts));
      });
    };

    const pick = (sel) => document.querySelector(sel)?.click();

    const zoom = () =>
      document.getElementById("drawingZoomValue")?.value ?? null;

    /* Draw a short line in the middle. */
    pick('[data-tool-id="line"]');
    clickAt(0.35, 0.45);
    clickAt(0.65, 0.45);

    const lineOnly = zoom();

    pick('[data-global-tool="fit"]');
    const afterLine = zoom();

    /* Add a dimension on the line, offset well below. */
    pick('[data-tool-id="dimension"]');
    clickAt(0.5, 0.45);

    pick('[data-global-tool="fit"]');

    return {
      before: lineOnly,
      afterLine,
      afterDimension: zoom(),
      message: document.getElementById("drawingToolMessage")?.innerText ?? "",
      dimensionCreated:
        document
          .getElementById("drawingProperties")
          ?.innerText?.includes("Dimension") ?? false,
    };
  });
}
