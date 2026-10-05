/*
 * Draws one feature, arming the tool AFTER the category switch has
 * settled, and reports what was created. Verification aid.
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

  /*
   * Arm a tool in one round trip.
   *
   * Switching category RE-RENDERS the tool list, which detaches the
   * button. A tool click issued before the re-render lands is a click
   * on an element that is no longer in the document: it does
   * nothing, silently, and every later click then reports "Ready".
   */
  const arm = async (category, id) => {
    await page.evaluate((c) => {
      document
        .querySelector(`.drawing-category[data-category="${c}"]`)
        ?.click();
    }, category);
    await page.waitForTimeout(400);

    const armed = await page.evaluate((i) => {
      const b = document.querySelector(`[data-tool-id="${i}"]`);
      if (!b) return "no button " + i;
      b.click();
      return "clicked " + i;
    }, id);

    return { armed, message: await msg() };
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
    await page.waitForTimeout(300);
    return await msg();
  };

  const shapes = () =>
    page.evaluate(() => {
      const svg = document.querySelector(".drawing-canvas svg");
      return svg
        ? svg.querySelectorAll("path,line,rect,circle,polygon,polyline").length
        : 0;
    });

  const out = {};

  out.line = await arm("GEOMETRY", "line");
  out.line1 = await at(0.25, 0.25);
  out.line2 = await at(0.75, 0.75);
  out.afterLine = await shapes();

  out.arc = await arm("GEOMETRY", "arc");
  out.arc1 = await at(0.25, 0.7);
  out.arc2 = await at(0.7, 0.7);
  out.arc3 = await at(0.5, 0.9);
  out.afterArc = await shapes();

  out.body = await arm("STATICS", "body");
  out.body1 = await at(0.3, 0.5);
  out.body2 = await at(0.7, 0.5);
  out.afterBody = await shapes();

  return out;
}
