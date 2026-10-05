export default async function run(page) {
  const out = {};

  await page.evaluate(() => {
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    [...document.querySelectorAll(".drawing-category")]
      .find((b) => /STATICS/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(400);
  await page.locator('.drawing-tool[data-tool-id="body"]').click();
  await page.waitForTimeout(400);

  // Read the tool id from the submenu item before clicking it.
  out.submenuId = await page.evaluate(() => {
    var el = [
      ...document.querySelectorAll(".drawing-coordinate-submenu-item"),
    ].find((b) => /Particle/i.test(b.textContent));
    return el ? el.dataset.submenuId : null;
  });

  await page
    .locator(".drawing-coordinate-submenu-item", { hasText: "Particle" })
    .first()
    .click();
  await page.waitForTimeout(600);

  // The toolbar is the observable source of truth for the active tool.
  out.toolButtons = await page.evaluate(() =>
    [...document.querySelectorAll(".drawing-tool")]
      .map((b) => ({
        id: b.dataset.toolId,
        pressed: b.getAttribute("aria-pressed"),
      }))
      .filter((t) => t.pressed === "true"),
  );

  out.status = await page.evaluate(() => {
    var el = [...document.querySelectorAll("#drawing *")].filter(
      (e) => e.children.length === 0 && /Specify|Select/i.test(e.textContent),
    )[0];
    return el ? el.textContent.trim().slice(0, 90) : null;
  });

  // Now try placing with a click and watch the DOM grow.
  var box = await page.evaluate(() => {
    var r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return {
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
    };
  });
  var before = await page.evaluate(
    () => document.querySelector(".drawing-renderer").children.length,
  );

  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(400);
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(900);

  var after = await page.evaluate(
    () => document.querySelector(".drawing-renderer").children.length,
  );

  out.svg = { before, after };
  out.features = await page.evaluate(() => {
    var p = document.querySelector(".drawing-properties");
    return p ? p.textContent.replace(/\s+/g, " ").trim().slice(0, 160) : null;
  });

  return out;
}
