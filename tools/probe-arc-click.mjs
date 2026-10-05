/* Does ONE click on the GEOMETRY Arc button open its submenu? */
import {
  mainWorld,
  openDrawingTab,
  selectDiscipline,
} from "./qa-bridge-driver.mjs";

export default async function run(page) {
  await openDrawingTab(page);
  await selectDiscipline(page, "GEOMETRY");

  await page.locator('[data-tool-id="arc"]').first().click();
  await page.waitForTimeout(500);

  const arc = await mainWorld(page, () => ({
    arcModes: Array.from(document.querySelectorAll("[data-arc-mode]")).map(
      (e) => e.dataset.arcMode,
    ),
    activeTool: window.enggDrawing.state.activeTool,
  }));

  // Now the Reference Arc button, with the menu state reported around it.
  await page.keyboard.press("Escape");
  await selectDiscipline(page, "STATICS");
  await page.waitForTimeout(400);

  await page.locator('[data-tool-id="reference-arc"]').first().click();
  await page.waitForTimeout(500);

  const ref = await mainWorld(page, () => ({
    arcModes: Array.from(document.querySelectorAll("[data-arc-mode]")).map(
      (e) => e.dataset.arcMode,
    ),
    allMenus: Array.from(
      document.querySelectorAll(".drawing-coordinate-submenu"),
    ).length,
    activeTool: window.enggDrawing.state.activeTool,
  }));

  return { arc, ref };
}
