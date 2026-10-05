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
  await page.locator('#drawingToolList [data-tool-id="line"]').click();
  await page.waitForTimeout(250);
  await page.mouse.click(cx - 150, cy - 60);
  await page.waitForTimeout(200);
  await page.mouse.click(cx + 100, cy - 60);
  await page.waitForTimeout(700);

  await page.locator('button[data-category="ANNOTATE"]').click();
  await page.waitForTimeout(400);
  await page.locator('#drawingToolList [data-tool-id="dimension"]').click();
  await page.waitForTimeout(250);
  await page.mouse.click(cx, cy - 60);
  await page.waitForTimeout(400);
  await page.mouse.click(cx, cy - 140);
  await page.waitForTimeout(700);

  // Zoom to 200% through the app's own camera.
  await page.evaluate(() => {
    const s = document.createElement("script");
    s.textContent =
      "window.enggDrawingState.setCameraZoom(window.enggDrawing.state, 2);";
    document.body.appendChild(s);
  });
  await page.waitForTimeout(700);

  await page.screenshot({
    path: "zoom-200.png",
    clip: {
      x: b.x,
      y: b.y,
      width: Math.min(b.width, 860),
      height: Math.min(b.height, 460),
    },
  });

  const drawn = await page.evaluate(() =>
    [...document.querySelectorAll("svg .drawing-feature text")]
      .map((t) => t.textContent.trim())
      .filter(Boolean),
  );
  const zoom = await page.evaluate(() => {
    const s = document.createElement("script");
    s.textContent =
      "document.documentElement.setAttribute('data-z'," +
      " String(window.enggDrawing.state.camera.zoom));";
    document.body.appendChild(s);
    return null;
  });
  void zoom;
  const z = await page.getAttribute("html", "data-z");
  return { zoom: z, drawn };
}
