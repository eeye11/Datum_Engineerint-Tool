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

  const drawLine = async (x1, y1, x2, y2) => {
    await page.locator('#drawingToolList [data-tool-id="line"]').click();
    await page.waitForTimeout(250);
    await page.mouse.click(cx + x1, cy + y1);
    await page.waitForTimeout(250);
    await page.mouse.click(cx + x2, cy + y2);
    await page.waitForTimeout(700);
  };

  await drawLine(-220, -120, 0, 0);
  await drawLine(-220, 120, 0, 0);

  await page.screenshot({
    path: "pair-state.png",
    clip: {
      x: b.x,
      y: b.y,
      width: Math.min(b.width, 860),
      height: Math.min(b.height, 460),
    },
  });

  return await page
    .evaluate(() => {
      const s = document.createElement("script");
      s.textContent = `
      (function(){
        const st = window.enggDrawing.state;
        document.documentElement.setAttribute('data-res', JSON.stringify({
          tool: st.activeTool,
          objects: st.objects.map(o => ({ type: o.type, geom: o.geometry })),
          selection: st.selection.selectedObjectIds
        }));
      })();`;
      document.body.appendChild(s);
      return null;
    })
    .then(() => page.getAttribute("html", "data-res"))
    .then((v) => JSON.parse(v || "null"));
}
