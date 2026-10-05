export default async function run(page, ui) {
  await page.goto("http://localhost:8099/", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  const tab = page
    .locator("button", { hasText: "Engineering Drawing" })
    .first();
  if (await tab.count()) await tab.click();
  await page.waitForTimeout(1500);

  const b = await page.locator(".drawing-workspace").first().boundingBox();
  const cx = b.x + b.width / 2,
    cy = b.y + b.height / 2;

  await page.locator('button[data-category="GEOMETRY"]').click();
  await page.waitForTimeout(400);
  await page.locator('#drawingToolList [data-tool-id="line"]').click();
  await page.waitForTimeout(250);
  await page.mouse.click(cx - 180, cy - 140);
  await page.waitForTimeout(200);
  await page.mouse.click(cx + 120, cy - 140);
  await page.waitForTimeout(600);

  await page.locator('button[data-category="ANNOTATE"]').click();
  await page.waitForTimeout(400);
  await page.locator('#drawingToolList [data-tool-id="dimension"]').click();
  await page.waitForTimeout(250);
  await page.mouse.click(cx, cy - 140);
  await page.waitForTimeout(400);

  // Hover the cursor away from the geometry: the preview should follow it.
  await page.mouse.move(cx + 40, cy + 20);
  await page.waitForTimeout(400);

  const clip = {
    x: b.x,
    y: b.y,
    width: Math.min(b.width, 880),
    height: Math.min(b.height, 520),
  };
  await page.screenshot({ path: "preview-live.png", clip });
  return {
    msg: await page.evaluate(
      () => document.getElementById("drawingToolMessage")?.textContent,
    ),
  };
}
