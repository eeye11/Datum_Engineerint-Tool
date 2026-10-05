/*
 * Verification aid: compare horizontal and vertical inference
 * between the Line tool and the Truss tool under identical
 * conditions.
 *
 * Everything is read from the DOM, because that is the only
 * channel that reliably reports the page's real state. The
 * status bar is the app's own statement of what it has snapped
 * to, so it is the evidence.
 *
 * Not part of the application.
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
    await page.waitForTimeout(260);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(450);
  };

  const hover = async (fx, fy) => {
    await page.mouse.move(X(fx), Y(fy));
    await page.waitForTimeout(320);
  };

  const label = () =>
    page.evaluate(
      () =>
        document.getElementById('drawingToolMessage')
          ?.textContent,
    );

  /* ---- THE LINE TOOL, as the known-good control ---- */

  await page
    .locator(
      '.drawing-tool-list button[data-tool-id="line"]',
    )
    .click();
  await page.waitForTimeout(450);

  await click(0.2, 0.3);
  result.lineAfterStart = await label();

  await hover(0.62, 0.312);
  result.lineHorizontal = await label();

  await hover(0.212, 0.7);
  result.lineVertical = await label();

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  /* ---- THE TRUSS TOOL, the same gestures ---- */

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

  await click(0.2, 0.3);
  result.trussAfterStart = await label();

  await hover(0.62, 0.312);
  result.trussHorizontal = await label();

  await hover(0.212, 0.7);
  result.trussVertical = await label();

  return result;
}
