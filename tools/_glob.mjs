export default async function run(page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("http://localhost:3000/", { waitUntil: "load" });
  await page.waitForTimeout(1200);

  return page.evaluate(() => {
    const names = [
      "enggDrawingState",
      "enggDrawing",
      "enggAnalysisDependencies",
      "enggDiagramEquations",
      "enggBodyFrames",
      "enggFeatureGeometry",
      "enggObjectSnap",
    ];

    const found = names.map((n) => ({
      name: n,
      inWindow: n in window,
      type: typeof window[n],
    }));

    /*
     * If the module-level export is genuinely missing, the script either
     * failed to load or threw. Both leave evidence, and saying which one
     * is the difference between "the file is broken" and "my probe is".
     */
    const scripts = [...document.querySelectorAll("script[src]")].map((s) =>
      s.getAttribute("src"),
    );

    return {
      found,
      engineeringScriptCount: scripts.filter((s) =>
        /engineering-drawing/.test(s),
      ).length,
      hasDrawingStateScript: scripts.some((s) => /drawing-state\.js/.test(s)),
      bodyChildren: document.body.children.length,
    };
  });
}
