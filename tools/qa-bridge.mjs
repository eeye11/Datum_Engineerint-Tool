/*
 * IS THE BRIDGE ALIVE, AND WHAT IS ON THE PAGE?
 *
 * The full QA script fails inside an injected script rather than inside
 * the test, which means the bridge is what is broken. This finds out which
 * half: whether the app's globals are visible to an injected script at
 * all, and what the toolbar actually contains.
 *
 * Everything here answers by printing. Nothing is inferred.
 */
export default async function run(page) {
  const out = { errors: [] };

  page.on("pageerror", (e) =>
    out.errors.push(String(e.message || e).slice(0, 200)),
  );

  await page.setViewportSize({ width: 1400, height: 950 });
  await page.goto("http://localhost:3000/", { waitUntil: "load" });
  await page.waitForTimeout(1200);

  await page.evaluate(() => {
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(900);

  out.toolbarTools = await page.evaluate(() =>
    [...document.querySelectorAll(".drawing-tool")].map(
      (b) => b.dataset.toolId,
    ),
  );

  out.categories = await page.evaluate(() =>
    [...document.querySelectorAll(".drawing-category")].map(
      (b) => b.dataset.category,
    ),
  );

  /*
   * The globals, asked from INSIDE an injected script rather than from the
   * harness's own evaluate. That is the whole distinction under test: the
   * harness cannot see page globals, an injected script can.
   */
  out.globalsFromInjectedScript = await page.evaluate(() => {
    const host = document.createElement("pre");
    host.id = "__probe";
    document.body.appendChild(host);

    const script = document.createElement("script");
    script.textContent = `
      try {
        document.getElementById("__probe").textContent = JSON.stringify({
          hasState: typeof window.enggDrawingState !== "undefined",
          hasGeometry: typeof window.enggDrawingState === "object"
            ? typeof window.enggDrawingState.geometryFactories
            : null,
          addObject: window.enggDrawingState
            ? typeof window.enggDrawingState.addObject
            : null
        });
      } catch (e) {
        document.getElementById("__probe").textContent =
          "ERROR: " + e.message;
      }
    `;
    document.body.appendChild(script);

    return document.getElementById("__probe").textContent;
  });

  /* And what the harness itself sees, for comparison. */
  out.globalsFromHarness = await page.evaluate(() => ({
    hasState: typeof window.enggDrawingState !== "undefined",
    keyCount: Object.keys(window).length,
  }));

  return out;
}
