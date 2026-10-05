export default async function run(page) {
  // __P must exist before drawing.js executes, so install it as an init
  // script and reload rather than setting it after navigation.
  await page.addInitScript(() => {
    window.__P = [];
  });
  await page.goto("http://localhost:3000/", { waitUntil: "load" });
  await page.waitForTimeout(1200);

  const out = {};

  await page.evaluate(() => {
    const t = [...document.querySelectorAll(".tab")].find((b) =>
      /Engineering Drawing/i.test(b.textContent),
    );
    if (t) t.click();
  });
  await page.waitForTimeout(900);

  out.atLoad = await page.evaluate(() => window.__P.slice());

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

  const count = () =>
    page.evaluate(
      () => document.querySelector(".drawing-renderer").children.length,
    );

  const box = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return { x: r.left + r.width * 0.3, y: r.top + r.height * 0.5 };
  });

  out.before = await count();
  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(300);
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(900);
  out.after = await count();
  out.probe = await page.evaluate(() => window.__P.slice());

  return out;
}
