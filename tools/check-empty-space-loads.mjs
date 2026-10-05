/*
 * Verification aid: both Distributed Load and Varying
 * Distributed Load must be able to start from EMPTY SPACE, with
 * no body beneath the cursor, using the Line-style two-click
 * span. Everything is read from the DOM.
 *
 * Not part of the application.
 */

export default async function run(page, ui) {
  const result = {};

  const snap = await ui.snapshot();
  await ui.click(snap.match(/@(e\d+) button "Engineering Drawing"/i)[1]);

  await page
    .locator(".drawing-tool-list button")
    .first()
    .waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);

  const box = await page.locator(".drawing-canvas").first().boundingBox();

  const X = (fx) => box.x + box.width * fx;
  const Y = (fy) => box.y + box.height * fy;

  const click = async (fx, fy) => {
    await page.mouse.move(X(fx), Y(fy));
    await page.waitForTimeout(260);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(450);
  };

  const hover = async (fx, fy) => {
    await page.mouse.move(X(fx), Y(fy));
    await page.waitForTimeout(300);
  };

  const label = () =>
    page.evaluate(
      () => document.getElementById("drawingToolMessage")?.textContent,
    );

  const tree = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll(".drawing-component-row")).map((n) =>
        n.textContent.trim().replace(/\s+/g, " "),
      ),
    );

  const loadTool = async (id) => {
    await page.locator('.drawing-category[data-category="STATICS"]').click();
    await page.waitForTimeout(500);
    await page
      .locator('.drawing-tool-list button[data-tool-id="load"]')
      .click();
    await page.waitForTimeout(500);
    await page
      .locator(".drawing-coordinate-submenu " + `[data-submenu-id="${id}"]`)
      .click();
    await page.waitForTimeout(500);
  };

  /* ---- DISTRIBUTED LOAD, from empty space ---- */

  await loadTool("distributed-load");
  result.constantArmed = await label();

  /* Well away from anything: 0.2,0.2 is empty canvas. */
  await click(0.2, 0.2);
  result.constantAfterFirst = await label();

  await click(0.8, 0.2);
  result.constantAfterSpan = await label();

  await hover(0.3, 0.2);
  await click(0.3, 0.2);
  result.constantFinished = await label();

  /* ---- VARYING DISTRIBUTED LOAD, from empty space ---- */

  await loadTool("varying-distributed-load");
  result.varyingArmed = await label();

  await click(0.2, 0.7);
  result.varyingAfterFirst = await label();

  await click(0.8, 0.7);
  result.varyingAfterSpan = await label();

  await hover(0.25, 0.6);
  await click(0.25, 0.6);
  result.varyingAfterForce = await label();

  await hover(0.5, 0.75);
  await click(0.5, 0.75);
  result.varyingAfterSecond = await label();

  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);

  result.varyingFinished = await label();
  result.tree = await tree();

  return result;
}
