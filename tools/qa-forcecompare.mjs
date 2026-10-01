/*
 * Draws a Line and a Point Force side by side at the SAME configured
 * weight and magnifies, so the two can be compared as drawn rather
 * than as numbers. Verification aid.
 */
export default async function run(page, ui) {
  await page.waitForLoadState("load", { timeout: 30000 });

  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ [^\n]*Engineering Drawing[^\n]*/)?.[0];

  if (tab) {
    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(900);
  }

  const draw = async (toolId, category, y) => {
    if (category) {
      await page.evaluate(
        (c) => {
          document
            .querySelector(`.drawing-category[data-category="${c}"]`)
            ?.click();
        },
        category
      );
      await page.waitForTimeout(350);
    }

    await page.evaluate(
      ({ id, yy }) => {
        const canvas = document.querySelector(".drawing-canvas");
        const r = canvas.getBoundingClientRect();

        document.querySelector(`[data-tool-id="${id}"]`)?.click();

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

        clickAt(0.1, yy);
        clickAt(0.62, yy);
      },
      { id: toolId, yy: y }
    );
    await page.waitForTimeout(500);
  };

  await draw("line", "GEOMETRY", 0.25);
  await draw("point-force", "STATICS", 0.55);
  await draw("line", "GEOMETRY", 0.85);

  /* Blow up around the middle where all three sit. */
  return await page.evaluate(() => {
    const svg = document.querySelector(".drawing-canvas svg");
    if (!svg) return { error: "no svg" };

    /* Zoom the CANVAS instead: the viewBox follows the camera. */
    document.getElementById("drawingZoomIn")?.click();
    document.getElementById("drawingZoomIn")?.click();
    document.getElementById("drawingZoomIn")?.click();
    document.getElementById("drawingZoomIn")?.click();

    return {
      strokes: Array.from(svg.querySelectorAll("line")).map((el) =>
        Number(el.getAttribute("stroke-width"))
      ),
    };
  });
}
