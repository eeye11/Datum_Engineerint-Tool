/*
 * The dimension and annotation wiring, checked in the real application.
 *
 * The four model modules are tested in Node. What cannot be tested
 * there is whether the document can HOLD them - whether a dimension
 * survives being created, numbered, selected, deleted, saved,
 * restored, and still measuring afterwards. That needs the real
 * addObject, the real undo stack and the real file format, which is
 * what this drives.
 *
 * Everything is reached through window.enggDrawing.model - the single
 * namespace the editor publishes - rather than through the individual
 * globals, so the check exercises the same path the tools will.
 */
export default async function run(page) {
  page.setDefaultTimeout(120000);

  const out = {};
  const log = (key, value) => {
    out[key] = value;
  };

  async function ask(body) {
    const content =
      "(function(){" +
      "var out;try{out=(function(){" +
      body +
      "})();}catch(e){out={error:String(e)};}" +
      "document.documentElement.setAttribute('data-probe'," +
      "JSON.stringify(out===undefined?null:out));" +
      "})();";

    try {
      await page.addScriptTag({ content });
    } catch (error) {
      return { questionFailed: String(error).slice(0, 300) };
    }

    try {
      const raw = await page.evaluate(() =>
        document.documentElement.getAttribute("data-probe")
      );
      await page.evaluate(() =>
        document.documentElement.removeAttribute("data-probe")
      );
      return raw === null ? null : JSON.parse(raw);
    } catch (error) {
      return { answerFailed: String(error).slice(0, 300) };
    }
  }

  await page
    .getByRole("button", { name: "Engineering Drawing" })
    .click();
  await page.waitForSelector(".drawing-sheet-tab");
  await page.waitForTimeout(400);

  log("modulesLoaded", await ask(
    "return {" +
    "measurement: typeof window.enggMeasurement," +
    "dimension: typeof window.enggDimensionModel," +
    "annotation: typeof window.enggAnnotationModel," +
    "smart: typeof window.enggSmartDimension," +
    "fromState: {" +
    "measurement: typeof window.enggDrawingState.measurement," +
    "dimension: typeof window.enggDrawingState.dimensionModel," +
    "annotation: typeof window.enggDrawingState.annotationModel }" +
    "};"
  ));

  /* A CALIBRATED document, so dimensions read in real units. */
  log("calibrated", await ask(
    "window.enggDrawing.state.scale = { mmPerUnit: 1, unit: 'mm' };" +
    "return window.enggDrawing.state.scale;"
  ));

  log("beamCreated", await ask(
    "var S = window.enggDrawing.state;" +
    "var M = window.enggDrawing.model;" +
    "var id = M.addObject(S, M.geometryFactories.beam(" +
    "{ x: -100, y: 0 }, { x: 100, y: 0 }));" +
    "return { id: id, objects: S.objects.length };"
  ));

  log("dimensionCreated", await ask(
    "var S = window.enggDrawing.state;" +
    "var M = window.enggDrawing.model;" +
    "var beam = S.objects.find(function (o) { return o.type === 'beam'; });" +
    "var id = M.addObject(S, M.geometryFactories.dimension({" +
    "  dimensionType: 'horizontal'," +
    "  refs: [" +
    "    { featureId: beam.id, anchor: 'start' }," +
    "    { featureId: beam.id, anchor: 'end' }]," +
    "  placement: { x: 0, y: 40 }" +
    "}));" +
    "var created = S.objects.find(function (o) { return o.id === id; });" +
    "return {" +
    "id: id, name: created.name, type: created.type," +
    "emptyGeometry: Object.keys(created.geometry || {}).length === 0," +
    "hasContent: !!created.content," +
    "refCount: created.content ? created.content.sourceRefs.length : 0," +
    "featureIdMatches: !!(created.content &&" +
    "created.content.sourceRefs[0].featureId === beam.id)" +
    "};"
  ));

  log("annotationCreated", await ask(
    "var S = window.enggDrawing.state;" +
    "var M = window.enggDrawing.model;" +
    "var id = M.addObject(S, M.geometryFactories.annotation({" +
    "  kind: 'free-text'," +
    "  text: 'Assume negligible self-weight.'," +
    "  position: { x: 40, y: 60 }" +
    "}));" +
    "var created = S.objects.find(function (o) { return o.id === id; });" +
    "return {" +
    "id: id, name: created.name, type: created.type," +
    "text: created.content.text," +
    "placement: created.content.placement," +
    "placementMode: created.content.placementMode" +
    "};"
  ));

  log("numbered", await ask(
    "return window.enggDrawing.state.objects.map(function (o) {" +
    "return o.name; });"
  ));

  log("selectable", await ask(
    "var S = window.enggDrawing.state;" +
    "var M = window.enggDrawing.model;" +
    "var dim = S.objects.find(function (o) { return o.type === 'dimension'; });" +
    "M.selectObject(S, dim.id);" +
    "return { selected: S.selection.selectedObjectIds.slice() };"
  ));

  log("secondDimension", await ask(
    "var S = window.enggDrawing.state;" +
    "var M = window.enggDrawing.model;" +
    "var beam = S.objects.find(function (o) { return o.type === 'beam'; });" +
    "var id = M.addObject(S, M.geometryFactories.dimension({" +
    "  dimensionType: 'vertical'," +
    "  refs: [" +
    "    { featureId: beam.id, anchor: 'start' }," +
    "    { featureId: beam.id, anchor: 'end' }]," +
    "  placement: { x: 120, y: 0 }" +
    "}));" +
    "return { name: S.objects.find(function (o) { return o.id === id; }).name };"
  ));

  /* A real render, so the wiring is proved against the actual canvas. */
  log("rendered", await ask(
    "window.enggDrawing.renderer.renderDrawing(" +
    "  window.enggDrawing.state," +
    "  document.querySelector('.drawing-canvas'));" +
    "var svg = document.querySelector('.drawing-canvas svg');" +
    "return {" +
    "rendered: !!svg," +
    "paths: svg ? svg.querySelectorAll('path').length : 0," +
    "shapes: svg ? svg.querySelectorAll('line, circle, rect, polyline').length : 0" +
    "};"
  ));

  /* Undo, having something to undo. */
  log("undo", await ask(
    "var S = window.enggDrawing.state;" +
    "var M = window.enggDrawing.model;" +
    "M.commitDrawingChange(S, M.snapshotDrawing(S));" +
    "var afterCommit = S.objects.length;" +
    "M.undo(S);" +
    "var afterUndo = S.objects.length;" +
    "M.redo(S);" +
    "return { afterCommit: afterCommit, afterUndo: afterUndo," +
    "afterRedo: S.objects.length };"
  ));

  log("roundTrip", await ask(
    "var S = window.enggDrawing.state;" +
    "var M = window.enggDrawing.model;" +
    "var body = JSON.parse(M.serializeDrawing(S));" +
    "var payload = window.enggDocumentFile.createDocument(body);" +
    "var json = JSON.stringify(payload);" +
    "var read = window.enggDocumentFile.readDocument(payload);" +
    "if (!read.ok) return { ok: false, detail: read.detail };" +
    "var restored = M.createDrawingState();" +
    "M.restoreDocument(restored, read.document);" +
    "var dims = restored.objects.filter(function (o) { return o.type === 'dimension'; });" +
    "var notes = restored.objects.filter(function (o) { return o.type === 'annotation'; });" +
    "return {" +
    "ok: true, version: payload.version," +
    "inFile: { sourceRefs: json.indexOf('sourceRefs') !== -1," +
    "placementMode: json.indexOf('placementMode') !== -1 }," +
    "dimensions: dims.length, annotations: notes.length," +
    "refsSurvived: dims.length > 0 && Array.isArray(dims[0].content.sourceRefs)," +
    "textSurvived: notes.length > 0 ? notes[0].content.text : null" +
    "};"
  ));

  /* The restored object must still MEASURE, and still FOLLOW. */
  log("measuresAfterReload", await ask(
    "var S = window.enggDrawing.state;" +
    "var M = window.enggDrawing.model;" +
    "var body = JSON.parse(M.serializeDrawing(S));" +
    "var read = window.enggDocumentFile.readDocument(window.enggDocumentFile.createDocument(body));" +
    "var restored = M.createDrawingState();" +
    "M.restoreDocument(restored, read.document);" +
    "restored.scale = { mmPerUnit: 1, unit: 'mm' };" +
    "var dim = restored.objects.find(function (o) { return o.type === 'dimension'; });" +
    "var c = dim.content;" +
    "var asDimension = { dimensionType: c.dimensionType, sourceRefs: c.sourceRefs," +
    "  placement: c.placement, style: {} };" +
    "var before = window.enggDimensionModel.formatMeasurement(asDimension, restored);" +
    "var beam = restored.objects.find(function (o) { return o.type === 'beam'; });" +
    "beam.geometry.end.x = 400;" +
    "var after = window.enggDimensionModel.formatMeasurement(asDimension, restored);" +
    "return { before: before, after: after, followed: before !== after };"
  ));

  log("moveIsIndependent", await ask(
    "var S = window.enggDrawing.state;" +
    "var beam = S.objects.find(function (o) { return o.type === 'beam'; });" +
    "var before = JSON.stringify(beam.geometry);" +
    "var dim = S.objects.find(function (o) { return o.type === 'dimension'; });" +
    "dim.content.placement = { x: 500, y: 500 };" +
    "return { beamUnchanged: JSON.stringify(beam.geometry) === before," +
    "placement: dim.content.placement };"
  ));

  log("annotationMoveIsIndependent", await ask(
    "var S = window.enggDrawing.state;" +
    "var beam = S.objects.find(function (o) { return o.type === 'beam'; });" +
    "var before = JSON.stringify(beam.geometry);" +
    "var note = S.objects.find(function (o) { return o.type === 'annotation'; });" +
    "note.content.sourceFeatureId = beam.id;" +
    "window.enggAnnotationModel.moveAnnotation(" +
    "  note.content, { x: 400, y: 200 });" +
    "return { beamUnchanged: JSON.stringify(beam.geometry) === before," +
    "linkIntact: note.content.sourceFeatureId === beam.id," +
    "placement: note.content.placement," +
    "placementMode: note.content.placementMode };"
  ));

  log("delete", await ask(
    "var S = window.enggDrawing.state;" +
    "var M = window.enggDrawing.model;" +
    "var before = S.objects.length;" +
    "var dim = S.objects.find(function (o) { return o.type === 'dimension'; });" +
    "M.removeObject(S, dim.id);" +
    "return { before: before, after: S.objects.length," +
    "dimensionsLeft: S.objects.filter(function (o) { return o.type === 'dimension'; }).length," +
    "annotationStillThere: S.objects.some(function (o) { return o.type === 'annotation'; }) };"
  ));

  await page.screenshot({ path: "shots/dimension-wiring.png" });

  return out;
}
