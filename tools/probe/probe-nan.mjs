export default async function run(page, ui) {
  const errs = [];
  page.on("console", (m) => {
    if (m.type() === "error") errs.push(m.text().slice(0, 120));
  });

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

  // Baseline: draw a line and move the mouse around. Any errors here are pre-existing.
  await page.locator('button[data-category="GEOMETRY"]').click();
  await page.waitForTimeout(400);
  await page.locator('#drawingToolList [data-tool-id="line"]').click();
  await page.waitForTimeout(250);
  await page.mouse.move(cx - 150, cy);
  await page.waitForTimeout(200);
  errs.push("--- baseline line preview done ---");
  await page.mouse.click(cx - 150, cy);
  await page.waitForTimeout(200);
  await page.mouse.click(cx + 150, cy);
  await page.waitForTimeout(500);
  errs.push("--- line placed ---");

  // Now the dimension tool: arm, then move WITHOUT placing.
  await page.locator('button[data-category="ANNOTATE"]').click();
  await page.waitForTimeout(400);
  await page.locator('#drawingToolList [data-tool-id="dimension"]').click();
  await page.waitForTimeout(250);
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(400);
  errs.push("--- armed ---");
  await page.mouse.move(cx, cy + 90);
  await page.waitForTimeout(400);
  errs.push("--- moved, not placed ---");

  return { errs };
}
