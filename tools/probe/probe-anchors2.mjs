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

  await page.locator('button[data-category="GEOMETRY"]').click();
  await page.waitForTimeout(400);
  await page.locator('#drawingToolList [data-tool-id="rectangle"]').click();
  await page.waitForTimeout(250);
  await page.mouse.click(cx - 160, cy - 160);
  await page.waitForTimeout(250);
  await page.mouse.click(cx + 40, cy - 20);
  await page.waitForTimeout(800);

  await page.evaluate(() => {
    const s = document.createElement("script");
    s.textContent = `
    (function(){
      const st = window.enggDrawing.state, M = window.enggMeasurement, S = window.enggSmartDimension;
      const rect = st.objects.find(o => o.type === 'rectangle');
      const R = { geometry: rect && rect.geometry };
      if (rect) {
        R.anchorNames = M.anchorNames ? M.anchorNames(rect) : 'n/a';
        R.anchors = M.anchorOptions(rect);
        R.candidates = S.candidatesFor(rect);
        R.descH = S.descriptorFor(rect, 'horizontal', st);
        R.selection = st.selection.selectedObjectIds;
      }
      document.documentElement.setAttribute('data-res', JSON.stringify(R));
    })();`;
    document.body.appendChild(s);
  });
  await page.waitForTimeout(400);
  return { attr: await page.getAttribute("html", "data-res") };
}
