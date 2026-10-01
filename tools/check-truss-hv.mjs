/*
 * Verification aid: while a truss member is being drawn, moving
 * the cursor level with or plumb with the member's start must
 * report a horizontal or vertical alignment. Not part of the
 * application.
 */

export default async function run(page, ui) {
  const result = {};

  const snap = await ui.snapshot();
  await ui.click(
    snap.match(/@(e\d+) button "Engineering Drawing"/i)[1],
  );

  await page
    .locator('.drawing-tool-list button')
    .first()
    .waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);

  const box =
    await page
      .locator('.drawing-canvas')
      .first()
      .boundingBox();

  const X = (fx) => box.x + box.width * fx;
  const Y = (fy) => box.y + box.height * fy;

  const click = async (fx, fy) => {
    await page.mouse.move(X(fx), Y(fy));
    await page.waitForTimeout(250);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(430);
  };

  const hover = async (fx, fy) => {
    await page.mouse.move(X(fx), Y(fy));
    await page.waitForTimeout(300);
  };

  const label = () =>
    page.evaluate(
      () =>
        document.getElementById('drawingToolMessage')
          ?.textContent,
    );

  await page
    .locator(
      '.drawing-category[data-category="STATICS"]',
    )
    .click();
  await page.waitForTimeout(500);

  await page
    .locator(
      '.drawing-tool-list button[data-tool-id="body"]',
    )
    .click();
  await page.waitForTimeout(500);

  await page
    .locator(
      '.drawing-coordinate-submenu ' +
        '[data-submenu-id="truss"]',
    )
    .click();
  await page.waitForTimeout(500);

  /* The first click sets where the member starts. */
  await click(0.2, 0.3);
  result.build = await page.evaluate(() => window.__drawingBuild || 'STALE');
  result.afterStart = await label();

  /* Well to the right and slightly BELOW the start's row. */
  await hover(0.62, 0.315);
  result.anchorAfterStart = await page.evaluate(() => window.__anchorDiag || 'NOT SET');
  result.horizontal = await label();

  /* Well below and slightly RIGHT of the start's column. */
  await hover(0.212, 0.7);
  result.vertical = await label();

  /* A long way away: should infer nothing. */
  await hover(0.75, 0.75);
  result.noInference = await label();

  result.anchor = 'probe removed';

  return result;
}
