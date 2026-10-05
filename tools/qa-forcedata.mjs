/*
 * Reads the stored lineWidth of a Point Force and of an ordinary
 * Line, both at their defaults, so the comparison is on the DATA
 * rather than on how thick two strokes look side by side. Verification
 * aid, not part of the application.
 */
export default async function run(page, ui) {
  await page.waitForLoadState("load", { timeout: 30000 });

  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ [^\n]*Engineering Drawing[^\n]/)?.[0];

  if (tab) {
    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(900);
  }

  /* Draw one of each, leaving the tool category switch in place. */
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

    document.querySelector('[data-tool-id="line"]')?.click();
    clickAt(0.1, 0.2);
    clickAt(0.4, 0.2);

    document
      .querySelector('.drawing-category[data-category="STATICS"]')
      ?.click();
    document.querySelector('[data-tool-id="point-force"]')?.click();
    clickAt(0.1, 0.5);
    clickAt(0.4, 0.5);
  });
  await page.waitForTimeout(900);

  return await page.evaluate(() => {
    const state = window.enggDrawing?.state;
    const objects = state?.objects || [];

    const pick = (type) => objects.find((o) => o.type === type);

    const line = pick("line");
    const force = pick("force");

    /*
     * What the renderer actually receives, which is the style
     * block on the object - not the toolbar's current setting.
     */
    return {
      styleDefaults: state?.styleDefaults?.lineWidth ?? null,
      line: line
        ? {
            name: line.name,
            lineWidth: line.style?.lineWidth,
            thickness: line.style?.lineWidth ?? line.style?.thickness,
          }
        : null,
      force: force
        ? {
            name: force.name,
            lineWidth: force.style?.lineWidth,
            thickness: force.style?.lineWidth ?? force.style?.thickness,
            magnitude: force.geometry?.magnitude,
            angle: force.geometry?.angle,
          }
        : null,
      types: objects.map((o) => o.type),
    };
  });
}
