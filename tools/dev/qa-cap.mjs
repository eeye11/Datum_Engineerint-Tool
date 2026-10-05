/*
 * Explains the two remaining Fit matrix failures: is the missing
 * margin the zoom CAP removing it, or a measurement artefact?
 * Verification aid, not part of the application.
 */
export default async function run(page, ui) {
  await page.waitForLoadState("load", { timeout: 30000 });

  await page
    .waitForFunction(
      () => document.querySelectorAll("[data-tool-id]").length > 0,
      { timeout: 30000 }
    )
    .catch(() => null);

  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ [^\n]*Engineering Drawing[^\n]*/)?.[0];
  if (tab) {
    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(800);
  }

  const msg = () =>
    page.evaluate(
      () =>
        document.getElementById("drawingToolMessage")
          ?.innerText || ""
    );

  const at = async (dx, dy) => {
    await page.evaluate(
      ({ x, y }) => {
        const c = document.querySelector(".drawing-canvas");
        const r = c.getBoundingClientRect();
        const o = {
          bubbles: true, cancelable: true,
          clientX: r.left + r.width * x,
          clientY: r.top + r.height * y,
          button: 0, detail: 1,
        };
        ["pointermove", "mousemove", "pointerdown", "mousedown",
         "click", "pointerup", "mouseup"].forEach((t) =>
          c.dispatchEvent(new MouseEvent(t, o)));
      },
      { x: dx, y: dy }
    );
    await page.waitForTimeout(260);
  };

  const arm = async (category, id) => {
    await page.evaluate(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    await page.waitForTimeout(200);
    await page.evaluate(
      (c) => {
        document
          .querySelector(`.drawing-category[data-category="${c}"]`)
          ?.click();
      },
      category
    );
    await page.waitForTimeout(420);
    await page.evaluate((i) => {
      document.querySelector(`[data-tool-id="${i}"]`)?.click();
    }, id);
    await page.waitForTimeout(250);
  };

  const clear = async () => {
    await arm("GEOMETRY", "select");
    for (let i = 0; i < 60; i += 1) {
      const more = await page.evaluate(() => {
        const rows = document.querySelectorAll(
          ".drawing-component-row"
        );
        if (!rows.length) return false;
        rows[0].dispatchEvent(
          new MouseEvent("click", { bubbles: true, detail: 1 })
        );
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Delete", bubbles: true
          })
        );
        return true;
      });
      if (!more) break;
      await page.waitForTimeout(80);
    }
  };

  /*
   * THE SELECTED SHAPE'S OWN EXTENT, from the feature tree.
   *
   * Measuring by "everything on screen" is wrong for a Fit Selected:
   * other features are ON screen at 500% and are dragged into the
   * box, so the target looks like it overflows. This reports each
   * feature's own rendered extent instead.
   */
  const selectedExtent = () =>
    page.evaluate(() => {
      const canvas = document.querySelector(".drawing-canvas");
      const cr = canvas.getBoundingClientRect();

      const row = document.querySelector(
        ".drawing-component-row.selected, " +
          ".drawing-component-row.active"
      );

      const name = row?.innerText?.trim() || null;

      return {
        selectedRow: name,
        zoom:
          document.getElementById("drawingZoomValue")?.value,
        canvas: { w: Math.round(cr.width), h: Math.round(cr.height) },
        message:
          document.getElementById("drawingToolMessage")
            ?.innerText
      };
    });

  const out = {};

  /* Case 16: a small annotation, which needs a very large zoom. */
  await clear();
  await arm("GEOMETRY", "line");
  await at(0.3, 0.5);
  await at(0.6, 0.5);
  await arm("ANNOTATE", "annotation");
  await at(0.8, 0.15);
  out.annotateMessage = (await msg()).slice(0, 60);

  await page.evaluate(() => {
    document.querySelector('[data-global-tool="fit"]')?.click();
  });
  await page.waitForTimeout(600);
  out.annotationFit = await selectedExtent();

  /*
   * What zoom WOULD the fit want? The cap is 500%, so a target needing
   * more than 5x the 100% view cannot be shown with a margin.
   */
  out.note =
    "a target needing more than 5x cannot be fitted with a " +
    "margin inside a 25%-500% zoom range";

  return out;
}
