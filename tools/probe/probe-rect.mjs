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

  const state = () =>
    page
      .evaluate(() => {
        const s = document.createElement("script");
        s.textContent = `
      (function(){
        const st = window.enggDrawing.state;
        document.documentElement.setAttribute('data-res', JSON.stringify({
          tool: st.activeTool,
          objects: st.objects.map(o => o.type),
          phase: st.interaction.phase,
          hasRefs: (st.interaction.dimensionRefs||[]).length
        }));
      })();`;
        document.body.appendChild(s);
        return null;
      })
      .then(() => page.getAttribute("html", "data-res"))
      .then(JSON.parse);

  const out = {};
  await page.locator('button[data-category="GEOMETRY"]').click();
  await page.waitForTimeout(400);
  await page.locator('#drawingToolList [data-tool-id="rectangle"]').click();
  await page.waitForTimeout(250);
  out.toolChosen = await state();
  await page.mouse.click(cx - 160, cy - 160);
  await page.waitForTimeout(250);
  await page.mouse.click(cx + 40, cy - 20);
  await page.waitForTimeout(700);
  out.afterRect = await state();

  await page.locator('button[data-category="ANNOTATE"]').click();
  await page.waitForTimeout(400);
  const dimBtn = await page
    .locator('#drawingToolList [data-tool-id="dimension"]')
    .count();
  out.dimBtnCount = dimBtn;
  await page.locator('#drawingToolList [data-tool-id="dimension"]').click();
  await page.waitForTimeout(300);
  out.afterDimActivate = await state();

  await page.mouse.click(cx - 60, cy - 90);
  await page.waitForTimeout(600);
  out.afterClickOnRect = await state();

  return out;
}
