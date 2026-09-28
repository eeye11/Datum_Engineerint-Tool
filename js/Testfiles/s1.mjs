export default async function run(page, ui) {
  const out = {};
  const before = await ui.snapshot();
  const tab = before.match(/@(e\d+) [^\n]*Engineering Drawing/)?.[1];
  if (!tab) return { error: "drawing tab missing", before };
  await ui.click(tab);
  await page.waitForTimeout(2000);

  await page.locator('.drawing-category[data-category="STATICS"]').click();
  await page.waitForTimeout(500);

  // Section structure and which tools carry a submenu caret.
  out.sections = await page.evaluate(() =>
    [...document.querySelectorAll("#drawingToolList .drawing-tool-group")].map(
      (s) => ({
        label: (
          s.querySelector(".drawing-tool-group-label")?.textContent || ""
        ).trim(),
        tools: [...s.querySelectorAll("button")].map((b) => ({
          id: b.dataset.toolId,
          caret: !!b.querySelector(".drawing-tool-caret"),
          haspopup: b.getAttribute("aria-haspopup"),
        })),
      }),
    ),
  );

  // Open each of the six category submenus and read the items.
  const categories = [
    "body",
    "force",
    "moment",
    "load",
    "support",
    "connection",
  ];
  out.menus = {};

  for (const id of categories) {
    await page.locator(`#drawingToolList button[data-tool-id="${id}"]`).click();
    await page.waitForTimeout(400);

    const items = await page
      .locator(".drawing-coordinate-submenu-item")
      .allTextContents();
    const menuClasses = await page.evaluate(() =>
      [...document.querySelectorAll(".drawing-coordinate-submenu")].map(
        (m) => m.className,
      ),
    );

    out.menus[id] = { items: items.map((t) => t.trim()), menuClasses };

    // A parent must not become the active tool.
    const active = await page.evaluate(
      () =>
        document.querySelector("#drawingToolList button.active")?.dataset
          .toolId || null,
    );
    out.menus[id].activeTool = active;

    // Close it before the next one.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.mouse.click(5, 5);
    await page.waitForTimeout(300);
  }

  return out;
}
