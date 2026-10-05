/*
 * Verification aid: direct manipulation must win over the active
 * creation tool. A feature must MOVE when dragged, and no new
 * feature may be started by that gesture. Not part of the
 * application.
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
    await page.waitForTimeout(240);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(400);
  };

  const tool = async (id) => {
    await page
      .locator(`.drawing-tool-list button[data-tool-id="${id}"]`)
      .click();
    await page.waitForTimeout(400);
  };

  /* A real drag: move, press, travel, release. */
  const drag = async (x1, y1, x2, y2) => {
    await page.mouse.move(X(x1), Y(y1));
    await page.waitForTimeout(200);
    await page.mouse.down();
    await page.mouse.move(X(x2), Y(y2), { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(500);
  };

  const tree = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll(".drawing-component-row")).map((n) =>
        n.textContent.trim().replace(/\s+/g, " "),
      ),
    );

  const msg = () =>
    page.evaluate(
      () => document.getElementById("drawingToolMessage")?.textContent,
    );

  /* A rectangle to move. */
  await tool("rectangle");
  await click(0.2, 0.25);
  await click(0.45, 0.5);
  result["1_created"] = await tree();

  /* Arm a CREATION tool that would otherwise act on a click. */
  await tool("circle");
  result["2_circleArmed"] = await msg();

  /*
   * Drag the selected rectangle's body. It must move, and the
   * Circle tool must not have started a circle.
   */
  await drag(0.32, 0.37, 0.62, 0.72);

  result["3_afterDrag"] = {
    message: await msg(),
    tree: await tree(),
  };

  /* And again with the Line tool armed. */
  await tool("line");
  result["4_lineArmed"] = await msg();

  await drag(0.47, 0.61, 0.25, 0.8);

  result["5_afterSecondDrag"] = {
    message: await msg(),
    tree: await tree(),
  };

  return result;
}
