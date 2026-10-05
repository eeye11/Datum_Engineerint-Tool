/*
 * Verification aid: the Varying Distributed Load as the FIRST
 * statics tool used in a fresh session, so nothing a previous
 * tool did can be responsible. Not part of the application.
 */

export default async function run(page, ui) {
  const result = {};

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
    await page.waitForTimeout(450);
  };

  const hover = async (fx, fy) => {
    await page.mouse.move(X(fx), Y(fy));
    await page.waitForTimeout(260);
  };

  const msg = () =>
    page.evaluate(
      () => document.getElementById("drawingToolMessage")?.textContent,
    );

  /* A body, drawn first and deselected. */
  await page.locator('.drawing-tool-list button[data-tool-id="line"]').click();
  await page.waitForTimeout(400);
  await click(0.1, 0.75);
  await click(0.9, 0.75);

  await page
    .locator('.drawing-tool-list button[data-tool-id="select"]')
    .click();
  await page.waitForTimeout(350);
  await click(0.5, 0.1);

  /* The varying tool, used first. */
  await page.locator('.drawing-category[data-category="STATICS"]').click();
  await page.waitForTimeout(500);
  await page.locator('.drawing-tool-list button[data-tool-id="load"]').click();
  await page.waitForTimeout(550);

  result.submenu = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        ".drawing-coordinate-submenu [data-submenu-id]",
      ),
    ).map((n) => n.dataset.submenuId),
  );

  await page
    .locator(
      ".drawing-coordinate-submenu " +
        '[data-submenu-id="varying-distributed-load"]',
    )
    .click();
  await page.waitForTimeout(500);

  result["1_armed"] = await msg();

  await click(0.2, 0.75);
  result["2_afterBody"] = await msg();

  await hover(0.2, 0.45);
  await click(0.2, 0.45);
  result["3_afterFirstForce"] = await msg();

  return result;
}
