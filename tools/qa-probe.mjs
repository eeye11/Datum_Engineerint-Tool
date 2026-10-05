export default async function run(page) {
  const out = {};

  await page.evaluate(() => {
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(700);

  // Wrap the canvas click in a capture-phase probe that records whether
  // the app's own handler ran and what the pointer resolved to.
  await page.evaluate(() => {
    window.__probe = [];
    const c = document.querySelector(".drawing-canvas");
    c.addEventListener(
      "click",
      function (e) {
        const r = c.getBoundingClientRect();
        window.__probe.push({
          clientX: Math.round(e.clientX),
          clientY: Math.round(e.clientY),
          localX: Math.round(e.clientX - r.left),
          localY: Math.round(e.clientY - r.top),
          canvasW: c.clientWidth,
          canvasH: c.clientHeight,
          defaultPrevented: e.defaultPrevented,
        });
      },
      true,
    );
  });

  await page.evaluate(() => {
    [...document.querySelectorAll(".drawing-category")]
      .find((b) => /STATICS/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(350);
  await page.locator('.drawing-tool[data-tool-id="body"]').click();
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    const el = [
      ...document.querySelectorAll(".drawing-coordinate-submenu-item"),
    ].find((b) => b.textContent.trim() === "Particle");
    if (el) el.click();
  });
  await page.waitForTimeout(550);

  const box = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return {
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
    };
  });

  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(250);
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(800);

  out.probe = await page.evaluate(() => window.__probe);

  // What does the app think its own canvas geometry is?
  out.geom = await page.evaluate(() => {
    const c = document.querySelector(".drawing-canvas");
    const svg = c.querySelector("svg");
    return {
      canvasClient: [c.clientWidth, c.clientHeight],
      svgAttr: svg
        ? [svg.getAttribute("width"), svg.getAttribute("height")]
        : null,
      svgBox: svg
        ? [
            svg.getBoundingClientRect().width | 0,
            svg.getBoundingClientRect().height | 0,
          ]
        : null,
      svgStyle: svg ? [svg.style.width, svg.style.height] : null,
    };
  });

  return out;
}
