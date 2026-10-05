/*
 * Verification aid: read window.enggDrawing from inside the page
 * itself and stash the result on the DOM, because a value the
 * page computes is the one channel that has proved reliable
 * throughout this investigation. Not part of the application.
 */

export default async function run(page, ui) {
  const snap = await ui.snapshot();
  await ui.click(snap.match(/@(e\d+) button "Engineering Drawing"/i)[1]);
  await page.waitForTimeout(2500);

  /*
   * The page writes its own view of the global into the DOM. If
   * the global is genuinely absent, this reads "ABSENT" and the
   * drawing code is running from somewhere else.
   */
  await page.evaluate(() => {
    const node = document.createElement("div");
    node.id = "probe-result";
    node.setAttribute("data-probe", "pending");

    try {
      const app = window.enggDrawing;
      node.textContent = app
        ? `PRESENT tool=${app.state?.activeTool} objs=${app.state?.objects?.length}`
        : "ABSENT";
    } catch (error) {
      node.textContent = `THREW ${error.message}`;
    }

    document.body.appendChild(node);
  });

  await page.waitForTimeout(300);

  return await page.evaluate(() => {
    const node = document.getElementById("probe-result");
    return {
      probe: node?.textContent || "NO NODE",
      hasGlobal: "enggDrawing" in window,
    };
  });
}
