export default async function run(page) {
  const out = { results: [], errors: [] };
  page.on("pageerror", (e) =>
    out.errors.push(String(e.message || e).slice(0, 160)),
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

  const panel = () =>
    page.evaluate(() => {
      const p = document.getElementById("drawingProperties");
      return p ? p.innerText.replace(/\n+/g, " | ").slice(0, 200) : null;
    });

  const box = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return { x: r.left + r.width * 0.25, y: r.top + r.height * 0.45 };
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

  // --- Create a Beam first, so the body-attached tools have a parent.
  await pick("body", "beam");
  const b0 = await count();
  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(200);
  await page.mouse.click(box.x, box.y); // first end
  await page.waitForTimeout(400);
  await page.mouse.move(box.x + 220, box.y);
  await page.waitForTimeout(200);
  await page.mouse.click(box.x + 220, box.y); // second end
  await page.waitForTimeout(800);
  const b1 = await count();
  out.results.push({ step: "beam", created: b1 > b0, before: b0, after: b1 });

  // --- Couple, onto the beam
  await pick("moment", "couple");
  const c0 = await count();
  await page.mouse.move(box.x + 110, box.y);
  await page.waitForTimeout(250);
  await page.mouse.click(box.x + 110, box.y);
  await page.waitForTimeout(900);
  const c1 = await count();
  out.results.push({
    step: "couple",
    created: c1 > c0,
    before: c0,
    after: c1,
    panel: await panel(),
  });

  // --- Applied Moment, onto the beam
  await pick("moment", "applied-moment");
  const m0 = await count();
  await page.mouse.move(box.x + 60, box.y);
  await page.waitForTimeout(250);
  await page.mouse.click(box.x + 60, box.y);
  await page.waitForTimeout(900);
  const m1 = await count();
  out.results.push({
    step: "applied-moment",
    created: m1 > m0,
    before: m0,
    after: m1,
    panel: await panel(),
  });

  return out;
}
