export default async function run(page) {
  const tab = page.getByRole("button", { name: "Engineering Drawing" });
  if (await tab.count()) {
    await tab.first().click();
    await page.waitForTimeout(400);
  }
  const box = await page.locator(".drawing-canvas").first().boundingBox();
  const at = (fx, fy) => ({
    x: box.x + box.width * fx,
    y: box.y + box.height * fy,
  });

  await page.locator('.drawing-category[data-category="STATICS"]').click();
  await page.waitForTimeout(250);
  await page.locator('.drawing-tool[data-tool-id="point-force"]').click();
  await page.waitForTimeout(250);
  let p = at(0.3, 0.3);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(250);
  p = at(0.55, 0.5);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(400);

  // Mark Magnitude unknown.
  await page.locator('.drawing-property-known[data-known="magnitude"]').click();
  await page.waitForTimeout(400);
  return { done: true };
}
