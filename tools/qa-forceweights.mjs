/*
 * Renders the same Point Force at several line weights, magnified, so
 * "it looks too thin" can be judged against real options rather than
 * argued about. Verification aid, not part of the application.
 */
export default async function run(page, ui) {
  await page.waitForLoadState("load", { timeout: 30000 });

  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ [^\n]*Engineering Drawing[^\n]*/)?.[0];

  if (tab) {
    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(900);
  }

  await page.evaluate(() => {
    document
      .querySelector('.drawing-category[data-category="STATICS"]')
      ?.click();
  });
  await page.waitForTimeout(400);

  /* Draw several forces, then restyle their widths directly. */
  await page.evaluate(() => {
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

    const weights = [0.5, 0.8, 1.1, 1.5];

    weights.forEach((w, i) => {
      document.querySelector('[data-tool-id="point-force"]')?.click();
      clickAt(0.1, 0.12 + i * 0.22);
      clickAt(0.55, 0.12 + i * 0.22);
    });
  });

  await page.waitForTimeout(900);

  return await page.evaluate(() => {
    /* Restyle each force to the weight it was drawn for. */
    const state = window.enggDrawing?.state;
    const forces = (state?.objects || []).filter(
      (o) => o.type === "force"
    );

    forces.forEach((f, i) => {
      f.style = f.style || {};
      f.style.lineWidth = [0.5, 0.8, 1.1, 1.5][i];
    });

    /* Re-render through the app's own path. */
    window.enggDrawingRenderer?.renderCurrent?.();

    /* Magnify so the strokes are legible. */
    const svg = document.querySelector(".drawing-canvas svg");
    const vb = (svg?.getAttribute("viewBox") || "0 0 100 100")
      .split(/\s+/)
      .map(Number);

    if (svg && vb.length === 4) {
      svg.setAttribute(
        "viewBox",
        `${vb[0]} ${vb[1]} ${vb[2] / 2.5} ${vb[3] / 2.5}`
      );
    }

    return { forces: forces.length };
  });
}
