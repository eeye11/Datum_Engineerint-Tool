/*
 * Reports the raw stored record for each analysis diagram, so the
 * name and diagramType can be checked directly rather than
 * inferred from the panel. Verification aid.
 */
export default async function run(page, ui) {
  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ button "Engineering Drawing"/)?.[0];

  if (!tab) return { error: "no drawing tab", snap };

  await ui.click(tab.match(/@e\d+/)[0]);
  await page.waitForTimeout(700);

  return await page.evaluate(() => {
    const canvas = document.querySelector(".drawing-canvas");
    const r = canvas.getBoundingClientRect();

    document
      .querySelector('.drawing-category[data-category="STATICS"]')
      ?.click();

    const clickAt = (dx, dy) => {
      const opts = {
        bubbles: true,
        cancelable: true,
        clientX: r.left + r.width * dx,
        clientY: r.top + r.height * dy,
        button: 0,
        detail: 1,
      };

      [
        "pointermove",
        "mousemove",
        "pointerdown",
        "mousedown",
        "click",
        "pointerup",
        "mouseup",
      ].forEach((type) => {
        canvas.dispatchEvent(new MouseEvent(type, opts));
      });
    };

    const place = (toolId, dy) => {
      document.querySelector(`[data-tool-id="${toolId}"]`)?.click();

      clickAt(0.15, dy);
      clickAt(0.75, dy);
    };

    place("shear-force-diagram", 0.25);
    place("bending-moment-diagram", 0.45);
    place("axial-force-diagram", 0.65);

    const state =
      window.enggDrawingState?.getState?.() ?? window.__drawingState ?? null;

    return {
      hasState: Boolean(state),
      diagrams: (state?.objects ?? window.enggDrawingState?.objects ?? [])
        .filter(
          (o) =>
            o.type === "analysis-diagram" || /SFD|BMD|AFD/.test(o.name || ""),
        )
        .map((o) => ({
          type: o.type,
          name: o.name,
          diagramType: o.geometry?.diagramType,
        })),
    };
  });
}
