export default async function run(page) {
  const out = { results: [], errors: [] };
  page.on("pageerror", (e) =>
    out.errors.push(String(e.message || e).slice(0, 160)),
  );

  await page.evaluate(() => {
    const t = [...document.querySelectorAll(".tab")].find((b) =>
      /Engineering Drawing/i.test(b.textContent),
    );
    if (t) t.click();
  });
  await page.waitForTimeout(900);

  const count = () =>
    page.evaluate(
      () => document.querySelector(".drawing-renderer").children.length,
    );

  const box = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return { x: r.left + r.width * 0.3, y: r.top + r.height * 0.55 };
  });

  // parent submenu button id -> submenu item id
  const cases = [
    ["body", "particle"],
    ["body", "rigid-body"],
    ["moment", "couple"],
    ["support", "pin-support"],
    ["support", "roller-support"],
    ["support", "fixed-support"],
    ["support", "smooth-support"],
  ];

  let i = 0;
  for (const [parentId, subId] of cases) {
    await page.evaluate(() => {
      document
        .querySelector('.drawing-category[data-category="STATICS"]')
        .click();
    });
    await page.waitForTimeout(300);
    await page.evaluate((p) => {
      document.querySelector('.drawing-tool[data-tool-id="' + p + '"]').click();
    }, parentId);
    await page.waitForTimeout(350);
    await page.evaluate((s) => {
      document
        .querySelector(
          '.drawing-coordinate-submenu-item[data-submenu-id="' + s + '"]',
        )
        .click();
    }, subId);
    await page.waitForTimeout(450);

    const dx = (i % 4) * 55;
    const before = await count();
    await page.mouse.move(box.x + dx, box.y - i * 12);
    await page.waitForTimeout(250);
    await page.mouse.click(box.x + dx, box.y - i * 12);
    await page.waitForTimeout(800);
    const after = await count();

    out.results.push({ subId, created: after > before, before, after });
    i++;
  }

  return out;
}
