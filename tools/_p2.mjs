export default async function run(page) {
  const out = { probe: [], errors: [] };
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
    await page.waitForTimeout(220);
    await page.mouse.down();
    await page.waitForTimeout(70);
    await page.mouse.up();
    await page.waitForTimeout(800);
  };

  const press = async (toolId) => {
    await page.evaluate(() => {
      document
        .querySelector('.drawing-category[data-category="STATICS"]')
        .click();
    });
    await page.waitForTimeout(300);
    await page.evaluate((id) => {
      document.querySelector(`.drawing-tool[data-tool-id="${id}"]`).click();
    }, toolId);
    await page.waitForTimeout(600);
  };

  // DIAGONAL beam - the case whose frame was missing.
  await press("body");
  await page.evaluate(() => {
    document
      .querySelector('.drawing-coordinate-submenu-item[data-submenu-id="beam"]')
      .click();
  });
  await page.waitForTimeout(450);
  await click(box.x, box.y);
  await click(box.x + 200, box.y + 120);
  await page.waitForTimeout(600);

  await press("shear-force-diagram");
  await click(box.x + 100, box.y + 60);
  await page.waitForTimeout(1000);

  out.probe = await page.evaluate(() => {
    const c = document.querySelector(".drawing-canvas");
    return JSON.parse(c.dataset.probe || "[]").slice(-2);
  });

  out.beamGeom = await page.evaluate(() => {
    const g = [...document.querySelectorAll(".drawing-renderer g")].map(
      (el) => el.dataset.featureId,
    );
    return g;
  });

  return out;
}
