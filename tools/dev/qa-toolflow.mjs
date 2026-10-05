/*
 * Works out how each tool is actually created: how many canvas clicks
 * it needs, and whether it opens a submenu first. Verification aid.
 */
export default async function run(page, ui) {
  await page.waitForLoadState("load", { timeout: 30000 });

  await page
    .waitForFunction(
      () => document.querySelectorAll("[data-tool-id]").length > 0,
      { timeout: 30000 }
    )
    .catch(() => null);

  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ [^\n]*Engineering Drawing[^\n]*/)?.[0];
  if (tab) {
    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(800);
  }

  const tools = [
    ["GEOMETRY", "arc"],
    ["GEOMETRY", "circle"],
    ["STATICS", "body"],
    ["STATICS", "load"],
    ["STATICS", "moment"],
    ["STATICS", "support"],
    ["STATICS", "connection"],
  ];

  const out = [];

  for (const [category, id] of tools) {
    await page.evaluate(
      (c) => {
        document
          .querySelector(`.drawing-category[data-category="${c}"]`)
          ?.click();
      },
      category
    );
    await page.waitForTimeout(350);

    /* Click the tool once and see whether a submenu opened. */
    const opened = await page.evaluate((i) => {
      const b = document.querySelector(`[data-tool-id="${i}"]`);
      b?.click();

      /* A submenu lists more tools of the same kind. */
      const menus = document.querySelectorAll(
        ".drawing-submenu, [data-statics-submenu]"
      );

      return {
        menuCount: menus.length,
        menuItems: Array.from(menus)
          .flatMap((m) =>
            Array.from(
              m.querySelectorAll("[data-tool-id]")
            ).map((b) => b.dataset.toolId)
          ),
      };
    }, id);

    out.push({ category, id, ...opened });
  }

  return out;
}
