export default async function run(page, ui) {
  await page.goto("http://localhost:8099/", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  const tab = page
    .locator("button", { hasText: "Engineering Drawing" })
    .first();
  if (await tab.count()) await tab.click();
  await page.waitForTimeout(1500);

  const b = await page.locator(".drawing-workspace").first().boundingBox();
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;

  // A rectangle, dimensioned by clicking INSIDE it.
  await page.locator('button[data-category="GEOMETRY"]').click();
  await page.waitForTimeout(400);
  await page.locator('#drawingToolList [data-tool-id="rectangle"]').click();
  await page.waitForTimeout(250);
  await page.mouse.click(cx - 200, cy - 150);
  await page.waitForTimeout(250);
  await page.mouse.click(cx + 60, cy - 30);
  await page.waitForTimeout(700);

  await page.locator('button[data-category="ANNOTATE"]').click();
  await page.waitForTimeout(400);
  await page.locator('#drawingToolList [data-tool-id="dimension"]').click();
  await page.waitForTimeout(250);
  await page.mouse.click(cx - 70, cy - 90); // inside the body
  await page.waitForTimeout(500);
  await page.mouse.move(cx - 70, cy + 90); // hover below: preview follows
  await page.waitForTimeout(400);

  await page.screenshot({
    path: "final-check.png",
    clip: {
      x: b.x,
      y: b.y,
      width: Math.min(b.width, 860),
      height: Math.min(b.height, 480),
    },
  });

  const msg = await page.evaluate(
    () => document.getElementById("drawingToolMessage")?.textContent,
  );
  return { msg };
}
