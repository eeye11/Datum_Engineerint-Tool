/*
 * Verification aid: is the mousemove handler actually firing,
 * and is the element it is bound to still in the document? Not
 * part of the application.
 */

export default async function run(page, ui) {
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

  /* Move across the middle of the canvas. */
  await page.mouse.move(
    box.x + box.width * 0.3,
    box.y + box.height * 0.3,
  );
  await page.waitForTimeout(200);
  await page.mouse.move(
    box.x + box.width * 0.6,
    box.y + box.height * 0.6,
  );
  await page.waitForTimeout(400);

  return await page.evaluate(() => {
    const canvas = document.querySelector(
      '.drawing-canvas',
    );

    /*
     * The element the coordinates line updates proves the
     * handler ran; comparing it to its initial value is the
     * check, because a stale reading is the symptom.
     */
    return {
      probeSet: '__anchorDiag' in window,
      coordinates:
        document.getElementById('drawingCoordinates')
          ?.textContent,
      canvasInDocument: document.contains(canvas),
      canvasChildren: canvas?.children.length,
      svgPresent: Boolean(
        canvas?.querySelector('svg'),
      ),
      drawingSection:
        document.getElementById('drawing')?.className,
    };
  });
}
