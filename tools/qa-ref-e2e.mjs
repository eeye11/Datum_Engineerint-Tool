/*
 * The full Drawing Reference acceptance flow, driven through the real
 * UI: draw a sheet, insert a reference into the written solution,
 * render it, and inspect what ended up inside the solution container.
 * Verification aid, not part of the application.
 */
export default async function run(page, ui) {
  await page.waitForLoadState("load", { timeout: 20000 });

  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ button "Engineering Drawing"/)?.[0];

  if (!tab) return { error: "no drawing tab", snap };

  await ui.click(tab.match(/@e\d+/)[0]);
  await page.waitForTimeout(800);

  const out = {};

  /* ---- 1. Draw content on Sheet 1. ---- */
  out.drawn = await page.evaluate(() => {
    const canvas = document.querySelector(".drawing-canvas");
    const r = canvas.getBoundingClientRect();

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
      ].forEach((t) => {
        canvas.dispatchEvent(new MouseEvent(t, opts));
      });
    };

    /* A line, a rectangle and a circle: several objects, so the
           figure has something to show. */
    document.querySelector('[data-tool-id="line"]')?.click();
    clickAt(0.15, 0.15);
    clickAt(0.45, 0.45);

    document.querySelector('[data-tool-id="rectangle"]')?.click();
    clickAt(0.55, 0.15);
    clickAt(0.85, 0.4);

    document.querySelector('[data-tool-id="circle"]')?.click();
    clickAt(0.7, 0.7);
    clickAt(0.5, 0.7);

    return true;
  });
  await page.waitForTimeout(600);

  out.sheet = await page.evaluate(() => {
    const s = window.enggDrawingSheets;
    const id = s.activeSheetId();
    const sheet = s.sheetById(id);

    return {
      id,
      name: sheet?.name,
      count: sheet?.objects?.length,
      types: sheet?.objects?.map((o) => o.type),
    };
  });

  /* ---- 2. Insert a reference into the written solution. ---- */
  out.inserted = await page.evaluate(() => {
    const editor = document.getElementById("writingInput");
    const select = document.getElementById("referenceSheetSelect");
    const caption = document.getElementById("referenceCaption");
    const insert = document.getElementById("referenceInsert");

    if (!editor || !insert) {
      return {
        error: "missing controls",
        haveEditor: Boolean(editor),
        haveInsert: Boolean(insert),
        haveSelect: Boolean(select),
      };
    }

    const sheets = window.enggDrawingSheets.all();

    editor.value =
      "The free-body diagram is:\n\n\n" + "Therefore the reactions follow.";

    if (select) {
      select.value = sheets[0]?.id ?? "";
    }

    if (caption) {
      caption.value = "";
    }

    insert.click();

    return {
      source: editor.value,
      options: select ? select.options.length : 0,
    };
  });
  await page.waitForTimeout(900);

  /* ---- 3. What is actually inside the rendered solution? ---- */
  out.output = await page.evaluate(() => {
    const output = document.getElementById("writingOutput");

    if (!output) {
      return { error: "no writingOutput" };
    }

    const text = output.innerText || "";

    return {
      hasToken: /DRAWING_REFERENCE/.test(output.innerHTML),
      hasFigure: Boolean(output.querySelector(".drawing-reference-figure")),
      hasFrame: Boolean(output.querySelector(".drawing-reference-frame")),
      svgCount: output.querySelectorAll("svg").length,
      /* The placeholder the whole bug was about. */
      saysEmpty: /this sheet is empty/i.test(text),
      saysMissing: /no longer in this document/i.test(text),
      text: text.slice(0, 300),
    };
  });

  return out;
}
