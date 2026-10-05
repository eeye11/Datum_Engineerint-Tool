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

  await page.evaluate(() => {
    const s = document.createElement("script");
    s.textContent = "window.__dimensionDebug = [];";
    document.body.appendChild(s);
  });

  await page.locator('button[data-category="GEOMETRY"]').click();
  await page.waitForTimeout(400);
  await page.locator('#drawingToolList [data-tool-id="rectangle"]').click();
  await page.waitForTimeout(250);
  await page.mouse.click(cx - 160, cy - 160);
  await page.waitForTimeout(250);
  await page.mouse.click(cx + 40, cy - 20);
  await page.waitForTimeout(700);

  await page.locator('button[data-category="ANNOTATE"]').click();
  await page.waitForTimeout(400);
  await page.locator('#drawingToolList [data-tool-id="dimension"]').click();
  await page.waitForTimeout(300);

  await page.mouse.click(cx - 60, cy - 90);
  await page.waitForTimeout(600);

  return await page
    .evaluate(() => {
      const s = document.createElement("script");
      s.textContent = `
      document.documentElement.setAttribute('data-res', JSON.stringify(window.__dimensionDebug));
    `;
      document.body.appendChild(s);
      return null;
    })
    .then(() => page.getAttribute("html", "data-res"))
    .then(JSON.parse);
}
