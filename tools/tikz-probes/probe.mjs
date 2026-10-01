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

  // Place a Point Force.
  await page.locator('#drawingToolList button[data-tool-id="force"]').click();
  await page.waitForTimeout(350);
  await page
    .locator(".drawing-coordinate-submenu-item", { hasText: "Point Force" })
    .first()
    .click();
  await page.waitForTimeout(400);
  await page.mouse.click(at(0.4, 0.4).x, at(0.4, 0.4).y);
  await page.waitForTimeout(900);

  // What did it store?
  out.stored = await page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll("#drawingProperties [data-property]")].map(
        (el) => [el.dataset.property, el.value],
      ),
    ),
  );

  // What SVG primitives did it draw, and where?
  out.rendered = await page.evaluate(() => {
    const svg = document.querySelector(".drawing-canvas svg");
    const lines = [...svg.querySelectorAll("line")].map((l) => ({
      x1: Math.round(Number(l.getAttribute("x1"))),
      y1: Math.round(Number(l.getAttribute("y1"))),
      x2: Math.round(Number(l.getAttribute("x2"))),
      y2: Math.round(Number(l.getAttribute("y2"))),
    }));
    const polygons = [...svg.querySelectorAll("polygon")].map((p) => ({
      points: (p.getAttribute("points") || "").slice(0, 70),
      fill: p.getAttribute("fill"),
    }));
    return { lineCount: lines.length, lines, polygons };
  });

  return out;
}
