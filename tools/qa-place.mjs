export default async function run(page) {
  const out = {};
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.stack || e).slice(0, 600)));

  await page.evaluate(() => {
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    [...document.querySelectorAll(".drawing-category")]
      .find((b) => /STATICS/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(400);
  await page.locator('.drawing-tool[data-tool-id="body"]').click();
  await page.waitForTimeout(400);

  // Choose Particle from the open submenu
  await page
    .locator(".drawing-coordinate-submenu-item", { hasText: "Particle" })
    .first()
    .click();
  await page.waitForTimeout(500);

  out.pressedAfterParticle = await page.evaluate(() => {
    var b =
      document.querySelector('.drawing-tool[data-tool-id="particle"]') ||
      document.querySelector('.drawing-tool[data-tool-id="body"]');
    return b
      ? { id: b.dataset.toolId, pressed: b.getAttribute("aria-pressed") }
      : null;
  });

  out.statusMsg = await page.evaluate(() => {
    var el = document.querySelector(
      ".drawing-tool-hint, .drawing-status-message, #drawing-tool-message",
    );
    if (el) return el.textContent.trim().slice(0, 120);
    var all = [...document.querySelectorAll("#drawing *")].filter(
      (e) =>
        e.children.length === 0 && /Specify|click|place/i.test(e.textContent),
    );
    return all.length ? all[0].textContent.trim().slice(0, 120) : null;
  });

  // Find the canvas and click in the middle of it
  out.canvas = await page.evaluate(() => {
    var c = document.querySelector("#drawing svg, #drawing canvas");
    if (!c) return null;
    var r = c.getBoundingClientRect();
    return {
      tag: c.tagName,
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  });

  if (out.canvas) {
    await page.mouse.move(out.canvas.x, out.canvas.y);
    await page.waitForTimeout(300);
    await page.mouse.click(out.canvas.x, out.canvas.y);
    await page.waitForTimeout(700);
  }

  out.objectsAfter = await page.evaluate(() => {
    var st = window.enggDrawingState;
    var sheet = st && st.activeSheet ? st.activeSheet() : null;
    var objs = (sheet && sheet.objects) || [];
    return {
      count: objs.length,
      types: objs.map((o) => o.type),
      geom: objs.map((o) => JSON.stringify(o.geometry).slice(0, 120)),
    };
  });

  out.svgChildren = await page.evaluate(() => {
    var c = document.querySelector("#drawing svg");
    return c ? c.querySelectorAll("g,path,circle,rect,line").length : 0;
  });

  out.errs = errs;
  return out;
}
