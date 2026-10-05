export default async function run(page, ui) {
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

  // Draw a beam, then a force on it, then select the beam.
  await page.evaluate(() => {
    document.querySelector(".drawing-coordinate-submenu")?.remove();

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

  const a = at(0.2, 0.5);
  const c = at(0.6, 0.5);
  await page.mouse.click(a.x, a.y);
  await page.waitForTimeout(150);
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    document
      .querySelector('#drawingToolPanel [data-tool-id="select"]')
      ?.click();
  });
  await page.waitForTimeout(200);

  const mid = at(0.4, 0.5);
  await page.mouse.click(mid.x, mid.y);
  await page.waitForTimeout(500);

  return {
    selected: await page.evaluate(() => {
      const b = Array.from(
        document.querySelectorAll(".drawing-properties-block"),
      ).find((n) => {
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.left > 0;
      });

      return b
        ? b.querySelector(".drawing-properties-title")?.textContent.trim()
        : "nothing selected";
    }),
  };
}
