/*
 * Reports the horizontal gaps either side of the canvas, so a gap
 * between the drawing and the Features panel can be located rather
 * than guessed at. Verification aid, not part of the application.
 */
export default async function run(page, ui) {
  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ button "Engineering Drawing"/)?.[0];

  if (!tab) {
    return { error: "no drawing tab", snap };
  }

  await ui.click(tab.match(/@e\d+/)[0]);
  await page.waitForTimeout(700);

  return await page.evaluate(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        sel,
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
      };
    };

    const canvas = document.querySelector(".drawing-canvas");

    const walk = (el, depth) => {
      if (!el || depth > 3) return null;
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName,
        cls: el.className ? String(el.className).slice(0, 60) : "",
        rect: rect("." + (el.className || "").split(" ").filter(Boolean)[0]),
        padding: cs.padding,
        margin: cs.margin,
        gap: cs.gap,
        display: cs.display,
        grid: cs.gridTemplateColumns,
        children: [...el.children]
          .slice(0, 8)
          .map((c) => walk(c, depth + 1))
          .filter(Boolean),
      };
    };

    return {
      canvasRect: canvas
        ? {
            left: Math.round(canvas.getBoundingClientRect().left),
            right: Math.round(canvas.getBoundingClientRect().right),
            width: Math.round(canvas.getBoundingClientRect().width),
          }
        : null,
      key: [
        rect(".drawing-workspace"),
        rect(".drawing-panel-rail-left"),
        rect(".drawing-canvas-area"),
        rect(".drawing-canvas"),
        rect(".drawing-panel-rail-right"),
        rect(".drawing-inspector"),
      ],
    };
  });
}
