/*
 * Draws a Point Force and an ordinary Line at the SAME thickness,
 * chosen through the app's own control, and magnifies both so the
 * comparison is fair and visible. Verification aid.
 */
export default async function run(page, ui) {
  await page.waitForLoadState("load", { timeout: 30000 });

  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ [^\n]*Engineering Drawing[^\n]*/)?.[0];

  if (tab) {
    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(900);
  }

  const setThickness = async (value) => {
    await page.evaluate((v) => {
      const el = document.getElementById("drawingThickness");
      if (!el) return;
      el.value = v;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    await page.waitForTimeout(250);
  };

  const draw = async (toolId, category, y) => {
    if (category) {
      await page.evaluate((c) => {
        document
          .querySelector(`.drawing-category[data-category="${c}"]`)
          ?.click();
      }, category);
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
      { id: toolId, yy: y },
    );
    await page.waitForTimeout(500);
  };

  /* At the default 0.5. */
  await setThickness("0.5");
  await draw("point-force", "STATICS", 0.2);
  await draw("line", "GEOMETRY", 0.45);

  /* And at the heaviest offered, for comparison. */
  await setThickness("1");
  await draw("point-force", "STATICS", 0.7);
  await draw("line", "GEOMETRY", 0.9);

  /* Magnify. */
  return await page.evaluate(() => {
    const svg = document.querySelector(".drawing-canvas svg");
    const vb = (svg?.getAttribute("viewBox") || "0 0 100 100")
      .split(/\s+/)
      .map(Number);

    if (svg && vb.length === 4) {
      svg.setAttribute(
        "viewBox",
        `${vb[0]} ${vb[1]} ${vb[2] / 2.2} ${vb[3] / 2.2}`,
      );
    }

    return {
      strokes: Array.from(svg?.querySelectorAll("line") || []).map((el) =>
        Number(el.getAttribute("stroke-width")),
      ),
    };
  });
}
