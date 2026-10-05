/*
 * Exercises Fit Whole Page and Fit Selected against real content, and
 * checks the properties that matter: uniform scale, centring, margin,
 * no clipping, and that geometry and document scale are untouched.
 * Verification aid, not part of the application.
 */
export default async function run(page, ui) {
  await page.waitForLoadState("load", { timeout: 30000 });

  /*
   * Wait for the drawing module.
   *
   * The page finishes loading before every engineering-drawing script
   * has run, so a tool click issued too early is a click on nothing -
   * silently, with no error, which looks exactly like a Fit that does
   * not work.
   */
  const mounted = await page
    .waitForFunction(
      () => document.querySelectorAll("[data-tool-id]").length > 0,
      { timeout: 30000 }
    )
    .then(() => true)
    .catch(() => false);

  if (!mounted) return { error: "drawing tools never rendered" };

  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ [^\n]*Engineering Drawing[^\n]*/)?.[0];

  if (!tab) return { error: "no drawing tab", snap };

  await ui.click(tab.match(/@e\d+/)[0]);
  await page.waitForTimeout(900);

  const click = async (sel) => {
    await page.evaluate((s) => {
      document.querySelector(s)?.click();
    }, sel);
    await page.waitForTimeout(450);
  };

  const draw = async (toolId, category, from, to) => {
    if (category) {
      await click(`.drawing-category[data-category="${category}"]`);
    }

    await page.evaluate(
      ({ id, a, b }) => {
        const canvas = document.querySelector(".drawing-canvas");
        const r = canvas.getBoundingClientRect();

        document.querySelector(`[data-tool-id="${id}"]`)?.click();

        const at = (dx, dy) => {
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

        at(a[0], a[1]);
        at(b[0], b[1]);
      },
      { id: toolId, a: from, b: to }
    );
    await page.waitForTimeout(500);
  };

  /* Read the drawn extent, in screen pixels, from the SVG itself. */
  const measured = () =>
    page.evaluate(() => {
      const svg = document.querySelector(".drawing-canvas svg");
      if (!svg) return null;

      let box = null;

      svg
        .querySelectorAll("path,line,rect,circle,polygon,polyline,text")
        .forEach((el) => {
          /* Selection handles are UI, not the drawing. */
          if (el.getAttribute("data-handle")) return;
          if (el.classList?.contains?.("handle")) return;

          try {
            const b = el.getBBox();
            if (!b || (!b.width && !b.height)) return;

            box = box
              ? {
                  x: Math.min(box.x, b.x),
                  y: Math.min(box.y, b.y),
                  r: Math.max(box.r, b.x + b.width),
                  b: Math.max(box.b, b.y + b.height),
                }
              : { x: b.x, y: b.y, r: b.x + b.width, b: b.y + b.height };
          } catch {
            /* not measurable */
          }
        });

      const r = svg.getBoundingClientRect();

      return {
        box,
        canvas: { w: Math.round(r.width), h: Math.round(r.height) },
        zoom:
          document.getElementById("drawingZoomValue")?.value,
      };
    });

  const out = {};

  /* --- EMPTY SHEET, BEFORE ANYTHING IS DRAWN --- */
  await click('[data-global-tool="fit"]');
  out.emptySheet = {
    message: await page.evaluate(
      () =>
        document.getElementById("drawingToolMessage")
          ?.innerText
    ),
    zoom: await page.evaluate(
      () =>
        document.getElementById("drawingZoomValue")
          ?.value
    ),
  };

  /* A big spread drawing plus a small detail far away. */
  await draw("line", "GEOMETRY", [0.1, 0.1], [0.85, 0.2]);
  await draw("rectangle", "GEOMETRY", [0.15, 0.75], [0.35, 0.9]);
  await draw("point-force", "STATICS", [0.7, 0.6], [0.85, 0.45]);

  out.drawn = await page.evaluate(() => {
    const svg = document.querySelector(".drawing-canvas svg");
    return {
      shapes: svg
        ? svg.querySelectorAll(
            "path,line,rect,circle,polygon,polyline"
          ).length
        : 0,
    };
  });

  /* --- WHOLE PAGE --- */
  await click('[data-global-tool="fit"]');
  out.wholePage = await measured();

  out.wholePageMessage = await page.evaluate(
    () =>
      document.getElementById("drawingToolMessage")
        ?.innerText
  );

  /* --- NOTHING SELECTED: Fit Selected falls back --- */
  await click('[data-global-tool="fit"]');
  out.fallback = await measured();

  out.fallbackMessage = await page.evaluate(
    () =>
      document.getElementById("drawingToolMessage")
        ?.innerText
  );

  /* --- WHOLE PAGE AGAIN, then select the point force only --- */
  await click('[data-global-tool="fit"]');

  await page.evaluate(() => {
    const panel = document.getElementById("drawingProperties");
    const rows = panel?.querySelectorAll(
      ".drawing-component-row"
    );
    const row = rows?.[rows.length - 1];
    row?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1 })
    );
  });
  await page.waitForTimeout(400);

  out.beforeSelected = await measured();

  await click('[data-global-tool="fit"]');
  out.selected = await measured();

  out.selectedMessage = await page.evaluate(
    () =>
      document.getElementById("drawingToolMessage")
        ?.innerText
  );

  /* Reopening whole page must undo the zoom, not the document. */
  await click('[data-global-tool="fit"]');
  out.wholePageAgain = await measured();

  return out;
}
