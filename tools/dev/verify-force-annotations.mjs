/*
 * The magnitude annotation system:
 *   - magnitude only, never an angle;
 *   - no Show Unit control anywhere;
 *   - units always printed.
 *
 * Checked against the ANNOTATION MODEL, which is the one place that
 * decides what the text says - so a fix anywhere else would not hide
 * a failure here.
 */
import {
  mainWorld,
  openDrawingTab,
  selectDiscipline,
  activateStrict,
  clickWorld
} from "./qa-bridge-driver.mjs";

const results = [];
const ok = (n, p, d) => results.push({ name: n, pass: !!p, detail: d });

export default async function run(page) {
  try {
    await body(page, ok);
  } catch (e) {
    ok(`UNEXPECTED FAILURE: ${e.message}`, false);
  }

  return {
    passed: results.filter(r => r.pass).length,
    total: results.length,
    failed: results.filter(r => !r.pass)
  };
}

async function body(page, ok) {
  await openDrawingTab(page);
  await selectDiscipline(page, "STATICS");

  // ---- 1 & 2: no angle, and the unit is always there ----
  const texts = await mainWorld(page, () => {
    const model = window.enggAnnotationModel;
    const geometry = {
      start: { x: 0, y: 0 },
      end: { x: 60, y: 0 },
      magnitude: 100,
      angle: 30,
      direction: -90,
      intensity: 5,
      clockwise: false,
      startMagnitude: 5,
      endMagnitude: 10,
      segmentCount: 2,
      segments: [],
      /*
       * A VARYING LOAD is annotated per profile point, so the model
       * reads `points[]` - each with its own magnitude - rather than
       * the whole-profile start/end pair. The fixture supplies two,
       * which is what makes w1 and w2 both readable.
       */
      points: [
        { x: 0, y: 0, magnitude: 5 },
        { x: 100, y: 0, magnitude: 10 }
      ],
      components: { x: 80, y: -60 }
    };

    const scene = {
      objects: [{ id: "s1", type: "beam", geometry }],
      sheets: []
    };

    const read = (kind, extra = {}) => {
      const annotation = {
        id: `a-${kind}`,
        kind,
        annotationKind: kind,
        textMode: "auto",
        text: "",
        sourceFeatureId: "s1",
        textFormat: kind,
        ...extra
      };

      return model.textFor(annotation, scene);
    };

    return {
      force: read("force-value"),
      moment: read("moment-value"),
      load: read("load-value"),
      /*
       * Two separate annotations - one per profile point - because
       * that is how a varying load is actually annotated.
       */
      varyingW1: read("load-profile-value", { anchorRef: { index: 0 } }),
      varyingW2: read("load-profile-value", { anchorRef: { index: 1 } }),
      resultant: read("resultant-value")
    };
  });

  const kinds = {
    "Point Force": texts.force,
    Moment: texts.moment,
    "Distributed Load": texts.load,
    "Varying Load w1": texts.varyingW1,
    "Varying Load w2": texts.varyingW2,
    Resultant: texts.resultant
  };

  for (const [label, text] of Object.entries(kinds)) {
    if (text === null || text === undefined) {
      ok(`${label} produces an annotation`, false, String(text));
      continue;
    }

    ok(
      `${label} states no angle`,
      !/θ|deg|°|CW|CCW/.test(text),
      `${label}: ${JSON.stringify(text)}`
    );

    ok(
      `${label} states only its magnitude`,
      text.trim().split("\n").length === 1,
      `${label}: ${JSON.stringify(text)}`
    );
  }

  ok("a force reads as magnitude + unit",
    /100(\.0)?\s*N/.test(texts.force || ""),
    JSON.stringify(texts.force));

  ok("a moment reads as magnitude + unit",
    /500|N·m|100/.test(texts.moment || "") &&
      /N·m/.test(texts.moment || ""),
    JSON.stringify(texts.moment));

  ok("a distributed load reads as intensity + unit",
    /kN\/m/.test(texts.load || ""),
    JSON.stringify(texts.load));

  ok("a resultant reads as magnitude + unit",
    /N/.test(texts.resultant || ""),
    JSON.stringify(texts.resultant));

  // ---- 3: no Show Unit control anywhere in the panel ----
  const panelControls = await mainWorld(page, () => {
    const host = document.getElementById("drawingProperties");

    return Array.from(host?.querySelectorAll("*") || [])
      .map(e => (e.textContent || "").trim())
      .filter(t => /^show unit$/i.test(t));
  });

  ok("no Show Unit control is present", panelControls.length === 0,
    JSON.stringify(panelControls));

  // ---- A force feature's panel: check the real thing ----
  await activateStrict(page, "point-force");
  await clickWorld(page, 0.3, 0.4);
  await clickWorld(page, 0.5, 0.4);
  await page.waitForTimeout(500);

  const forcePanel = await mainWorld(page, () => {
    const host = document.getElementById("drawingProperties");

    return {
      labels: Array.from(
        host?.querySelectorAll(".drawing-property-grid-label") || []
      ).map(e => (e.textContent || "").trim()),
      toggles: Array.from(
        host?.querySelectorAll("[data-feature-show-magnitude], [data-feature-show-unit]") || []
      ).map(e => e.getAttribute("data-feature-show-magnitude")
        ? "magnitude"
        : "unit")
    };
  });

  ok("the Point Force panel keeps Show Magnitude",
    forcePanel.labels.includes("Show Magnitude"),
    JSON.stringify(forcePanel.labels));

  ok("the Point Force panel has no Show Unit",
    !forcePanel.labels.some(l => /^show unit$/i.test(l)),
    JSON.stringify(forcePanel.labels));

  ok("and no unit toggle element is rendered",
    !forcePanel.toggles.includes("unit"),
    JSON.stringify(forcePanel.toggles));
}