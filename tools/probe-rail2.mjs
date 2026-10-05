/* Is reference-arc reachable in the STATICS rail? */
import { openDrawingTab, selectDiscipline } from "./qa-bridge-driver.mjs";

export default async function run(page) {
  await openDrawingTab(page);

  const out = {};

  for (const category of ["GEOMETRY", "STATICS"]) {
    await selectDiscipline(page, category);

    out[category] = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-tool-id]")).map((e) => ({
        id: e.getAttribute("data-tool-id"),
        popup: e.getAttribute("aria-haspopup"),
      })),
    );
  }

  return out;
}
