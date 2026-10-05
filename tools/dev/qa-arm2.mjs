/*
 * Arms one tool from a known-idle state, so a case in the Fit matrix
 * cannot inherit the previous tool's half-finished construction.
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

  /*
   * Put the editor back to idle.
   *
   * Escape abandons any construction in progress. Without it, the next
   * tool's first click is consumed as the SECOND point of the previous
   * tool's construction - which is why one case's feature appeared to
   * need a different number of clicks than it really did.
   */
  const idle = async () => {
    await page.evaluate(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true
        })
      );
    });
    await page.waitForTimeout(250);

    /* Selecting is the neutral resting tool. */
    await page.evaluate(() => {
      document
        .querySelector(
          '.drawing-category[data-category="GEOMETRY"]'
        )
        ?.click();
    });
    await page.waitForTimeout(300);
  };

  const arm = async (category, id) => {
    await idle();

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

  const shapes = () =>
    page.evaluate(() => {
      const svg = document.querySelector(".drawing-canvas svg");
      if (!svg) return 0;
      return Array.from(
        svg.querySelectorAll("path,line,rect,circle,polygon,polyline")
      ).filter((el) => !el.classList.contains("drawing-engineering-grid"))
        .length;
    });

  const out = {};

  out.arcArmed = await arm("GEOMETRY", "arc");
  out.a1 = await at(0.25, 0.7);
  out.a2 = await at(0.7, 0.7);
  out.a3 = await at(0.5, 0.9);
  out.afterArc = await shapes();

  out.bodyArmed = await arm("STATICS", "body");
  out.b1 = await at(0.3, 0.5);
  out.b2 = await at(0.7, 0.5);
  out.afterBody = await shapes();

  out.loadArmed = await arm("STATICS", "load");
  out.l1 = await at(0.2, 0.5);
  out.l2 = await at(0.8, 0.5);
  out.l3 = await at(0.5, 0.2);
  out.afterLoad = await shapes();

  out.momentArmed = await arm("STATICS", "moment");
  out.m1 = await at(0.5, 0.5);
  out.afterMoment = await shapes();

  return out;
}
