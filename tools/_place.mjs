/*
 * DOES ONE CLICK OR TWO PLACE A DIAGRAM?
 *
 * The source says two: drawing.js:22677 reads `hadSource` BEFORE
 * `beginOrCompleteGeometry` runs, so the first click can only name the
 * body and the second commits. A probe that watched the object count said
 * one. Those cannot both be right, and the difference is one field.
 *
 * So this watches the INTERACTION, not the object list. `sourceId` is the
 * thing `hadSource` is derived from, and reading it either side of the
 * click says exactly what that click did:
 *
 *   sourceId null -> set, no object   = picked the body, as documented
 *   sourceId null -> set, object made = picked AND committed in one click
 *
 * The precondition is checked first and the run ABORTS if it does not
 * hold, because arming with a body already selected is what made every
 * previous attempt of this test meaningless.
 */
export default async function run(page) {
  const errors = [];
  page.on("pageerror", (e) =>
    errors.push(String(e.message || e).slice(0, 200)),
  );

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("http://localhost:3000/", { waitUntil: "load" });
  await page.waitForTimeout(1200);

  /* Capture the live state, INCLUDING the interaction. */
  await page.evaluate(() => {
    const bridge = document.createElement("script");
    bridge.textContent = `
      (function () {
        var host = document.createElement("pre");
        host.id = "__model";
        host.style.display = "none";
        document.body.appendChild(host);

        var captured = null;
        var api = window.enggDrawingState;
        var original = api.addObject;

        api.addObject = function (state) {
          captured = state;
          return original.apply(this, arguments);
        };

        window.__dump = function () {
          if (!captured) return "ERROR: not captured";
          var i = captured.interaction || {};
          return JSON.stringify({
            tool: captured.activeTool,
            phase: i.phase,
            mode: i.analysisMode,
            kind: i.analysisKind,
            sourceId: i.sourceId === undefined ? "UNSET" : i.sourceId,
            selected: captured.selection.selectedObjectIds,
            analysis: (captured.objects || []).filter(function (o) {
              return o.type === "analysis-diagram";
            }).length
          });
        };
      })();
    `;
    document.body.appendChild(bridge);
  });

  const read = async () => {
    await page.evaluate(() => {
      const bridge = document.createElement("script");
      bridge.textContent =
        'document.getElementById("__model").textContent = window.__dump();';
      document.body.appendChild(bridge);
    });
    await page.waitForTimeout(150);
    const raw = await page.evaluate(
      () => document.getElementById("__model").textContent,
    );
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  };

  await page.evaluate(() => {
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(900);

  const rect = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });

  const click = async (x, y) => {
    await page.mouse.move(x, y);
    await page.waitForTimeout(220);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(700);
  };

  const openStatics = () =>
    page.evaluate(() => {
      document
        .querySelector('.drawing-category[data-category="STATICS"]')
        .click();
    });
  const pick = (id) =>
    page.evaluate((t) => {
      document.querySelector(`.drawing-tool[data-tool-id="${t}"]`).click();
    }, id);
  const sub = (id) =>
    page.evaluate((t) => {
      document
        .querySelector(
          `.drawing-coordinate-submenu-item[data-submenu-id="${t}"]`,
        )
        .click();
    }, id);
  const chooseMode = (m) =>
    page.evaluate((label) => {
      [...document.querySelectorAll(".drawing-coordinate-submenu-item")]
        .find((b) => b.textContent.trim() === label)
        .click();
    }, m);

  /* ONE beam. */
  await openStatics();
  await page.waitForTimeout(400);
  await pick("body");
  await page.waitForTimeout(300);
  await sub("beam");
  await page.waitForTimeout(400);
  await click(rect.left + rect.width * 0.3, rect.top + rect.height * 0.45);
  await click(rect.left + rect.width * 0.6, rect.top + rect.height * 0.45);
  await page.waitForTimeout(600);

  /* CLEAR the selection, and prove it. */
  await openStatics();
  await page.waitForTimeout(400);
  await pick("select");
  await page.waitForTimeout(400);
  await click(rect.left + rect.width * 0.1, rect.top + rect.height * 0.85);

  const cleared = await read();

  if (cleared.selected && cleared.selected.length) {
    return {
      errors,
      aborted: "precondition failed: selection not cleared",
      cleared,
    };
  }

  /* ARM. */
  await openStatics();
  await page.waitForTimeout(400);
  await pick("shear-force-diagram");
  await page.waitForTimeout(400);
  await chooseMode("Sketch");
  await page.waitForTimeout(800);

  const armed = await read();

  /* THE CLICK, once, on the beam. */
  await click(rect.left + rect.width * 0.45, rect.top + rect.height * 0.45);
  await page.waitForTimeout(800);

  const afterFirst = await read();

  /* Escape, then report. Nothing is placed further. */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);

  const afterEscape = await read();

  return {
    errors,
    cleared,
    armed: {
      phase: armed.phase,
      mode: armed.mode,
      kind: armed.kind,
      sourceId: armed.sourceId,
      analysis: armed.analysis,
    },
    afterFirstClick: {
      phase: afterFirst.phase,
      sourceId: afterFirst.sourceId,
      analysis: afterFirst.analysis,
    },
    afterEscape: {
      phase: afterEscape.phase,
      analysis: afterEscape.analysis,
    },
  };
}
