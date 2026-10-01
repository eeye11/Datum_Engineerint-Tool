/*
 * Establishes the app's actual default line weight: what a Line gets,
 * what a Point Force gets, and what the thickness control offers.
 * This decides which of the two is wrong. Verification aid.
 */
export default async function run(page, ui) {
  await page.waitForLoadState("load", { timeout: 30000 });

  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ [^\n]*Engineering Drawing[^\n]*/)?.[0];

  if (tab) {
    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(900);
  }

  const before = await page.evaluate(() => {
    const el = document.getElementById("drawingThickness");
    return {
      controlValue: el?.value,
      controlMin: el?.min,
      controlMax: el?.max,
      options: Array.from(el?.options || []).map((o) => o.value),
    };
  });

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
        clickAt(0.5, yy);
      },
      { id: toolId, yy: y }
    );
    await page.waitForTimeout(450);
  };

  await draw("line", "GEOMETRY", 0.2);
  await draw("point-force", "STATICS", 0.45);
  await draw("rectangle", "GEOMETRY", 0.7);

  const strokes = await page.evaluate(() => {
    const svg = document.querySelector(".drawing-canvas svg");
    return Array.from(svg?.querySelectorAll("line,polyline,path") || []).map(
      (el) => Number(el.getAttribute("stroke-width"))
    );
  });

  return { control: before, strokes };
}
