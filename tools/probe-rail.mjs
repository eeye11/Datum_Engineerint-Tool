/* Which tool ids are reachable, including inside submenus? */
import { openDrawingTab, selectDiscipline } from "./qa-bridge-driver.mjs";

export default async function run(page) {
  await openDrawingTab(page);

  const found = [];

  for (const category of ["GEOMETRY", "STATICS"]) {
    await selectDiscipline(page, category);

    const rail = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-tool-id]")).map((e) => ({
        id: e.getAttribute("data-tool-id"),
        text: (e.textContent || "").trim().slice(0, 20),
        popup: e.getAttribute("aria-haspopup"),
      })),
    );

    for (const button of rail) {
      found.push({ category, id: button.id, text: button.text });

      if (button.popup) {
        await page.locator(`[data-tool-id="${button.id}"]`).first().click();
        await page.waitForTimeout(250);

        const items = await page.evaluate(() =>
          Array.from(document.querySelectorAll("[data-submenu-id]")).map((e) =>
            e.getAttribute("data-submenu-id"),
          ),
        );

        found.push({ submenuOf: button.id, items });

        await page.keyboard.press("Escape");
        await page.waitForTimeout(150);
      }
    }
  }

  return found;
}
