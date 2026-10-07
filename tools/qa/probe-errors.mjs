/*
 * Captures what actually happens while the module graph loads: any uncaught
 * error, and whether main.js reached its automation hooks.
 */
export default async function run(page) {
  const out = { entries: [] };

  // Listen for page errors and failed module requests.
  page.on("pageerror", (error) => {
    out.entries.push({ kind: "pageerror", text: String(error).slice(0, 400) });
  });

  page.on("requestfailed", (request) => {
    out.entries.push({
      kind: "requestfailed",
      url: request.url(),
      error: String(request.failure()?.errorText || "").slice(0, 200)
    });
  });

  // Reload so the listeners see the whole load.
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2500);

  out.globals = await page.evaluate(() => ({
    datum: typeof window.datum,
    enggDrawing: typeof window.enggDrawing,
    enggDrawingState: typeof window.enggDrawingState,
    mainRan: Boolean(window.datum)
  }));

  // Ask the module graph directly whether main.js executes.
  out.moduleCheck = await page.evaluate(async () => {
    try {
      await import("/src/app/automation-hooks.js");
      return { automationHooks: "imported" };
    } catch (e) {
      return { automationHooks: "FAILED: " + String(e.message).slice(0, 300) };
    }
  });

  return out;
}
