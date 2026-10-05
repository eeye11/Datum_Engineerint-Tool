export default async function run(page) {
  const out = {};

  await page.evaluate(() => {
    const t = [...document.querySelectorAll(".tab")].find((b) =>
      /Engineering Drawing/i.test(b.textContent),
    );
    if (t) t.click();
  });
  await page.waitForTimeout(900);

  await page.evaluate(() => {
    document
      .querySelector('.drawing-category[data-category="STATICS"]')
      .click();
  });
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    document.querySelector('.drawing-tool[data-tool-id="body"]').click();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    document
      .querySelector(
        '.drawing-coordinate-submenu-item[data-submenu-id="particle"]',
      )
      .click();
  });
  await page.waitForTimeout(500);

  const probe = () =>
    page.evaluate(() => {
      const c = document.querySelector(".drawing-canvas");
      return JSON.parse(c.dataset.probe || "[]");
    });

  const count = () =>
    page.evaluate(
      () => document.querySelector(".drawing-renderer").children.length,
    );

  const box = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return { x: r.left + r.width * 0.3, y: r.top + r.height * 0.5 };
  });

  out.probeBefore = await probe();
  out.countBefore = await count();

  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(300);
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(900);

  out.probeAfter = await probe();
  out.countAfter = await count();

  return out;
}
