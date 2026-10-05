export default async function run(page) {
  const out = { errors: [] };
  page.on("pageerror", (e) =>
    out.errors.push(String(e.message || e).slice(0, 200)),
  );

  await page.evaluate(() => {
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(900);

  const box = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return { x: r.left + r.width * 0.3, y: r.top + r.height * 0.35 };
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

  const stageTwo = async (dx, dy) => {
    await page.mouse.move(box.x + dx, box.y + dy);
    await page.waitForTimeout(300);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.up();
    await page.waitForTimeout(800);
  };

  // Applied Moment: click fixes point, second click sizes and commits.
  await pick("moment", "applied-moment");
  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(250);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(500);
  await stageTwo(50, -45);

  // Couple: single click.
  await pick("moment", "couple");
  await page.mouse.move(box.x + 40, box.y + 70);
  await page.waitForTimeout(250);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(900);

  // Report every rendered rotational-arrow path and its group identity.
  out.arrows = await page.evaluate(() => {
    const svg = document.querySelector(".drawing-renderer");
    return [...svg.querySelectorAll("path")]
      .map((p) => p.getAttribute("d"))
      .filter((d) => d && /\bA\b/.test(d))
      .slice(0, 6);
  });

  out.tree = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#drawingProperties *")]
      .filter((e) => e.children.length === 0 && e.textContent.trim())
      .map((e) => e.textContent.trim())
      .filter((t) => /Moment|Couple/i.test(t));
    return [...new Set(rows)].slice(0, 8);
  });

  return out;
}
