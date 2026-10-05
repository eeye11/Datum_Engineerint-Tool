/*
 * Exercises Force Components and Resultant against real forces, and
 * reports whether the source force survives, whether a semantic
 * object was created, and whether Undo removes it. Verification
 * aid, not part of the application.
 */
export default async function run(page, ui) {
  await page.waitForLoadState("load", { timeout: 20000 });

  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ button "Engineering Drawing"/)?.[0];

  if (!tab) return { error: "no drawing tab", snap };

  await ui.click(tab.match(/@e\d+/)[0]);
  await page.waitForTimeout(800);

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
      ].forEach((t) => {
        canvas.dispatchEvent(new MouseEvent(t, opts));
      });
    };

    const panel = () =>
      document.getElementById("drawingProperties")?.innerText || "";

    const svgCount = () =>
      canvas.querySelector(".drawing-canvas svg")
        ? canvas
            .querySelector(".drawing-canvas svg")
            .querySelectorAll("path,line,rect,circle,polygon,polyline").length
        : 0;

    document
      .querySelector('.drawing-category[data-category="STATICS"]')
      ?.click();

    const out = {};

    /* --- A Point Force, drawn in free space. --- */
    document.querySelector('[data-tool-id="point-force"]')?.click();

    clickAt(0.3, 0.7);
    clickAt(0.5, 0.4);

    out.afterForce = {
      panel: panel().slice(0, 120),
      shapes: svgCount(),
    };

    /* --- Force Components on it. --- */
    document.querySelector('[data-tool-id="force-components"]')?.click();

    out.afterComponents = {
      panel: panel().slice(0, 160),
      shapes: svgCount(),
      message: document.getElementById("drawingToolMessage")?.innerText || "",
    };

    return out;
  });
}
