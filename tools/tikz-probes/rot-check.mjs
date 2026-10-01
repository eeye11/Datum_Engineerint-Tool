export default async function run(page, ui) {
  await page.getByRole("button", { name: "Engineering Drawing" }).click();
  await page.waitForTimeout(200);
  await page.locator('.drawing-category[data-category="GEOMETRY"]').click();
  await page.waitForTimeout(200);

  const box = await page.locator(".drawing-canvas").boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const click = async (x, y) => {
    await page.mouse.click(x, y);
    await page.waitForTimeout(150);
  };

  const readPivot = () =>
    page.evaluate(() => {
      const els = [...document.querySelectorAll("rect[transform]")];
      const el = els[els.length - 1];
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const m = /rotate\([^,]+,\s*([-\d.]+)\s+([-\d.]+)\)/.exec(
        el.getAttribute("transform") || "",
      );
      if (!m) return null;
      const pivot = { x: +m[1], y: +m[2] };
      const centre = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      return {
        transform: el.getAttribute("transform"),
        pivot,
        centre,
        drift: +Math.hypot(pivot.x - centre.x, pivot.y - centre.y).toFixed(2),
      };
    });

  const results = {};

  await page.locator('.drawing-tool[data-tool-id="rectangle"]').click();
  await click(cx - 100, cy - 60);
  await click(cx + 100, cy + 60);

  const rot = page.locator('#drawingProperties [data-property="rotation"]');
  await rot.fill("45");
  await rot.dispatchEvent("change");
  await page.waitForTimeout(300);
  results.rectangle45 = await readPivot();

  // Rigid Body is a submenu child, so reach it through Bodies.
  await page.locator('.drawing-category[data-category="STATICS"]').click();
  await page.waitForTimeout(250);
  await page.locator('.drawing-tool[data-tool-id="body"]').click();
  await page.waitForTimeout(250);
  await page
    .locator(".drawing-coordinate-submenu-item", { hasText: "Rigid Body" })
    .click();
  await page.waitForTimeout(200);
  await click(cx, cy);
  await page.waitForTimeout(300);

  const rb = page.locator('#drawingProperties [data-property="rotation"]');
  results.rigidBodyHasRotation = await rb.count();
  if (await rb.count()) {
    await rb.fill("30");
    await rb.dispatchEvent("change");
    await page.waitForTimeout(300);
    results.rigidBody30 = await readPivot();
  }

  return results;
}
