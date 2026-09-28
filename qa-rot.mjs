export default async function run(page) {
  const out = { steps: [] };
  const log = (s, v) => out.steps.push({ step: s, value: v });
  const safe = async (n, f) => {
    try {
      log(n, await f());
    } catch (e) {
      log(n, { error: String(e).slice(0, 150) });
    }
  };
  const status = () =>
    page.evaluate(() =>
      document.querySelector("#drawingToolMessage").textContent.trim(),
    );

  const tab = page.getByRole("button", { name: "Engineering Drawing" });
  if (await tab.count()) {
    await tab.first().click();
    await page.waitForTimeout(400);
  }
  const box = await page.locator(".drawing-canvas").first().boundingBox();
  if (!box) return { error: "no canvas", ...out };
  const at = (fx, fy) => ({
    x: box.x + box.width * fx,
    y: box.y + box.height * fy,
  });
  const click = async (fx, fy) => {
    const p = at(fx, fy);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(250);
  };
  const drag = async (f1, f2) => {
    const a = at(...f1),
      b = at(...f2);
    await page.mouse.move(a.x, a.y);
    await page.waitForTimeout(80);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.move(b.x, b.y, { steps: 12 });
    await page.waitForTimeout(120);
    await page.mouse.up();
    await page.waitForTimeout(350);
  };
  // Read the SVG corner/handle circles of a feature, to prove they stay on the shape.
  const featureCircles = () =>
    page.evaluate(() => {
      const g = document.querySelector("g.drawing-feature[data-feature-id]");
      return {
        id: g?.dataset.featureId,
        circles: g?.querySelectorAll("circle").length,
      };
    });

  // Rectangle: drag a corner, then rotate, and confirm it stays a rectangle.
  await page.locator('.drawing-category[data-category="GEOMETRY"]').click();
  await page.waitForTimeout(250);
  await page.locator('.drawing-tool[data-tool-id="rectangle"]').click();
  await page.waitForTimeout(250);
  await click(0.35, 0.4);
  await click(0.5, 0.55);

  // Select it, then read the panel, then rotate via the rotation handle.
  await click(0.42, 0.47);
  await safe("rect selected", () =>
    page.evaluate(() =>
      document.querySelector("#drawingProperties").innerText.slice(0, 180),
    ),
  );

  // Grab the rotation handle: it sits above the shape.
  const handleInfo = await page.evaluate(() => {
    const handles = document.querySelectorAll(
      ".drawing-manipulation-handle, circle.handle",
    );
    return { count: handles.length };
  });
  await safe("handles present", handleInfo);

  return out;
}
