/*
 * Verification aid: a distributed load's arrows must keep
 * growing as the cursor is pulled further from the body. Reads
 * the rendered arrow length at two very different cursor
 * distances. Not part of the application.
 */

export default async function run(page, ui) {
  const snap = await ui.snapshot();
  await ui.click(snap.match(/@(e\d+) button "Engineering Drawing"/i)[1]);
  await page.waitForTimeout(2200);

  const box = await page.locator(".drawing-canvas").first().boundingBox();

  const X = (fx) => box.x + box.width * fx;
  const Y = (fy) => box.y + box.height * fy;

  const click = async (fx, fy) => {
    await page.mouse.move(X(fx), Y(fy));
    await page.waitForTimeout(260);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(420);
  };

  const hover = async (fx, fy) => {
    await page.mouse.move(X(fx), Y(fy));
    await page.waitForTimeout(260);
  };

  /*
   * The longest arrow currently drawn, in pixels. If the arrows
   * are capped, this stops growing however far the cursor goes.
   */
  const arrows = () =>
    page.evaluate(() => {
      const svg = document.querySelector(".drawing-canvas svg");

      const lengths = [];

      svg.querySelectorAll("line").forEach((n) => {
        const x1 = Number(n.getAttribute("x1"));
        const y1 = Number(n.getAttribute("y1"));
        const x2 = Number(n.getAttribute("x2"));
        const y2 = Number(n.getAttribute("y2"));

        const len = Math.hypot(x2 - x1, y2 - y1);

        if (len > 0) {
          lengths.push(Math.round(len));
        }
      });

      return {
        longest: lengths.length ? Math.max(...lengths) : 0,
        count: lengths.length,
      };
    });

  /* A body. */
  await page.locator('.drawing-tool-list button[data-tool-id="line"]').click();
  await page.waitForTimeout(400);
  await click(0.1, 0.72);
  await click(0.9, 0.72);

  await page
    .locator('.drawing-tool-list button[data-tool-id="select"]')
    .click();
  await page.waitForTimeout(350);
  await click(0.5, 0.12);

  await page.locator('.drawing-category[data-category="STATICS"]').click();
  await page.waitForTimeout(450);
  await page.locator('.drawing-tool-list button[data-tool-id="load"]').click();
  await page.waitForTimeout(500);
  await page
    .locator(
      ".drawing-coordinate-submenu " + '[data-submenu-id="distributed-load"]',
    )
    .click();
  await page.waitForTimeout(450);

  /* The body. */
  await click(0.5, 0.72);
  result_afterBody = true;

  /* A NEAR cursor: a small magnitude. */
  await hover(0.5, 0.68);
  result.near = await arrows();

  /* A FAR cursor: a much larger magnitude. */
  await hover(0.5, 0.3);
  result.far = await arrows();

  /* A very far cursor. */
  await hover(0.5, 0.1);
  result.veryFar = await arrows();

  return result;
}
