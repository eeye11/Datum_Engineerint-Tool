/*
 * Reports the fitted content's exact margins, so "is there room" can
 * be answered with numbers rather than a guess. Verification aid.
 */
export default async function run(page, ui) {
  await page.waitForLoadState("load", { timeout: 30000 });

  await page
    .waitForFunction(
      () => document.querySelectorAll("[data-tool-id]").length > 0,
      { timeout: 30000 }
    )
    .catch(() => null);

  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ [^\n]*Engineering Drawing[^\n]*/)?.[0];
  if (tab) {
    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(800);
  }

  const draw = async (id, a, b) => {
    await page.evaluate(
      ({ id, a, b }) => {
        const canvas = document.querySelector(".drawing-canvas");
        const r = canvas.getBoundingClientRect();
        document.querySelector(`[data-tool-id="${id}"]`)?.click();
        const at = (dx, dy) => {
          const o = {
            bubbles: true, cancelable: true,
            clientX: r.left + r.width * dx,
            clientY: r.top + r.height * dy,
            button: 0, detail: 1,
          };
          ["pointermove", "mousemove", "pointerdown", "mousedown",
           "click", "pointerup", "mouseup"].forEach((t) =>
            canvas.dispatchEvent(new MouseEvent(t, o)));
        };
        at(a[0], a[1]);
        at(b[0], b[1]);
      },
      { id, a, b }
    );
    await page.waitForTimeout(500);
  };

  await draw("line", [0.08, 0.12], [0.9, 0.2]);
  await draw("rectangle", [0.12, 0.8], [0.3, 0.94]);

  await page.evaluate(() => {
    document
      .querySelector('[data-global-tool="fit"]')
      ?.click();
  });
  await page.waitForTimeout(600);

  return await page.evaluate(() => {
    const canvas = document.querySelector(".drawing-canvas");
    const cr = canvas.getBoundingClientRect();
    const svg = canvas.querySelector("svg");
    const sr = svg.getBoundingClientRect();

    /* Measure every drawn element in CANVAS pixels, not SVG units. */
    const gaps = { left: [], right: [], top: [], bottom: [] };

    svg.querySelectorAll("path,line,rect,circle,polygon,polyline")
      .forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return;
        gaps.left.push(r.left - sr.left);
        gaps.right.push(sr.right - r.right);
        gaps.top.push(r.top - sr.top);
        gaps.bottom.push(sr.bottom - r.bottom);
      });

    const worst = (a) =>
      a.length ? Math.round(Math.min(...a)) : null;

    return {
      canvas: {
        w: Math.round(cr.width),
        h: Math.round(cr.height),
      },
      /* Smallest gap on each side, across all elements. */
      minGaps: {
        left: worst(gaps.left),
        right: worst(gaps.right),
        top: worst(gaps.top),
        bottom: worst(gaps.bottom),
      },
      zoom:
        document.getElementById("drawingZoomValue")?.value,
    };
  });
}
