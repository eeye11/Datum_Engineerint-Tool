export default async function run(page) {
  const out = {};

  await page.evaluate(() => {
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(700);

  const count = () =>
    page.evaluate(
      () => document.querySelector(".drawing-renderer").children.length,
    );

  // --- Baseline: the plain GEOMETRY "Point" tool, which shares the
  // same single-click placement path as Particle.
  await page.evaluate(() => {
    [...document.querySelectorAll(".drawing-category")]
      .find((b) => /GEOMETRY/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(400);
  await page.locator('.drawing-tool[data-tool-id="point"]').click();
  await page.waitForTimeout(400);

  var box = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return {
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
    };
  });

  out.pointBefore = await count();
  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(200);
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(700);
  out.pointAfter = await count();

  return out;
}
