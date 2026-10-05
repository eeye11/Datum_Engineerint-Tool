/*
 * Verification aid: the general keyboard shortcuts. Tool letters,
 * Delete, Backspace and Ctrl+0 for Fit. Not part of the
 * application.
 */

export default async function run(page, ui) {
  const result = {};

  const snap = await ui.snapshot();
  await ui.click(snap.match(/@(e\d+) button "Engineering Drawing"/i)[1]);
  await page.waitForTimeout(2200);

  const box = await page.locator(".drawing-canvas").first().boundingBox();

  const click = async (fx, fy) => {
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(240);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(400);
  };

  const activeTool = () =>
    page.evaluate(
      () =>
        document
          .querySelector(".drawing-tool-list button.active")
          ?.getAttribute("data-tool-id") || null,
    );

  const tree = () =>
    page.evaluate(
      () => document.querySelectorAll(".drawing-component-row").length,
    );

  const zoom = () =>
    page.evaluate(
      () => document.getElementById("drawingZoomValue")?.textContent,
    );

  /* Letter shortcuts should select their tool. */
  await page.keyboard.press("r");
  await page.waitForTimeout(400);
  result.afterR = await activeTool();

  await page.keyboard.press("c");
  await page.waitForTimeout(400);
  result.afterC = await activeTool();

  /* Draw a rectangle with the mouse, then delete it. */
  await page.keyboard.press("r");
  await page.waitForTimeout(400);
  await click(0.2, 0.25);
  await click(0.45, 0.5);

  result["1_created"] = await tree();

  await page.keyboard.press("Delete");
  await page.waitForTimeout(500);
  result["2_afterDelete"] = await tree();

  /* Backspace should delete too. */
  await click(0.2, 0.25);
  await click(0.45, 0.5);
  result["3_recreated"] = await tree();

  await page.keyboard.press("Backspace");
  await page.waitForTimeout(500);
  result["4_afterBackspace"] = await tree();

  /* Ctrl+0 should fit. */
  result["5_zoomBefore"] = await zoom();

  await page.keyboard.press("Control+0");
  await page.waitForTimeout(500);
  result["6_zoomAfterFit"] = await zoom();

  return result;
}
