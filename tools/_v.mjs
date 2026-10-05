export default async function run(page) {
  const out = { errors: [] };
  page.on("pageerror", (e) =>
    out.errors.push(String(e.message || e).slice(0, 200)),
  );

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(900);

  const box = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return { x: r.left + r.width * 0.2, y: r.top + r.height * 0.5 };
  });

  const click = async (x, y) => {
    await page.mouse.move(x, y);
    await page.waitForTimeout(250);
    await page.mouse.down();
    await page.waitForTimeout(70);
    await page.mouse.up();
    await page.waitForTimeout(800);
  };

  await page.evaluate(() => {
    document
      .querySelector('.drawing-category[data-category="STATICS"]')
      .click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.querySelector('.drawing-tool[data-tool-id="body"]').click();
  });
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    document
      .querySelector('.drawing-coordinate-submenu-item[data-submenu-id="beam"]')
      .click();
  });
  await page.waitForTimeout(450);

  // Diagonal beam.
  await click(box.x, box.y);
  await click(box.x + 200, box.y + 120);
  await page.waitForTimeout(600);

  for (const [tool, label] of [
    ["shear-force-diagram", "SFD"],
    ["bending-moment-diagram", "BMD"],
  ]) {
    await page.evaluate(() => {
      document
        .querySelector('.drawing-category[data-category="STATICS"]')
        .click();
    });
    await page.waitForTimeout(300);
    await page.evaluate((t) => {
      document.querySelector(`.drawing-tool[data-tool-id="${t}"]`).click();
    }, tool);
    await page.waitForTimeout(700);
    await click(box.x + 100, box.y + 60);
    await page.waitForTimeout(800);
  }

  out.rows = await page.evaluate(() =>
    [...document.querySelectorAll(".drawing-component-row")].map((r) =>
      r.textContent.replace(/\s+/g, " ").trim(),
    ),
  );

  out.groups = await page.evaluate(() =>
    [...document.querySelectorAll(".drawing-renderer g")]
      .map(
        (g) =>
          `${(g.dataset && g.dataset.featureId) || "?"}(${g.children.length})`,
      )
      .filter((s) => !s.startsWith("beam")),
  );

  return out;
}
