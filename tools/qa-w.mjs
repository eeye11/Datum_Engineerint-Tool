export default async function run(page) {
  return await page.evaluate(() => ({
    showTab: typeof window.showTab,
    state: typeof window.enggDrawingState,
    geom: typeof window.enggFeatureGeometry,
    snap: typeof window.enggDrawingSnap,
    catRect: (function () {
      var b = document.querySelector(".drawing-category");
      var r = b.getBoundingClientRect();
      return [r.width | 0, r.height | 0];
    })(),
    drawingActive: document.getElementById("drawing").className,
  }));
}
