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
  await page.mouse.click(cx - 150, cy - 120);
  await page.waitForTimeout(200);
  await page.mouse.click(cx + 150, cy - 120);
  await page.waitForTimeout(600);

  // Dimension the line, placing it above.
  await page.locator('button[data-category="ANNOTATE"]').click();
  await page.waitForTimeout(400);
  await page.locator('#drawingToolList [data-tool-id="dimension"]').click();
  await page.waitForTimeout(250);
  await page.mouse.click(cx, cy - 120);
  await page.waitForTimeout(400);
  await page.mouse.click(cx, cy - 200);
  await page.waitForTimeout(700);

  await page.screenshot({
    path: "dim-result.png",
    clip: {
      x: b.x,
      y: b.y,
      width: Math.min(b.width, 900),
      height: Math.min(b.height, 600),
    },
  });
  return {
    msg: await page.evaluate(
      () => document.getElementById("drawingToolMessage")?.textContent,
    ),
  };
}
