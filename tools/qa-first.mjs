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

  const box = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return {
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
    };
  });

  // Activate Particle FIRST, before touching any category button.
  await page.locator('.drawing-tool[data-tool-id="body"]').click();
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const el = [
      ...document.querySelectorAll(".drawing-coordinate-submenu-item"),
    ].find((b) => b.textContent.trim() === "Particle");
    if (el) el.click();
  });
  await page.waitForTimeout(600);

  const before = await count();
  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(250);
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(800);
  const after = await count();

  out.noCategorySwitch = { before, after, created: after > before };

  // Control: geometry Point, in the same session, to prove the harness works.
  await page.evaluate(() => {
    [...document.querySelectorAll(".drawing-category")]
      .find((b) => /GEOMETRY/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(400);
  await page.locator('.drawing-tool[data-tool-id="point"]').click();
  await page.waitForTimeout(400);
  const pBefore = await count();
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.waitForTimeout(200);
  await page.mouse.click(box.x + 40, box.y + 40);
  await page.waitForTimeout(700);
  const pAfter = await count();

  out.controlPoint = {
    before: pBefore,
    after: pAfter,
    created: pAfter > pBefore,
  };

  return out;
}
