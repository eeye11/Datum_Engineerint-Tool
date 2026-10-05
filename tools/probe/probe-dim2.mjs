export default async function run(page, ui) {
  await page.goto("http://localhost:8099/", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  const tab = page
    .locator("button", { hasText: "Engineering Drawing" })
    .first();
  if (await tab.count()) await tab.click();
  await page.waitForTimeout(1500);

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

  await page.evaluate(() => {
    const s = document.createElement("script");
    s.textContent = `
    (function(){
      const state = window.enggDrawing.state, DM = window.enggDimensionModel;
      const dim = state.objects.find(o => o.type === 'dimension');
      const R = {
        dimKeys: dim ? Object.keys(dim).sort() : null,
        dimensionType: dim ? dim.dimensionType : null,
        sourceRefs: dim ? dim.sourceRefs : null,
        placement: dim ? dim.placement : null,
        measured: null, formatted: null, points: null, graphics: null,
        lineIds: state.objects.filter(o=>o.type==='line').map(o=>o.id)
      };
      if (dim) {
        try { R.measured = DM.measurementFor(dim, state); } catch(e){ R.measured='ERR '+e.message; }
        try { R.formatted = DM.formatMeasurement(dim, state); } catch(e){ R.formatted='ERR '+e.message; }
        try { R.points = DM.measurePoints(dim, state); } catch(e){ R.points='ERR '+e.message; }
        try { R.graphics = DM.graphicsFor(dim, state); } catch(e){ R.graphics='ERR '+e.message; }
      }
      document.documentElement.setAttribute('data-res', JSON.stringify(R));
    })();`;
    document.body.appendChild(s);
  });
  await page.waitForTimeout(300);
  return JSON.parse(await page.getAttribute("html", "data-res"));
}
