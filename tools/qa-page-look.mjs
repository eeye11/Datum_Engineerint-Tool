export default async function run(page) {
  await page.evaluate(() => {
    Array.from(document.querySelectorAll(".tab"))
      .find((b) => b.textContent.trim() === "Engineering Drawing")
      ?.click();
  });

  await page.waitForFunction(
    () => {
      const v = document.querySelector("#drawing");
      return v && getComputedStyle(v).display !== "none";
    },
    { timeout: 15000 },
  );

  await page.waitForTimeout(800);

  await page.evaluate(() => {
    document
      .querySelector('.drawing-toolbar [data-category="STATICS"]')
      ?.click();
  });

  await page.waitForTimeout(700);

  const box = await page.locator(".drawing-canvas").first().boundingBox();

  const at = (fx, fy) => ({
    x: box.x + box.width * fx,
    y: box.y + box.height * fy,
  });

  /* A beam, so the drawing has something in it to judge the scale by. */
  await page.evaluate(() => {
    const group = Array.from(
      document.querySelectorAll("#drawingToolPanel button[data-tool-id]"),
    ).find(
      (n) =>
        n.querySelector(".drawing-tool-caret") &&
        n
          .querySelector(".drawing-tool-label")
          ?.textContent?.replace(/[\u25BE\u25B4]/g, "")
          ?.trim()
          ?.startsWith("Bodies"),
    );

    group?.click();

    Array.from(document.querySelectorAll(".drawing-coordinate-submenu button"))
      .find((b) => b.textContent.trim() === "Beam")
      ?.click();
  });

  await page.waitForTimeout(250);

  const a = at(0.2, 0.45);
  const b = at(0.7, 0.45);
  await page.mouse.click(a.x, a.y);
  await page.waitForTimeout(150);
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    document
      .querySelector('#drawingToolPanel [data-tool-id="select"]')
      ?.click();
  });
  await page.waitForTimeout(200);

  const p = at(0.45, 0.45);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    document.querySelector(".drawing-component-row")?.click();
  });
  await page.waitForTimeout(500);

  return page.evaluate(() => ({
    toolPanelWidth: Math.round(
      document.querySelector(".drawing-tool-panel").getBoundingClientRect()
        .width,
    ),
    inspectorWidth: Math.round(
      document.querySelector(".drawing-inspector").getBoundingClientRect()
        .width,
    ),
  }));
}
