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
  await page
    .locator(".drawing-coordinate-submenu-item", { hasText: "Particle" })
    .first()
    .click();
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    window.__log = [];
    var c = document.querySelector(".drawing-canvas");
    c.addEventListener(
      "click",
      function (e) {
        window.__log.push({
          target:
            e.target.tagName + "." + (e.target.getAttribute("class") || ""),
          x: Math.round(e.clientX),
          y: Math.round(e.clientY),
        });
      },
      true,
    );
  });

  var box = await page.evaluate(() => {
    var r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return {
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
    };
  });

  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(300);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(800);

  out.log = await page.evaluate(() => window.__log);
  out.elementsAtPoint = await page.evaluate(function (p) {
    return document
      .elementsFromPoint(p.x, p.y)
      .slice(0, 6)
      .map((e) => e.tagName + "." + (e.getAttribute("class") || ""));
  }, box);

  out.canvasHtml = await page.evaluate(() => {
    var c = document.querySelector(".drawing-canvas");
    return { children: c.children.length, html: c.innerHTML.slice(0, 250) };
  });

  return out;
}
