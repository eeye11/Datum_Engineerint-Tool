export default async function run(page) {
  const out = { results: [], errors: [] };
  page.on("pageerror", (e) =>
    out.errors.push(String(e.message || e).slice(0, 200)),
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
  const panel = () =>
    page.evaluate(() => {
      const p = document.getElementById("drawingProperties");
      return p ? p.innerText.replace(/\n+/g, " | ").slice(0, 200) : null;
    });

  const box = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return { x: r.left + r.width * 0.35, y: r.top + r.height * 0.5 };
  });

  const test = async (subId, dx) => {
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
    await page.evaluate((id) => {
      document
        .querySelector(
          '.drawing-coordinate-submenu-item[data-submenu-id="' + id + '"]',
        )
        .click();
    }, subId);
    await page.waitForTimeout(500);

    const before = await count();
    await page.mouse.move(box.x + dx, box.y);
    await page.waitForTimeout(300);
    await page.mouse.click(box.x + dx, box.y);
    await page.waitForTimeout(900);
    const after = await count();

    return {
      subId,
      created: after > before,
      before,
      after,
      panel: await panel(),
    };
  };

  out.results.push(await test("particle", 0));
  out.results.push(await test("rigid-body", 70));

  return out;
}
