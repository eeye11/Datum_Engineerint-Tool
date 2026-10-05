/*
 * Checks that a force shaft and an ordinary Line render at the SAME
 * on-screen width at every configured weight, and that the arrowhead
 * grows with the shaft. Verification aid.
 */
export default async function run(page, ui) {
  await page.waitForLoadState("load", { timeout: 30000 });

  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ [^\n]*Engineering Drawing[^\n]*/)?.[0];

  if (tab) {
    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(900);
  }

  const setThickness = async (v) => {
    await page.evaluate((val) => {
      const el = document.getElementById("drawingThickness");
      if (!el) return;
      el.value = val;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, v);
    await page.waitForTimeout(300);
  };

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
      await page.waitForTimeout(320);
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

  const results = [];

  for (const w of ["0.5", "0.7", "1"]) {
    await setThickness(w);

    await draw("line", "GEOMETRY", 0.25);
    await draw("point-force", "STATICS", 0.55);

    const row = await page.evaluate(() => {
      const svg = document.querySelector(".drawing-canvas svg");

      const lines = Array.from(svg?.querySelectorAll("line") || []);
      const heads = Array.from(svg?.querySelectorAll("polygon") || []);

      return {
        strokes: lines.map((el) =>
          Number(el.getAttribute("stroke-width"))
        ),
        headSizes: heads.map((el) => {
          const bb = el.getBBox();
          return Math.round(Math.max(bb.width, bb.height));
        }),
      };
    });

    results.push({ weight: w, ...row });
  }

  return { results };
}
