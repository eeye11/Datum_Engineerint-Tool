/* Capture the popup so the unit select can be looked at. */
import {
  openDrawingTab,
  activateStrict,
  clickWorld,
} from "./qa-bridge-driver.mjs";

export default async function run(page) {
  await openDrawingTab(page);

  await activateStrict(page, "rectangle");
  await clickWorld(page, 0.15, 0.5);
  await clickWorld(page, 0.45, 0.75);

  return page.locator(".drawing-creation-dimension-body").innerHTML();
}
