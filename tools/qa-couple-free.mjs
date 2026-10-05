export default async function run(page) {
  const out = { steps: [], errors: [] };
  page.on("pageerror", (e) =>
    out.errors.push(String(e.message || e).slice(0, 200)),
  );

  await page.evaluate(() => {
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(900);

  const count = () =>
    page.evaluate(
      () => document.querySelector(".drawing-renderer").children.length,
    );

  const box = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return { x: r.left + r.width * 0.3, y: r.top + r.height * 0.4 };
  });

  const pick = async (parentId, subId) => {
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
  };

  const click = async (dx, dy) => {
    await page.mouse.move(box.x + dx, box.y + dy);
    await page.waitForTimeout(250);
    await page.mouse.down();
    await page.waitForTimeout(70);
    await page.mouse.up();
    await page.waitForTimeout(800);
  };

  // Couple on a BLANK sheet must now place itself.
  await pick("moment", "couple");
  const c0 = await count();
  await click(0, 0);
  const c1 = await count();
  out.steps.push({
    step: "couple on blank sheet",
    before: c0,
    after: c1,
    created: c1 > c0,
  });

  // Applied Moment on a blank sheet still works.
  await pick("moment", "applied-moment");
  const m0 = await count();
  await page.mouse.move(box.x + 120, box.y + 60);
  await page.waitForTimeout(250);
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
  await page.waitForTimeout(500);
  await click(165, 15);
  const m1 = await count();
  out.steps.push({
    step: "applied moment on blank sheet",
    before: m0,
    after: m1,
    created: m1 > m0,
  });

  // Both should be drawn as valid rotational arcs.
  out.arcPaths = await page.evaluate(() =>
    [...document.querySelectorAll(".drawing-renderer path")]
      .map((p) => p.getAttribute("d"))
      .filter((d) => d && /\bA\b/.test(d)),
  );

  out.panel = await page.evaluate(() => {
    const p = document.getElementById("drawingProperties");
    return p ? p.innerText.replace(/\n+/g, " | ").slice(0, 160) : null;
  });

  return out;
}
