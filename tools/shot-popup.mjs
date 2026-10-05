/* Capture the popup mid-workflow, on a two-value shape. */
import {
  openDrawingTab,
  activateStrict,
  clickWorld,
  labelOf,
  stepOf,
} from "./qa-bridge-driver.mjs";

export default async function run(page) {
  await openDrawingTab(page);

  await activateStrict(page, "rectangle");
  await clickWorld(page, 0.15, 0.5);
  await clickWorld(page, 0.45, 0.75);

  return {
    title: await page
      .locator(".drawing-creation-dimension-title")
      .textContent()
      .catch(() => "(none)"),
    label: await labelOf(page),
    step: await stepOf(page),
    unit: await page
      .locator(".drawing-creation-dimension-unit")
      .textContent()
      .catch(() => "(none)"),
  };
}
