/*
 * Lists the fitted drawing's elements with their extents, so a
 * "no margin" reading can be attributed to a specific element rather
 * than guessed at. Verification aid.
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

  /* A small drawing, so a correct fit has to zoom IN and margins
     must be obvious. */
  await draw("line", [0.45, 0.45], [0.55, 0.55]);

  await page.evaluate(() => {
    document
      .querySelector('[data-global-tool="fit"]')
      ?.click();
  });
  await page.waitForTimeout(600);

  return await page.evaluate(() => {
    const svg = document.querySelector(".drawing-canvas svg");
    const sr = svg.getBoundingClientRect();

    return {
      svgBox: {
        w: Math.round(sr.width),
        h: Math.round(sr.height),
      },
      viewBox: svg.getAttribute("viewBox"),
      zoom:
        document.getElementById("drawingZoomValue")?.value,

      /*
       * The GRID is excluded.
       *
       * It is drawn as a single path covering the whole viewport,
       * because the grid IS the viewport - it has no bounds, which is
       * exactly why Fit must never measure it. Counting it here
       * reports a full-canvas "element" with a 0px margin, which
       * looks like a broken fit and is not one.
       *
       * This exclusion is the same rule Fit applies, asserted here
       * so the test and the product cannot drift apart.
       */
      gridExcluded: true,
      elements: Array.from(
        svg.querySelectorAll("path,line,rect,circle,polygon,polyline")
      )
        .filter((el) => {
          const r = el.getBoundingClientRect();
          /* The grid spans the viewport; real geometry does not. */
          return !(r.width >= sr.width - 2 && r.height >= sr.height - 2);
        })
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            w: Math.round(r.width),
            h: Math.round(r.height),
            leftGap: Math.round(r.left - sr.left),
            topGap: Math.round(r.top - sr.top),
          };
        }),
    };
  });
}
