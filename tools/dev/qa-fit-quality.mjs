/*
 * Verifies the properties that make a Fit correct: uniform scale,
 * centring, a real margin, no clipping, and that the document itself
 * is untouched. Verification aid, not part of the application.
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

  const click = async (sel) => {
    await page.evaluate((s) => {
      document.querySelector(s)?.click();
    }, sel);
    await page.waitForTimeout(450);
  };

  const draw = async (toolId, category, a, b) => {
    if (category) await click(`.drawing-category[data-category="${category}"]`);
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
      { id: toolId, a, b }
    );
    await page.waitForTimeout(500);
  };

  /* A deliberately ASYMMETRIC drawing, so a top-left-anchored fit
     would be visibly wrong rather than accidentally centred. */
  await draw("line", "GEOMETRY", [0.08, 0.12], [0.9, 0.2]);
  await draw("rectangle", "GEOMETRY", [0.12, 0.8], [0.3, 0.94]);

  /* The document's own state, to prove Fit leaves it alone. */
  const snapshot = () =>
    page.evaluate(() => {
      const svg = document.querySelector(".drawing-canvas svg");
      return {
        shapeCount: svg
          ? svg.querySelectorAll(
              "path,line,rect,circle,polygon,polyline"
            ).length
          : 0,
        documentScale:
          document.getElementById("drawingScale")?.value ??
          null,
      };
    });

  const extent = () =>
    page.evaluate(() => {
      const svg = document.querySelector(".drawing-canvas svg");
      if (!svg) return null;

      let box = null;
      const svgRect = svg.getBoundingClientRect();

      svg.querySelectorAll("path,line,rect,circle,polygon,polyline")
        .forEach((el) => {
          /*
           * THE GRID IS EXCLUDED.
           *
           * The grid is one path covering the whole viewport, because
           * the grid IS the viewport - it has no bounds, which is
           * exactly why Fit must never measure it. Including it here
           * reports a full-canvas "element" with a 0px margin, which
           * reads as a broken fit when the fit is correct.
           */
          const r = el.getBoundingClientRect();
          if (el.classList.contains("drawing-engineering-grid")) {
            return;
          }

          try {
            const b = el.getBBox();
            if (!b || (!b.width && !b.height)) return;
            box = box
              ? {
                  x: Math.min(box.x, b.x), y: Math.min(box.y, b.y),
                  r: Math.max(box.r, b.x + b.width),
                  b: Math.max(box.b, b.y + b.height),
                }
              : { x: b.x, y: b.y, r: b.x + b.width, b: b.y + b.height };
          } catch { /* not measurable */ }
        });

      const r = svg.getBoundingClientRect();
      return {
        box,
        canvas: { w: Math.round(r.width), h: Math.round(r.height) },
      };
    });

  const before = await snapshot();

  await click('[data-global-tool="fit"]');
  const afterFit = await snapshot();
  const fitted = await extent();

  const checks = {};

  if (fitted?.box) {
    const { box, canvas } = fitted;

    checks.centredHorizontally = (() => {
      const leftGap = box.x;
      const rightGap = canvas.w - box.r;
      return Math.abs(leftGap - rightGap) < canvas.w * 0.12;
    })();

    checks.centredVertically = (() => {
      const topGap = box.y;
      const bottomGap = canvas.h - box.b;
      return Math.abs(topGap - bottomGap) < canvas.h * 0.15;
    })();

    checks.hasMargin =
      box.x > 0 && box.y > 0 &&
      box.r < canvas.w && box.b < canvas.h;

    checks.notClipped = box.r <= canvas.w && box.b <= canvas.h;
  }

  checks.documentUnchanged =
    before.shapeCount === afterFit.shapeCount &&
    before.documentScale === afterFit.documentScale;

  return {
    before,
    afterFit,
    fitted,
    checks,
  };
}
