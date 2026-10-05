/*
 * Isolates the two failure groups from the Fit matrix:
 *   - do arc / truss / cable / shaft / load need more clicks?
 *   - is a clipped "fit" real, or an off-screen neighbour being
 *     measured?
 * Verification aid, not part of the application.
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

  const msg = () =>
    page.evaluate(
      () =>
        document.getElementById("drawingToolMessage")
          ?.innerText || ""
    );

  const at = async (dx, dy) => {
    await page.evaluate(
      ({ x, y }) => {
        const c = document.querySelector(".drawing-canvas");
        const r = c.getBoundingClientRect();
        const o = {
          bubbles: true, cancelable: true,
          clientX: r.left + r.width * x,
          clientY: r.top + r.height * y,
          button: 0, detail: 1,
        };
        ["pointermove", "mousemove", "pointerdown", "mousedown",
         "click", "pointerup", "mouseup"].forEach((t) =>
          c.dispatchEvent(new MouseEvent(t, o)));
      },
      { x: dx, y: dy }
    );
    await page.waitForTimeout(280);
    return await msg();
  };

  const arm = async (category, id) => {
    await page.evaluate(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    await page.waitForTimeout(200);
    await page.evaluate(
      (c) => {
        document
          .querySelector(`.drawing-category[data-category="${c}"]`)
          ?.click();
      },
      category
    );
    await page.waitForTimeout(420);
    await page.evaluate((i) => {
      document.querySelector(`[data-tool-id="${i}"]`)?.click();
    }, id);
    await page.waitForTimeout(250);
    return await msg();
  };

  const visible = () =>
    page.evaluate(() => {
      const canvas = document.querySelector(".drawing-canvas");
      const svg = canvas?.querySelector("svg");
      const cr = canvas.getBoundingClientRect();

      const all = svg
        ? Array.from(
            svg.querySelectorAll(
              "path,line,rect,circle,polygon,polyline,text"
            )
          ).filter(
            (el) => !el.classList.contains("drawing-engineering-grid")
          )
        : [];

      /* How many of the shapes are actually ON the canvas? */
      const onScreen = all.filter((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.right > cr.left &&
          r.left < cr.right &&
          r.bottom > cr.top &&
          r.top < cr.bottom
        );
      });

      return {
        total: all.length,
        onScreen: onScreen.length,
        /* The widest thing on screen, relative to the canvas. */
        maxRight: Math.round(
          Math.max(
            0,
            ...onScreen.map(
              (el) =>
                el.getBoundingClientRect().right - cr.left
            )
          )
        ),
        maxBottom: Math.round(
          Math.max(
            0,
            ...onScreen.map(
              (el) =>
                el.getBoundingClientRect().bottom - cr.top
            )
          )
        ),
        canvasW: Math.round(cr.width),
        canvasH: Math.round(cr.height),
      };
    });

  const out = {};

  /* --- how many clicks does each tool want? --- */
  for (const [category, id] of [
    ["GEOMETRY", "arc"],
    ["STATICS", "cuss" /* placeholder */],
  ]) {
    if (id === "cuss") continue;
    const armed = await arm(category, id);
    const steps = [armed];
    for (const [x, y] of [[0.3, 0.4], [0.7, 0.4], [0.5, 0.6], [0.5, 0.3]]) {
      steps.push(await at(x, y));
    }
    out[id] = steps;
    out[`${id}_visible`] = await visible();
  }

  /* --- is the 500% "clipping" real? --- */
  await page.evaluate(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
  });
  await page.waitForTimeout(200);

  /* One small object, one big object. */
  await arm("GEOMETRY", "line");
  await at(0.05, 0.05);
  await at(0.95, 0.95);
  await page.evaluate(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
  });
  await page.waitForTimeout(200);
  await arm("GEOMETRY", "line");
  await at(0.46, 0.46);
  await at(0.5, 0.5);

  await page.evaluate(() => {
    document.querySelector('[data-global-tool="fit"]')?.click();
  });
  await page.waitForTimeout(500);
  out.beforeSelect = await visible();

  /* Select the SMALL one and fit it. */
  await arm("GEOMETRY", "select");
  await page.evaluate(() => {
    const rows = document.querySelectorAll(".drawing-component-row");
    rows?.[rows.length - 1]?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1 })
    );
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.querySelector('[data-global-tool="fit"]')?.click();
  });
  await page.waitForTimeout(600);

  out.afterSelect = await visible();
  out.zoom = await page.evaluate(
    () =>
      document.getElementById("drawingZoomValue")?.value
  );

  return out;
}
