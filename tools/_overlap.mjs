/* Which beam-panel controls overlap, and what are they? */
export default async function run(page) {
  const out = { errors: [] };
  page.on("pageerror", (e) => out.errors.push(String(e.message).slice(0, 160)));

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
    const ctrls = [...panel.querySelectorAll("input, select, button, textarea")]
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          type: el.type || "",
          cls: el.className || "",
          txt: (el.textContent || "").trim().slice(0, 20),
          label: (el.closest("label")?.textContent || "").trim().slice(0, 40),
          r: {
            l: Math.round(r.left),
            t: Math.round(r.top),
            w: Math.round(r.width),
            h: Math.round(r.height),
          },
          pos: getComputedStyle(el).position,
        };
      })
      .filter((c) => c.r.w > 0);

    const pairs = [];
    for (let i = 0; i < ctrls.length; i++)
      for (let j = i + 1; j < ctrls.length; j++) {
        const a = ctrls[i].r,
          b = ctrls[j].r;
        const ox = Math.min(a.l + a.w, b.l + b.w) - Math.max(a.l, b.l);
        const oy = Math.min(a.t + a.h, b.t + b.h) - Math.max(a.t, b.t);
        if (ox > 2 && oy > 2) pairs.push({ a: ctrls[i], b: ctrls[j], ox, oy });
      }

    return { total: ctrls.length, pairs, controls: ctrls };
  });
}
