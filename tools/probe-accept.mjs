/* Do the dimension and body-frame APIs resolve on a created beam? */
import {
  mainWorld,
  openDrawingTab,
  activateStrict,
  clickWorld,
} from "./qa-bridge-driver.mjs";

export default async function run(page) {
  await openDrawingTab(page);

  await activateStrict(page, "beam");
  await clickWorld(page, 0.15, 0.3);
  await clickWorld(page, 0.32, 0.3);

  await page.locator(".drawing-creation-dimension-input").fill("500");
  await page.locator(".drawing-creation-dimension-input").press("Enter");
  await page.waitForTimeout(500);

  return mainWorld(page, () => {
    const s = window.enggDrawing.state;
    const beam = s.objects.find((o) => o.type === "beam");

    const M = window.enggMeasurement;
    const D = window.enggDimensionModel;
    const B = window.enggBodyFrames;

    const dim = D.createDimension({
      dimensionType: "distance",
      refs: [
        { kind: "between", featureId: beam.id, anchor: "start" },
        { kind: "between", featureId: beam.id, anchor: "end" },
      ],
    });

    const anchorStart = M.resolveAnchor(beam, "start");
    const anchorMid = M.resolveAnchor(beam, "midpoint");

    return {
      modelKeys: Object.keys(D),
      measurementKeys: Object.keys(M),
      bodyFramesKeys: B ? Object.keys(B) : null,

      sourceRefs: dim.sourceRefs,
      anchorStart,
      anchorMid,
      measurePointsNull: D.measurePoints ? "n/a" : "n/a",
      measurement: D.measurementFor(dim, s),

      frame: B ? !!B.frameOf(beam) : null,
      pointAt250: B ? B.pointAt(B.frameOf(beam), 250) : null,
    };
  });
}
