// Verify Line appearance: width, colour and line type reach the RENDERED line,
// and survive a redraw and a save/reopen. Also checks appearance does not move
// the geometry.
export default async function run(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String((e && e.message) || e)));

  const tab = page.getByText("Engineering Drawing", { exact: true }).first();
  if (await tab.count()) {
    await tab.click();
    await page.waitForTimeout(1000);
  }

  await page.waitForSelector(".drawing-canvas", { state: "visible", timeout: 15000 });

  return await page.evaluate(async () => {
    const S = (await import("/src/core/model/drawing-state.js")).default;
    const model = (await import("/src/editor/editor-state.js")).drawingState;
    const binding = await import("/src/editor/property-binding.js");
    const canvasRender = await import("/src/editor/canvas-render.js");
    const dom = await import("/src/editor/dom.js");

    void binding;

    const out = {};

    model.objects.length = 0;
    S.addObject(model, S.geometryFactories.line({ x: 0, y: 0 }, { x: 80, y: 0 }));

    const line = model.objects[model.objects.length - 1];
    const geomBefore = JSON.stringify(line.geometry);

    /*
     * SELECT IT FIRST. With nothing selected the controls set the DEFAULT for the
     * next feature drawn, which is not what this test is about - the question is
     * whether editing a SELECTED line's appearance reaches the render.
     */
    S.selectObject(model, line.id);
    out.selected = model.selection.selectedObjectIds.slice();

    // --- applyStyleControls writes width + colour + lineType ---
    dom.drawingThickness.value = "1";
    dom.drawingColor.value = "#c0392b";
    dom.drawingLineType.value = "dashed";

    const colourPicker = await import("/src/editor/colour-picker.js");
    colourPicker.applyStyleControls();

    out.style = {
      width: line.style.lineWidth,
      stroke: line.style.stroke,
      type: line.style.lineType,
    };

    out.geometryUnmoved = JSON.stringify(line.geometry) === geomBefore;

    // --- the RENDERED line carries them ---
    canvasRender.renderCurrentDrawing();

    const canvas = document.querySelector(".drawing-canvas");
    const svg = canvas.querySelector("svg");

    // The line's own stroke element in the render.
    const strokes = [...svg.querySelectorAll("line, path")].filter(
      (el) => el.getAttribute("stroke") === "#c0392b",
    );

    out.renderedStrokeFound = strokes.length > 0;
    out.renderedStrokeWidth = strokes[0]?.getAttribute("stroke-width") || null;
    out.renderedDasharray = strokes[0]?.getAttribute("stroke-dasharray") || null;

    // --- line type solid clears the dash ---
    dom.drawingLineType.value = "solid";
    colourPicker.applyStyleControls();
    canvasRender.renderCurrentDrawing();

    const afterSolid = [...canvas.querySelectorAll("line, path")].find(
      (el) => el.getAttribute("stroke") === "#c0392b",
    );

    out.solidDasharray = afterSolid?.getAttribute("stroke-dasharray") || null;

    // --- survives serialization ---
    const body = JSON.parse(S.serializeDrawing(model));
    const saved = body.objects.find((o) => o.id === line.id);

    out.savedStyle = saved ? saved.style : null;

    return out;
  });
}
