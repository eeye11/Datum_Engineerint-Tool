/*
 * Opens the Drawing tab and reports the state of the collapsible
 * panels. Verification aid, not part of the application.
 */
export default async function run(page, ui) {
  const snap = await ui.snapshot();

  const tab = snap.match(/@e\d+ [^\n]*Drawing[^\n]*/)?.[0];

  if (!tab) {
    return { error: "no drawing tab in the snapshot", snap };
  }

  const ref = tab.match(/@e\d+/)?.[0];

  await ui.click(ref);
  await page.waitForTimeout(800);

  return await page.evaluate(() => {
    const canvas = document.querySelector(".drawing-canvas");

    const left = document.getElementById("drawingToolPanelToggle");
    const right = document.getElementById("drawingFeaturesPanelToggle");

    const zoomInput = document.getElementById("drawingZoomValue");

    const rails = [...document.querySelectorAll(".drawing-panel-rail")];

    return {
      canvasPresent: Boolean(canvas),
      canvasWidth: canvas?.clientWidth,
      leftTogglePresent: Boolean(left),
      rightTogglePresent: Boolean(right),
      railCount: rails.length,
      railWidths: rails.map((r) => r.clientWidth),
      zoomBefore: zoomInput?.value,
    };
  });
}
