/* Where exactly does the `?` toggle land in a beam property row? */
export default async function run(page) {
  await page.setViewportSize({ width: 1400, height: 950 });
  await page.goto("http://localhost:3000/", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.evaluate(() =>
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click(),
  );
  await page.waitForTimeout(1000);

  const rect = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const P = (fx, fy) => ({
    x: rect.left + rect.width * fx,
    y: rect.top + rect.height * fy,
  });
  const click = async (x, y) => {
    await page.mouse.move(x, y);
    await page.waitForTimeout(180);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(600);
  };
  const tool = (t) =>
    page.evaluate((id) => {
      const b = document.querySelector(`.drawing-tool[data-tool-id="${id}"]`);
      if (b) b.click();
    }, t);
  const sub = (id) =>
    page.evaluate((s) => {
      const b = document.querySelector(
        `.drawing-coordinate-submenu-item[data-submenu-id="${s}"]`,
      );
      if (b) b.click();
    }, id);
  const cat = (c) =>
    page.evaluate((k) => {
      const b = document.querySelector(
        `.drawing-category[data-category="${k}"]`,
      );
      if (b) b.click();
    }, c);

  await cat("STATICS");
  await page.waitForTimeout(300);
  await tool("body");
  await page.waitForTimeout(300);
  await sub("beam");
  await page.waitForTimeout(400);
  await click(P(0.3, 0.3).x, P(0.3, 0.3).y);
  await click(P(0.6, 0.3).x, P(0.6, 0.3).y);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await tool("select");
  await page.waitForTimeout(350);
  await click(P(0.45, 0.3).x, P(0.45, 0.3).y);
  await click(P(0.45, 0.3).x, P(0.45, 0.3).y);
  await page.waitForTimeout(600);

  return await page.evaluate(() => {
    const panel = document.getElementById("drawingProperties");
    const rows = [...panel.querySelectorAll(".drawing-property-grid-value")];
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return `${Math.round(r.left)}..${Math.round(r.right)} (w${Math.round(r.width)})`;
    };
    return {
      panelW: Math.round(panel.getBoundingClientRect().width),
      rows: rows.slice(0, 6).map((row) => ({
        label: row
          .querySelector(".drawing-property-grid-label")
          ?.textContent?.trim(),
        labelBox: box(row.querySelector(".drawing-property-grid-label")),
        input: row.querySelector("input, select")
          ? box(row.querySelector("input, select"))
          : null,
        unit: row.querySelector(".drawing-property-unit")
          ? {
              box: box(row.querySelector(".drawing-property-unit")),
              text: row
                .querySelector(".drawing-property-unit")
                .textContent.trim(),
              scrollW: row.querySelector(".drawing-property-unit").scrollWidth,
              clientW: row.querySelector(".drawing-property-unit").clientWidth,
            }
          : null,
        known: row.querySelector(".drawing-property-known")
          ? box(row.querySelector(".drawing-property-known"))
          : null,
      })),
    };
  });
}
