/*
 * Establishes how the Statics tools are actually used, so the Fit
 * matrix creates real features rather than empty ones. Verification
 * aid, not part of the application.
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

  const shapes = () =>
    page.evaluate(() => {
      const svg = document.querySelector(".drawing-canvas svg");
      if (!svg) return 0;
      return Array.from(
        svg.querySelectorAll("path,line,rect,circle,polygon,polyline")
      ).filter(
        (el) => !el.classList.contains("drawing-engineering-grid")
      ).length;
    });

  const at = async (dx, dy) => {
    await page.evaluate(
      ({ x, y }) => {
        const c = document.querySelector(".drawing-canvas");
        const r = c.getBoundingClientRect();
        const o = {
          bubbles: true,
          cancelable: true,
          clientX: r.left + r.width * x,
          clientY: r.top + r.height * y,
          button: 0,
          detail: 1,
        };
        ["pointermove", "mousemove", "pointerdown", "mousedown",
         "click", "pointerup", "mouseup"].forEach((t) =>
          c.dispatchEvent(new MouseEvent(t, o)));
      },
      { x: dx, y: dy }
    );
    await page.waitForTimeout(300);
    return await msg();
  };

  const arm = async (category, id) => {
    await page.evaluate(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true
        })
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
    await page.waitForTimeout(400);

    await page.evaluate((i) => {
      document.querySelector(`[data-tool-id="${i}"]`)?.click();
    }, id);
    await page.waitForTimeout(250);

    return await msg();
  };

  const out = {};

  /* 1. A BODY, in free space. */
  out.bodyArmed = await arm("STATICS", "body");
  out.body1 = await at(0.25, 0.5);
  out.body2 = await at(0.75, 0.5);
  out.afterBody = await shapes();

  /* 2. A FORCE, which should attach to the body now. */
  out.forceArmed = await arm("STATICS", "point-force");
  out.force1 = await at(0.5, 0.5);
  out.force2 = await at(0.5, 0.3);
  out.afterForce = await shapes();

  /* 3. A SUPPORT, on the body. */
  out.supportArmed = await arm("STATICS", "support");
  out.support1 = await at(0.25, 0.5);
  out.afterSupport = await shapes();

  return out;
}
