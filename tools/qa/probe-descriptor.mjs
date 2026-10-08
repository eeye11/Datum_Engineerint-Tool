export default async function run(page) {
  await page.evaluate(async () => {
    await import("/src/main.js");
  });
  await page.waitForFunction(
    () => !!(window.enggDrawing && window.enggDrawing.state),
    { timeout: 15000 },
  );

  const tab = page.locator("button", { hasText: "Engineering Drawing" }).first();
  if (await tab.count()) await tab.click();
  await page.waitForTimeout(900);

  return page.evaluate(async () => {
    const st = window.enggDrawing.state;
    const D = window.enggDrawingState;

    st.objects.length = 0;
    st.selection.selectedObjectIds = [];

    const t = D.geometryFactories.triangle([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 0, y: 30 },
    ]);

    D.addObject(st, t);

    const inference = await import("/src/editor/dimension-inference.js");

    const reference = inference.dimensionReferenceAtClick(
      {},
      { x: 20, y: 2 },
      false,
    );

    const second = inference.dimensionReferenceAtClick(
      {},
      { x: 2, y: 15 },
      false,
    );

    const describe = (d) =>
      d
        ? {
            dimensionType: d.dimensionType,
            refs: (d.refs || []).length,
          }
        : null;

    return {
      reference: reference
        ? { kind: reference.kind, anchor: reference.anchor, endAnchor: reference.endAnchor }
        : null,
      second: second
        ? { kind: second.kind, anchor: second.anchor, endAnchor: second.endAnchor }
        : null,
      singleDescriptor: describe(
        inference.inferDimensionDescriptor(reference, null),
      ),
      pairDescriptor: describe(
        inference.inferDimensionDescriptor(reference, second),
      ),
    };
  });
}
