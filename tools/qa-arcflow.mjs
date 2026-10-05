/*
 * Reports the tool message after each click for a Statics span tool,
 * so a construction that needs more clicks is visible. Verification
 * aid, not part of the application.
 */
export default async function run(page, ui) {
  await page.waitForLoadState("load", { timeout: 30000 });

  await page
    .waitForFunction(
      () => document.querySelectorAll("[data-tool-id]").length > 0,
      { timeout: 30000 },
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
      () => document.getElementById("drawingToolMessage")?.innerText || "",
    );

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
        [
          "pointermove",
          "mousemove",
          "pointerdown",
          "mousedown",
          "click",
          "pointerup",
          "mouseup",
        ].forEach((t) => c.dispatchEvent(new MouseEvent(t, o)));
      },
      { x: dx, y: dy },
    );
    await page.waitForTimeout(320);
    return await msg();
  };

  const out = {};

  /* Arc, which is a plain geometry span. */
  await page.evaluate(() => {
    document
      .querySelector('.drawing-category[data-category="GEOMETRY"]')
      ?.click();
  });
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    document.querySelector('[data-tool-id="arc"]')?.click();
  });
  out.arcArmed = await msg();
  out.arc1 = await at(0.3, 0.3);
  out.arc2 = await at(0.7, 0.7);
  out.arc3 = await at(0.5, 0.5);

  /* A Statics body, which may ask for a parent first. */
  await page.evaluate(() => {
    document
      .querySelector('.drawing-category[data-category="STATICS"]')
      ?.click();
  });
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    document.querySelector('[data-tool-id="body"]')?.click();
  });
  out.bodyArmed = await msg();
  out.body1 = await at(0.3, 0.4);
  out.body2 = await at(0.7, 0.4);
  out.body3 = await at(0.5, 0.6);

  out.zoom = await page.evaluate(
    () => document.getElementById("drawingZoomValue")?.value,
  );

  return out;
}
