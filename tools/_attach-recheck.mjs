export default async function run(page) {
  const out = { steps: [], errors: [] };
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

  const pick = async (parentId, subId) => {
    await page.evaluate(() => {
      document
        .querySelector('.drawing-category[data-category="STATICS"]')
        .click();
    });
    await page.waitForTimeout(300);
    await page.evaluate((p) => {
      document.querySelector(`.drawing-tool[data-tool-id="${p}"]`).click();
    }, parentId);
    await page.waitForTimeout(400);
    await page.evaluate((s) => {
      document
        .querySelector(
          `.drawing-coordinate-submenu-item[data-submenu-id="${s}"]`,
        )
        ?.click();
    }, subId);
    await page.waitForTimeout(450);
  };

  // A beam from world 0 to 400.
  await pick("body", "beam");
  await click(box.x, box.y);
  await click(box.x + 300, box.y);

  out.afterBeam = await page.evaluate(() =>
    [...document.querySelectorAll(".drawing-component-row")].map((r) =>
      r.textContent.replace(/\s+/g, " ").trim(),
    ),
  );

  // A Pin Support at roughly 1/3 along: body, then the place on it.
  await pick("support", "pin-support");
  await click(box.x + 100, box.y);
  out.afterBodyClick = await page.evaluate(() => {
    const el = document.getElementById("drawingToolMessage");
    return el ? el.innerText.trim().slice(0, 70) : null;
  });

  await click(box.x + 100, box.y + 60);
  await page.waitForTimeout(600);

  out.afterSupport = await page.evaluate(() =>
    [...document.querySelectorAll(".drawing-component-row")].map((r) => ({
      text: r.textContent.replace(/\s+/g, " ").trim(),
      id: r.dataset.objectId || null,
    })),
  );

  return out;
}
