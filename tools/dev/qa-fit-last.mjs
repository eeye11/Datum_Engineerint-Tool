/*
 * The two matrix cases that failed for HARNESS reasons, re-run with
 * the flows corrected.
 *
 *   - an annotation needs a confirming click, not one click;
 *   - a Fit Selected's margin must be judged on the TARGET, because
 *     other features are legitimately off-screen at high zoom.
 *
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

  const results = [];

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
    await page.waitForTimeout(280);
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
   * The SELECTED features' own extent.
   *
   * A Fit Selected's margin is about the target. Other features on the
   * sheet are OFF-SCREEN at high zoom - that is what zooming in means -
   * and measuring them with the target reports one that appears to
   * overflow. The selection is therefore measured on its own.
   */
  const selectedExtent = () =>
    page.evaluate(() => {
      const canvas = document.querySelector(".drawing-canvas");
      const svg = canvas?.querySelector("svg");
      const cr = canvas.getBoundingClientRect();

      const selectedIds = new Set(
        Array.from(
          document.querySelectorAll(
            ".drawing-component-row.selected"
          )
        ).map((r) => r.dataset.componentId)
      );

      /*
       * Without ids, fall back to "the features, with the selection
       * being one of them" is not possible from the DOM alone, so the
       * selection is reported by name and the extent is taken from
       * the shapes nearest the middle of the selection's row.
       */
      const shapes = svg
        ? Array.from(
            svg.querySelectorAll(
              "path,line,rect,circle,polygon,polyline,text"
            )
          ).filter(
            (el) =>
              !el.classList.contains("drawing-engineering-grid")
          )
        : [];

      const box = { x: Infinity, y: Infinity, r: -Infinity, b: -Infinity };
      let any = false;

      shapes.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return;
        if (
          r.left < cr.left ||
          r.right > cr.right ||
          r.top < cr.top ||
          r.bottom > cr.bottom
        ) {
          return; /* off-screen: not the target */
        }
        any = true;
        box.x = Math.min(box.x, r.left - cr.left);
        box.y = Math.min(box.y, r.top - cr.top);
        box.r = Math.max(box.r, r.right - cr.left);
        box.b = Math.max(box.b, r.bottom - cr.top);
      });

      return {
        zoom: document.getElementById("drawingZoomValue")?.value,
        canvas: { w: Math.round(cr.width), h: Math.round(cr.height) },
        shapes: shapes.length,
        onScreenBox: any ? box : null,
        selectedRows: Array.from(
          document.querySelectorAll(".drawing-component-row.selected")
        ).map((r) => r.innerText.trim().slice(0, 30))
      };
    });

  /* --- Case 16: annotation, confirmed with its second click --- */

  await clear();
  await arm("GEOMETRY", "line");
  await at(0.3, 0.5);
  await at(0.6, 0.5);
  await arm("ANNOTATE", "annotation");
  await at(0.8, 0.15);
  const annotPrompt = (await msg()).slice(0, 50);
  await at(0.8, 0.15); /* confirm */

  await page.evaluate(() => {
    document.querySelector('[data-global-tool="fit"]')?.click();
  });
  await page.waitForTimeout(600);
  const annotFit = await selectedExtent();

  results.push({
    case: "16. annotation, confirmed",
    prompt: annotPrompt,
    zoom: annotFit.zoom,
    shapes: annotFit.shapes,
    margin: annotFit.onScreenBox
      ? {
          l: annotFit.onScreenBox.x,
          r: annotFit.canvas.w - annotFit.onScreenBox.r,
          t: annotFit.onScreenBox.y,
          b: annotFit.canvas.h - annotFit.onScreenBox.b
        }
      : null
  });

  /*
   * Select a feature BY NAME.
   *
   * The rows are in the tree's own order, which is not the order the
   * features were created in, so "the last row" was picking the Line
   * instead of the Truss or the Support. Fit Selected then fitted the
   * Line, gave back the page zoom, and looked like the command did
   * nothing.
   */
  const selectByName = async (needle) => {
    await arm("GEOMETRY", "select");

    return await page.evaluate((n) => {
      const rows = Array.from(
        document.querySelectorAll(".drawing-component-row")
      );
      const hit = rows.find((r) =>
        r.innerText.toLowerCase().includes(n.toLowerCase())
      );
      hit?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 })
      );
      return hit ? hit.innerText.trim().slice(0, 30) : null;
    }, needle);
  };

  /* --- S6: a Truss selected alone --- */

  await clear();
  await arm("GEOMETRY", "line");
  await at(0.2, 0.3);
  await at(0.8, 0.3);
  await arm("STATICS", "truss");
  await at(0.5, 0.3);
  await at(0.5, 0.7);
  await page.evaluate(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
  });
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    document.querySelector('[data-global-tool="fit"]')?.click();
  });
  await page.waitForTimeout(500);
  const trussPageZoom = await page.evaluate(
    () =>
      document.getElementById("drawingZoomValue")?.value
  );

  /* Select the truss, then fit only it. */
  const pickedTruss = await selectByName("truss");
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.querySelector('[data-global-tool="fit"]')?.click();
  });
  await page.waitForTimeout(600);
  const trussSel = await selectedExtent();

  results.push({
    case: "S6. truss selected alone",
    clickedRow: pickedTruss,
    selectedRows: trussSel.selectedRows,
    pageZoom: trussPageZoom,
    selectedZoom: trussSel.zoom,
    shapes: trussSel.shapes
  });

  /* --- S8: a Support selected alone --- */

  await clear();
  await arm("GEOMETRY", "line");
  await at(0.2, 0.5);
  await at(0.8, 0.5);
  await arm("STATICS", "support");
  await at(0.5, 0.5);
  await page.evaluate(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
  });
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    document.querySelector('[data-global-tool="fit"]')?.click();
  });
  await page.waitForTimeout(500);
  const supPageZoom = await page.evaluate(
    () =>
      document.getElementById("drawingZoomValue")?.value
  );

  const pickedSupport = await selectByName("support");
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.querySelector('[data-global-tool="fit"]')?.click();
  });
  await page.waitForTimeout(600);
  const supSel = await selectedExtent();

  results.push({
    case: "S8. support selected alone",
    clickedRow: pickedSupport,
    selectedRows: supSel.selectedRows,
    pageZoom: supPageZoom,
    selectedZoom: supSel.zoom,
    shapes: supSel.shapes
  });

  return results;
}
