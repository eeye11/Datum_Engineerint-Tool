export default async function run(page, ui) {
  await page.goto("http://localhost:8099/", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  const tab = page
    .locator("button", { hasText: "Engineering Drawing" })
    .first();
  if (await tab.count()) await tab.click();
  await page.waitForTimeout(1500);

  const msg = () =>
    page.evaluate(
      () => document.getElementById("drawingToolMessage")?.textContent || "",
    );

  await page.locator('button[data-category="GEOMETRY"]').click();
  await page.waitForTimeout(400);
  const b = await page.locator(".drawing-workspace").first().boundingBox();
  const cx = b.x + b.width / 2,
    cy = b.y + b.height / 2;

  await page.locator('#drawingToolList [data-tool-id="line"]').click();
  await page.waitForTimeout(250);
  await page.mouse.click(cx - 150, cy);
  await page.waitForTimeout(200);
  await page.mouse.click(cx + 150, cy);
  await page.waitForTimeout(500);

  await page.locator('button[data-category="ANNOTATE"]').click();
  await page.waitForTimeout(400);
  await page.locator('#drawingToolList [data-tool-id="dimension"]').click();
  await page.waitForTimeout(250);
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(350);
  await page.mouse.click(cx, cy + 90);
  await page.waitForTimeout(700);

  // Ask the models directly what the stored dimension looks like.
  return await page
    .evaluate(() => {
      const s = document.createElement("script");
      s.textContent = `
    (function(){
      const R={};
      // Reach the live state through the renderer's own reference.
      const St=window.enggDrawingState, DM=window.enggDimensionModel;
      R.globals={St:typeof St, DM:typeof DM};
      document.documentElement.setAttribute('data-res', JSON.stringify(R));
    })();`;
      document.body.appendChild(s);
    })
    .then(() => page.getAttribute("html", "data-res"))
    .then(JSON.parse)
    .then((r) => ({
      ...r,
      domDump: null,
    }))
    .catch((e) => ({ err: String(e) }));
}
