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

  const status = () =>
    page.evaluate(() => {
      const el = document.getElementById("drawingToolMessage");
      return el ? el.innerText.trim() : null;
    });

  const box = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return { x: r.left + r.width * 0.3, y: r.top + r.height * 0.35 };
  });

  // Fresh session, EMPTY sheet: Applied Moment should take the
  // free-moment path and need no body at all.
  await page.evaluate(() => {
    document
      .querySelector('.drawing-category[data-category="STATICS"]')
      .click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.querySelector('.drawing-tool[data-tool-id="moment"]').click();
  });
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    document
      .querySelector(
        '.drawing-coordinate-submenu-item[data-submenu-id="applied-moment"]',
      )
      .click();
  });
  await page.waitForTimeout(450);

  out.steps.push({ step: "armed", status: await status() });

  const m0 = await count();

  // Stage 1: fix the application point, in EMPTY space.
  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(300);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(700);

  out.steps.push({
    step: "afterStage1",
    count: await count(),
    status: await status(),
  });

  // Stage 2: size and commit.
  await page.mouse.move(box.x + 45, box.y - 40);
  await page.waitForTimeout(400);
  out.steps.push({ step: "afterMove", status: await status() });
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(900);

  const m1 = await count();

  out.steps.push({
    step: "afterStage2",
    before: m0,
    after: m1,
    created: m1 > m0,
    panel: await page.evaluate(() => {
      const p = document.getElementById("drawingProperties");
      return p ? p.innerText.replace(/\n+/g, " | ").slice(0, 200) : null;
    }),
  });

  return out;
}
