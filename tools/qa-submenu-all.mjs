export default async function run(page) {
  const out = { results: [] };

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

  const labels = ["Particle", "Rigid Body", "Beam", "Reference Point"];

  for (const label of labels) {
    await page.evaluate(() => {
      [...document.querySelectorAll(".drawing-category")]
        .find((b) => /STATICS/i.test(b.textContent))
        .click();
    });
    await page.waitForTimeout(300);

    if (label === "Reference Point") {
      await page.evaluate(() => {
        const b = document.querySelector(
          '.drawing-tool[data-tool-id="reference-point"]',
        );
        if (b) b.click();
      });
    } else {
      await page.locator('.drawing-tool[data-tool-id="body"]').click();
      await page.waitForTimeout(300);
      await page.evaluate(function (lbl) {
        const el = [
          ...document.querySelectorAll(".drawing-coordinate-submenu-item"),
        ].find((b) => b.textContent.trim() === lbl);
        if (el) el.click();
      }, label);
    }
    await page.waitForTimeout(500);

    const before = await count();
    await page.mouse.move(box.x, box.y);
    await page.waitForTimeout(200);
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(700);
    const after = await count();

    out.results.push({ label, before, after, created: after > before });
  }

  return out;
}
