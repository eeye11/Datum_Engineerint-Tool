/*
 * Verification aid: Truss Optimize must reduce the spread of
 * triangle sizes while leaving horizontal and vertical members
 * horizontal and vertical. Not part of the application.
 */

export default async function run(page, ui) {
  const result = {};

  const snap = await ui.snapshot();
  await ui.click(
    snap.match(/@(e\d+) button "Engineering Drawing"/i)[1],
  );
  await page.waitForTimeout(2200);

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
    await page.waitForTimeout(420);
  };

  const press = async (key) => {
    await page.keyboard.press(key);
    await page.waitForTimeout(400);
  };

  const pick = async (group, id) => {
    await page
      .locator(
        '.drawing-category[data-category="STATICS"]',
      )
      .click();
    await page.waitForTimeout(450);
    await page
      .locator(
        `.drawing-tool-list button[data-tool-id="${group}"]`,
      )
      .click();
    await page.waitForTimeout(500);
    await page
      .locator(
        '.drawing-coordinate-submenu ' +
          `[data-submenu-id="${id}"]`,
      )
      .click();
    await page.waitForTimeout(450);
  };

  /*
   * The drawn member lines, as a signature of the structure.
   * Axis-aligned members are read separately from diagonals, so a
   * change of direction in either class is visible.
   */
  const structure = () =>
    page.evaluate(() => {
      const svg = document.querySelector(
        '.drawing-canvas svg',
      );

      let axis = 0;
      let diagonal = 0;

      svg.querySelectorAll('line').forEach((n) => {
        const dx = Math.abs(
          Number(n.getAttribute('x2')) -
            Number(n.getAttribute('x1')),
        );
        const dy = Math.abs(
          Number(n.getAttribute('y2')) -
            Number(n.getAttribute('y1')),
        );

        const length = Math.hypot(dx, dy);

        if (length < 1) return;

        if (Math.max(dx, dy) / length > 0.999) {
          axis += 1;
        } else {
          diagonal += 1;
        }
      });

      return { axis, diagonal };
    });

  /* A panel with a diagonal: four sides plus one brace. */
  await pick('body', 'truss');

  await click(0.2, 0.25);
  await click(0.8, 0.25);
  await click(0.8, 0.6);
  await click(0.2, 0.6);
  await click(0.2, 0.25);
  await click(0.5, 0.425);
  await press('Enter');

  result.afterBuild = await structure();

  /* Run Optimize. */
  const optimize = page.locator(
    '#drawingProperties [data-truss-optimize]',
  );

  result.optimizeVisible = await optimize.count();

  if (result.optimizeVisible) {
    await optimize.click();
    await page.waitForTimeout(700);
  }

  result.afterOptimize = await structure();

  result.message =
    await page.evaluate(
      () =>
        document.getElementById('drawingToolMessage')
          ?.textContent,
    );

  result.panel =
    await page.evaluate(
      () =>
        (
          document.getElementById('drawingProperties')
            ?.innerText || ''
        ).replace(/\n+/g, ' | '),
    );

  return result;
}
