/* Does any diagram heading still reach the sheet? */
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
  await page.waitForTimeout(900);

  const box = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return { x: r.left + r.width * 0.15, y: r.top + r.height * 0.45 };
  });

  const click = async (x, y) => {
    await page.mouse.move(x, y);
    await page.waitForTimeout(200);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(650);
  };

  const openStatics = () =>
    page.evaluate(() => {
      const c = document.querySelector(
        '.drawing-category[data-category="STATICS"]',
      );
      if (c) c.click();
    });
  const tool = (id) =>
    page.evaluate((t) => {
      const b = document.querySelector(`.drawing-tool[data-tool-id="${t}"]`);
      if (!b) throw new Error("no tool " + t);
      b.click();
    }, id);
  const sub = (id) =>
    page.evaluate((t) => {
      const i = document.querySelector(
        `.drawing-coordinate-submenu-item[data-submenu-id="${t}"]`,
      );
      if (i) i.click();
    }, id);

  /* A beam to measure. */
  await openStatics();
  await page.waitForTimeout(300);
  await tool("body");
  await page.waitForTimeout(300);
  await sub("beam");
  await page.waitForTimeout(350);
  await click(box.x, box.y);
  await click(box.x + 260, box.y + 30);

  /* One diagram per type, both modes. */
  out.results = [];
  for (const toolId of [
    "shear-force-diagram",
    "bending-moment-diagram",
    "axial-force-diagram",
  ]) {
    for (const mode of ["Sketch", "Plot"]) {
      await openStatics();
      await page.waitForTimeout(300);
      await tool(toolId);
      await page.waitForTimeout(400);
      const picked = await page.evaluate((m) => {
        const i = [
          ...document.querySelectorAll(".drawing-coordinate-submenu-item"),
        ].find((b) => b.textContent.trim() === m);
        if (!i) return false;
        i.click();
        return true;
      }, mode);
      await page.waitForTimeout(450);
      await click(box.x + 130, box.y + 30);

      const found = await page.evaluate(() => {
        const t = [...document.querySelectorAll(".drawing-renderer text")].map(
          (n) => n.textContent.trim(),
        );
        const bad = t.filter((s) =>
          /^(Shear Force|Bending Moment|Axial Force) Diagram$/.test(s),
        );
        return {
          bad,
          axis: t.filter((s) => /x \(m\)/.test(s)).length,
          total: t.length,
        };
      });
      out.results.push({ tool: toolId, mode, picked, ...found });
    }
  }

  out.diagramCount = await page.evaluate(
    () =>
      document.querySelectorAll(
        '.drawing-renderer g[data-object-id*="analysis"]',
      ).length,
  );
  return out;
}
