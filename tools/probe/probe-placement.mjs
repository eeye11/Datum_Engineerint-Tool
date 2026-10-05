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
  await page.mouse.click(cx - 150, cy - 100);
  await page.waitForTimeout(200);
  await page.mouse.click(cx + 100, cy - 100);
  await page.waitForTimeout(600);

  await page.locator('button[data-category="ANNOTATE"]').click();
  await page.waitForTimeout(400);
  await page.locator('#drawingToolList [data-tool-id="dimension"]').click();
  await page.waitForTimeout(250);
  await page.mouse.click(cx, cy - 100);
  await page.waitForTimeout(400);

  // Read the placement the tool is actually tracking.
  const readPlacement = () =>
    page
      .evaluate(() => {
        const s = document.createElement("script");
        s.textContent = `
      (function(){
        const p = window.enggDrawing.state.interaction;
        document.documentElement.setAttribute('data-res', JSON.stringify({
          activeTool: window.enggDrawing.state.activeTool,
          placement: p.dimensionPlacement,
          phase: p.phase,
          refs: (p.dimensionRefs||[]).length
        }));
      })();`;
        document.body.appendChild(s);
        return null;
      })
      .then(() => page.getAttribute("html", "data-res"))
      .then(JSON.parse);

  const out = {};
  out.atArm = await readPlacement();
  await page.mouse.move(cx - 60, cy + 60);
  await page.waitForTimeout(300);
  out.atA = await readPlacement();
  await page.mouse.move(cx + 120, cy + 150);
  await page.waitForTimeout(300);
  out.atB = await readPlacement();

  return out;
}
