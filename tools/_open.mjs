/* Open the Statics toolbar and list the real tool + submenu IDs. */
export default async function run(page) {
  await page.setViewportSize({ width: 1400, height: 950 });
  await page.goto("http://localhost:3000/", { waitUntil: "load" });
  await page.waitForTimeout(1500);

  await page.evaluate(() =>
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click(),
  );
  await page.waitForTimeout(900);

  const cats = await page.evaluate(() =>
    [...document.querySelectorAll(".drawing-category")].map(
      (c) => c.dataset.category,
    ),
  );

  await page.evaluate(() => {
    const b = document.querySelector(
      '.drawing-category[data-category="STATICS"]',
    );
    if (b) b.click();
  });
  await page.waitForTimeout(500);

  const tools = await page.evaluate(() =>
    [...document.querySelectorAll(".drawing-tool")].map((b) => ({
      id: b.dataset.toolId,
      label: (b.textContent || "").trim().slice(0, 30),
    })),
  );

  /* Open every tool's submenu to collect the real submenu ids. */
  const subs = {};
  for (const t of tools.filter((t) => t.id)) {
    subs[t.id] = await page.evaluate((id) => {
      const b = document.querySelector(`.drawing-tool[data-tool-id="${id}"]`);
      if (!b) return null;
      b.click();
      return new Promise((res) =>
        setTimeout(() => {
          res(
            [
              ...document.querySelectorAll(".drawing-coordinate-submenu-item"),
            ].map((i) => ({
              id: i.dataset.submenuId,
              label: (i.textContent || "").trim(),
            })),
          );
        }, 350),
      );
    }, t.id);
  }

  return { cats, tools, subs };
}
