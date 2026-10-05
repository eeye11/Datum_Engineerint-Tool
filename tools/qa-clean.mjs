export default async function run(page) {
  const out = { steps: [] };

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

  const tryTool = async (label, dx, dy) => {
    await page.evaluate(() => {
      [...document.querySelectorAll(".drawing-category")]
        .find((b) => /STATICS/i.test(b.textContent))
        .click();
    });
    await page.waitForTimeout(350);
    await page.locator('.drawing-tool[data-tool-id="body"]').click();
    await page.waitForTimeout(350);
    await page.evaluate(function (l) {
      const el = [
        ...document.querySelectorAll(".drawing-coordinate-submenu-item"),
      ].find((b) => b.textContent.trim() === l);
      if (el) el.click();
    }, label);
    await page.waitForTimeout(550);

    const before = await count();
    await page.mouse.move(box.x + dx, box.y + dy);
    await page.waitForTimeout(250);
    await page.mouse.click(box.x + dx, box.y + dy);
    await page.waitForTimeout(800);
    const after = await count();
    return { label, before, after, created: after > before };
  };

  // Each on its own coordinates so they cannot interfere.
  out.steps.push(await tryTool("Particle", 0, 0));
  out.steps.push(await tryTool("Rigid Body", 60, 0));
  out.steps.push(await tryTool("Beam", 120, 0));

  return out;
}
