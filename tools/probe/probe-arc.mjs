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

  await page.locator('#drawingToolList [data-tool-id="line"]').click();
  await page.waitForTimeout(300);
  const stroke = async (x1, y1, x2, y2) => {
    await page.mouse.click(cx + x1, cy + y1);
    await page.waitForTimeout(300);
    await page.mouse.click(cx + x2, cy + y2);
    await page.waitForTimeout(600);
  };
  await stroke(-220, -120, 0, 0);
  await stroke(-220, 120, 0, 0);

  await page.locator('#drawingToolList [data-tool-id="select"]').click();
  await page.waitForTimeout(300);
  await page.mouse.move(cx - 300, cy - 190);
  await page.mouse.down();
  await page.mouse.move(cx + 40, cy + 190, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(600);

  await page.locator('button[data-category="ANNOTATE"]').click();
  await page.waitForTimeout(400);
  await page
    .locator('#drawingToolList [data-tool-id="smart-dimension"]')
    .click();
  await page.waitForTimeout(300);
  await page.mouse.click(cx + 60, cy - 30);
  await page.waitForTimeout(600);
  await page.mouse.move(cx - 60, cy - 190);
  await page.waitForTimeout(300);
  await page.mouse.click(cx - 60, cy - 190);
  await page.waitForTimeout(800);

  return await page
    .evaluate(() => {
      const s = document.createElement("script");
      s.textContent = `
    (function(){
      const st = window.enggDrawing.state, DM = window.enggDimensionModel;
      const d = st.objects.find(o => o.type === 'dimension');
      const g = DM.graphicsFor(d, st);
      const arc = g.arc || [];
      const v = g.vertex;
      const ang = (p) => Math.atan2(p.y - v.y, p.x - v.x) * 180 / Math.PI;
      let sweep = 0;
      for (let i = 1; i < arc.length; i++) {
        let d2 = ang(arc[i]) - ang(arc[i-1]);
        while (d2 > 180) d2 -= 360;
        while (d2 < -180) d2 += 360;
        sweep += d2;
      }
      const radius = Math.hypot(arc[0].x - v.x, arc[0].y - v.y);
      document.documentElement.setAttribute('data-res', JSON.stringify({
        text: g.text,
        vertex: v,
        arcPoints: arc.length,
        radius: Math.round(radius * 100) / 100,
        sweptDegrees: Math.round(Math.abs(sweep) * 100) / 100,
        extensions: (g.extensions || []).length
      }));
    })();`;
      document.body.appendChild(s);
      return null;
    })
    .then(() => page.getAttribute("html", "data-res"))
    .then((v) => JSON.parse(v || "null"));
}
