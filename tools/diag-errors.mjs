/*
 * Verification aid: capture every page error so a script that
 * fails partway through is visible, rather than inferred from a
 * missing global. Not part of the application.
 */

export default async function run(page, ui) {
  const errors = [];

  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  page.on("console", (m) => {
    if (m.type() === "error") {
      errors.push(`console: ${m.text()}`);
    }
  });

  const snap = await ui.snapshot();
  await ui.click(snap.match(/@(e\d+) button "Engineering Drawing"/i)[1]);
  await page.waitForTimeout(3000);

  const state = await page.evaluate(() => ({
    hasGlobal: "enggDrawing" in window,
    toolBtns: document.querySelectorAll(".drawing-tool-list button").length,
    canvasSvg: !!document.querySelector(".drawing-canvas svg"),
    msgs: Array.from(document.querySelectorAll("script"))
      .map((s) => s.src.split("/").pop())
      .filter(Boolean),
  }));

  return { errors, state };
}
