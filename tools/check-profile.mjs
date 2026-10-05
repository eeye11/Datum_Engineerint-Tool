/*
 * Verification aid: a Varying Distributed Load must draw a
 * profile outline, and a constant one must not. Not part of the
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
    await page.waitForTimeout(420);
  };

  const hover = async (fx, fy) => {
    await page.mouse.move(X(fx), Y(fy));
    await page.waitForTimeout(240);
  };

  const press = async (key) => {
    await page.keyboard.press(key);
    await page.waitForTimeout(450);
  };

  const tool = async (id) => {
    await page
      .locator(`.drawing-tool-list button[data-tool-id="${id}"]`)
      .click();
    await page.waitForTimeout(400);
  };

  const loadTool = async (id) => {
    await page.locator('.drawing-category[data-category="STATICS"]').click();
    await page.waitForTimeout(450);
    await page
      .locator('.drawing-tool-list button[data-tool-id="load"]')
      .click();
    await page.waitForTimeout(500);
    await page
      .locator(".drawing-coordinate-submenu " + `[data-submenu-id="${id}"]`)
      .click();
    await page.waitForTimeout(450);
  };

  /*
   * A translucent filled polygon is the profile outline. The
   * arrow heads are small filled polygons, so the outline is
   * distinguished by being large.
   */
  const outlines = () =>
    page.evaluate(() => {
      const svg = document.querySelector(".drawing-canvas svg");

      return Array.from(svg.querySelectorAll("polygon"))
        .map((n) => {
          const pts = (n.getAttribute("points") || "")
            .split(" ")
            .filter(Boolean)
            .map((p) => p.split(",").map(Number));

          const xs = pts.map((p) => p[0]);
          const ys = pts.map((p) => p[1]);

          return {
            points: pts.length,
            width: Math.round(Math.max(...xs) - Math.min(...xs)),
            height: Math.round(Math.max(...ys) - Math.min(...ys)),
            fillOpacity: n.getAttribute("fill-opacity"),
          };
        })
        .filter((p) => p.points > 4 && p.fillOpacity !== null);
    });

  /* A body. */
  await tool("line");
  await click(0.1, 0.78);
  await click(0.9, 0.78);
  await tool("select");
  await click(0.5, 0.08);

  /* ---- CONSTANT: no outline expected ---- */

  await loadTool("distributed-load");
  await click(0.3, 0.78);
  await hover(0.3, 0.6);
  await click(0.3, 0.6);

  result.constant = await outlines();

  /* ---- VARYING: outline expected ---- */

  await tool("select");
  await click(0.5, 0.08);

  await loadTool("varying-distributed-load");
  await click(0.15, 0.78);
  result.varyingAfterBody = await outlines();

  await hover(0.15, 0.45);
  await click(0.15, 0.45);
  await hover(0.45, 0.6);
  await click(0.45, 0.6);
  await hover(0.75, 0.3);
  await click(0.75, 0.3);

  result.varyingBuilding = await outlines();

  await press("Enter");
  result.varyingFinished = await outlines();

  result.msg = await page.evaluate(
    () => document.getElementById("drawingToolMessage")?.textContent,
  );

  return result;
}
