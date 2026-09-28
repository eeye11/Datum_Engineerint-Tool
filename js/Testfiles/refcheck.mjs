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

  // Create a Reference Point.
  await page
    .locator('#drawingToolList button[data-tool-id="reference-point"]')
    .click();
  await page.waitForTimeout(300);
  await page.mouse.click(at(0.35, 0.45).x, at(0.35, 0.45).y);
  await page.waitForTimeout(800);

  out.refPointTitle = await page.evaluate(() =>
    document
      .getElementById("drawingProperties")
      .innerText.split("\n")
      .slice(0, 3)
      .join(" | "),
  );

  // Read the feature tree row's name and group.
  await page.locator('#drawingToolList button[data-tool-id="select"]').click();
  await page.waitForTimeout(300);
  await page.mouse.click(at(0.03, 0.03).x, at(0.03, 0.03).y);
  await page.waitForTimeout(600);

  out.tree = await page.evaluate(() => {
    const groups = [];
    document.querySelectorAll(".drawing-component-group").forEach((g) => {
      const rows = [];
      let node = g.nextElementSibling;
      while (node && node.classList.contains("drawing-component-row")) {
        rows.push(node.innerText.trim());
        node = node.nextElementSibling;
      }
      groups.push({ group: g.textContent.trim(), rows });
    });
    return groups;
  });

  // Create a Geometry Point for comparison.
  await page.locator('.drawing-category[data-category="GEOMETRY"]').click();
  await page.waitForTimeout(300);
  await page.locator('#drawingToolList button[data-tool-id="point"]').click();
  await page.waitForTimeout(300);
  await page.mouse.click(at(0.6, 0.45).x, at(0.6, 0.45).y);
  await page.waitForTimeout(700);
  out.geoPointTitle = await page.evaluate(
    () => document.getElementById("drawingProperties").innerText.split("\n")[0],
  );

  await page.locator('#drawingToolList button[data-tool-id="select"]').click();
  await page.waitForTimeout(300);
  await page.mouse.click(at(0.03, 0.03).x, at(0.03, 0.03).y);
  await page.waitForTimeout(600);

  out.treeAfter = await page.evaluate(() => {
    const groups = [];
    document.querySelectorAll(".drawing-component-group").forEach((g) => {
      const rows = [];
      let node = g.nextElementSibling;
      while (node && node.classList.contains("drawing-component-row")) {
        rows.push(node.innerText.trim());
        node = node.nextElementSibling;
      }
      groups.push({ group: g.textContent.trim(), rows });
    });
    return groups;
  });

  return out;
}
