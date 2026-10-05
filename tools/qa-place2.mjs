export default async function run(page) {
  const out = {};
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.stack || e).slice(0, 600)));

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
  await page
    .locator(".drawing-coordinate-submenu-item", { hasText: "Particle" })
    .first()
    .click();
  await page.waitForTimeout(500);

  out.statusMsg = await page.evaluate(() => {
    var el = [...document.querySelectorAll("#drawing *")].filter(
      (e) => e.children.length === 0 && /Specify/i.test(e.textContent),
    )[0];
    return el ? el.textContent.trim().slice(0, 80) : null;
  });

  out.canvas = await page.evaluate(() => {
    var c = document.querySelector(".drawing-canvas");
    if (!c) return null;
    var r = c.getBoundingClientRect();
    return {
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
      w: Math.round(r.width),
      h: Math.round(r.height),
      svgs: c.querySelectorAll("svg").length,
    };
  });

  if (out.canvas) {
    await page.mouse.move(out.canvas.x, out.canvas.y);
    await page.waitForTimeout(300);
    out.preview = await page.evaluate(() => {
      var c = document.querySelector(".drawing-canvas");
      return { nodes: c.querySelectorAll("*").length };
    });
    await page.mouse.click(out.canvas.x, out.canvas.y);
    await page.waitForTimeout(800);
  }

  out.afterClick = await page.evaluate(() => {
    var c = document.querySelector(".drawing-canvas");
    return { nodes: c ? c.querySelectorAll("*").length : 0 };
  });

  out.propsPanel = await page.evaluate(() => {
    var p = document.querySelector(
      ".drawing-properties, .drawing-inspector, [class*=properties]",
    );
    return p ? p.textContent.replace(/\s+/g, " ").trim().slice(0, 200) : null;
  });

  out.errs = errs;
  return out;
}
