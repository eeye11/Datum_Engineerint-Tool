/* What does the Statics toolbar actually contain? Ask, do not guess. */
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

  out.categories = await page.evaluate(() =>
    [...document.querySelectorAll(".drawing-category")].map(
      (c) => c.dataset.category,
    ),
  );

  await page.evaluate(() => {
    const c = document.querySelector(
      '.drawing-category[data-category="STATICS"]',
    );
    if (c) c.click();
  });
  await page.waitForTimeout(600);

  out.statics = await page.evaluate(() => ({
    tools: [...document.querySelectorAll(".drawing-tool")].map((t) => ({
      id: t.dataset.toolId,
      label: (t.textContent || "").trim(),
    })),
    subs: [
      ...document.querySelectorAll(".drawing-coordinate-submenu-item"),
    ].map((s) => ({
      id: s.dataset.submenuId,
      label: (s.textContent || "").trim(),
    })),
  }));

  /* Panel container identity, so a later scan measures the real thing. */
  out.panels = await page.evaluate(() =>
    [...document.querySelectorAll("[id]")]
      .filter(
        (e) =>
          /drawing/i.test(e.id) &&
          /panel|propert|feature|component/i.test(e.id),
      )
      .map((e) => {
        const r = e.getBoundingClientRect();
        return {
          id: e.id,
          w: Math.round(r.width),
          h: Math.round(r.height),
          display: getComputedStyle(e).display,
        };
      }),
  );

  return out;
}
