/*
 * Measures the rendered stroke width of a Point Force against an
 * ordinary Line at the SAME configured thickness, with no zoom or
 * magnification, so the numbers are the real ones. Verification aid.
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

        clickAt(0.08, yy);
        clickAt(0.7, yy);
      },
      { id: toolId, yy: y }
    );
    await page.waitForTimeout(500);
  };

  /* Both at the default 0.5, then both at 1.0. */
  await draw("line", "GEOMETRY", 0.3);
  await draw("point-force", "STATICS", 0.6);

  return await page.evaluate(() => {
    const svg = document.querySelector(".drawing-canvas svg");

    const lines = Array.from(svg?.querySelectorAll("line") || []);
    const polys = Array.from(svg?.querySelectorAll("polygon") || []);

    return {
      /* Every stroke width actually emitted, in document order. */
      lineStrokes: lines.map((el) =>
        Number(el.getAttribute("stroke-width"))
      ),
      arrowheads: polys.length,
      /* The live toolbar setting, for reference. */
      thickness:
        document.getElementById("drawingThickness")
          ?.value,
    };
  });
}
