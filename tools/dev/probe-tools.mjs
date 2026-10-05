/* What dimension tool ids are actually in the rail? */
import { openDrawingTab } from "./qa-bridge-driver.mjs";

export default async function run(page) {
  await openDrawingTab(page);

  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-tool-id]")).map(e => ({
      id: e.getAttribute("data-tool-id"),
      text: (e.textContent || "").trim().slice(0, 24)
    }))
  );
}