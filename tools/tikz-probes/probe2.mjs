export default async function run(page, ui) {
  const out = {};
  const before = await ui.snapshot();
  const tab = before.match(/@(e\d+) [^\n]*Engineering Drawing/)?.[1];
  if (!tab) return { error: "drawing tab missing", before };
  await ui.click(tab);
  await page.waitForTimeout(2000);

  const canvas = page.locator(".drawing-canvas");
  const box = await canvas.boundingBox();
  const at = (x, y) => ({
    x: box.x + box.width * x,
    y: box.y + box.height * y,
  });

  await page.locator('.drawing-category[data-category="STATICS"]').click();
  await page.waitForTimeout(400);

  const place = async (category, label, pts) => {
    await page
      .locator(`#drawingToolList button[data-tool-id="${category}"]`)
      .click();
    await page.waitForTimeout(320);
    await page
      .locator(".drawing-coordinate-submenu-item", { hasText: label })
      .first()
      .click();
    await page.waitForTimeout(380);
    for (const [x, y] of pts) {
      await page.mouse.click(at(x, y).x, at(x, y).y);
      await page.waitForTimeout(260);
    }
    await page.waitForTimeout(550);
  };

  // Inspect the shape signature each symbol produces.
  const signature = async (label) => {
    const svg = await page.evaluate(() => {
      const s = document.querySelector(".drawing-canvas svg");
      return {
        circles: [...s.querySelectorAll("circle")].map((c) =>
          Math.round(Number(c.getAttribute("r"))),
        ),
        polygons: [...s.querySelectorAll("polygon")].map(
          (p) => (p.getAttribute("points") || "").split(" ").length,
        ),
        rects: s.querySelectorAll("rect").length,
        paths: [...s.querySelectorAll("path")].map((p) =>
          (p.getAttribute("d") || "").slice(0, 40),
        ),
        lines: s.querySelectorAll("line").length,
      };
    });
    return { label, ...svg };
  };

  const clearAll = async () => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      // Clear the drawing between symbol probes.
      const undo = document.getElementById("drawingUndo");
      return undo;
    });
  };

  out.pin =
    (await place("support", "Pin Support", [[0.3, 0.3]]),
    await signature("Pin Support"));

  await clearAll();
  await page.evaluate(() => {
    window.location.reload();
  });
  await page.waitForTimeout(2500);

  const tab2 = (await ui.snapshot()).match(
    /@(e\d+) [^\n]*Engineering Drawing/,
  )?.[1];
  if (tab2) await ui.click(tab2);
  await page.waitForTimeout(1500);
  await page.locator('.drawing-category[data-category="STATICS"]').click();
  await page.waitForTimeout(400);

  out.roller =
    (await place("support", "Roller Support", [[0.3, 0.3]]),
    await signature("Roller Support"));

  return out;
}
