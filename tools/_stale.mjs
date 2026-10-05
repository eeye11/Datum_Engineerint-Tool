/*
 * DOES A CANCELLED DIAGRAM LEAVE ANYTHING BEHIND, OR INHERIT?
 *
 * Two questions that both come down to the same thing - the analysis
 * interaction is a state machine, and a state machine is only as good as
 * its resets:
 *
 *   1. ORPHANS. Deleting a diagram must leave no group on the canvas. The
 *      renderer rebuilds from the model each frame, so an orphan would
 *      mean something is holding a reference outside the model - which is
 *      worth proving rather than assuming, because it is exactly the
 *      failure that looks like "delete does nothing".
 *
 *   2. INHERITANCE. Start an SFD Sketch, cancel it, then start a BMD Plot.
 *      The second must not pick up the first's body, range, offset or
 *      mode. An interaction that is reset rather than replaced carries its
 *      previous body across, and the student gets a diagram attached to a
 *      member they did not choose.
 */
export default async function run(page) {
  const out = { errors: [] };

  page.on("pageerror", (e) =>
    out.errors.push(String(e.message || e).slice(0, 200)),
  );

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("http://localhost:3000/", { waitUntil: "load" });
  await page.waitForTimeout(1200);

  /* Capture the live state the app already passes around. */
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
          return JSON.stringify({
            tool: captured.activeTool,
            phase: captured.interaction && captured.interaction.phase,
            mode: captured.interaction && captured.interaction.analysisMode,
            sourceId: captured.interaction && captured.interaction.sourceId,
            objects: (captured.objects || []).map(function (o) {
              return {
                id: o.id,
                type: o.type,
                kind: o.geometry && o.geometry.diagramType,
                mode: o.geometry && o.geometry.mode,
                sourceOffset: o.geometry && o.geometry.sourceOffset
              };
            })
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

  const box = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return { x: r.left + r.width * 0.15, y: r.top + r.height * 0.35 };
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

  /* ONE beam, so a second diagram has a body available to inherit. */
  await openStatics();
  await page.waitForTimeout(400);
  await pick("body");
  await page.waitForTimeout(300);
  await sub("beam");
  await page.waitForTimeout(400);
  await click(box.x, box.y);
  await click(box.x + 320, box.y);
  await page.waitForTimeout(500);

  const beamId = (await read()).objects.find((o) => o.type === "beam").id;

  /* ==== PART 1: ORPHANS AFTER DELETE ==== */

  await openStatics();
  await page.waitForTimeout(400);
  await pick("shear-force-diagram");
  await page.waitForTimeout(400);
  await chooseMode("Sketch");
  await page.waitForTimeout(600);
  await click(box.x + 160, box.y + 150);
  await page.waitForTimeout(900);

  const beforeDelete = await read();
  const diagramId = beforeDelete.objects.find(
    (o) => o.type === "analysis-diagram",
  )?.id;

  const groupsBefore = await page.evaluate(
    () => document.querySelectorAll(".drawing-renderer g").length,
  );

  await openStatics();
  await page.waitForTimeout(400);
  await pick("select");
  await page.waitForTimeout(400);
  await click(box.x + 160, box.y + 150);
  await page.waitForTimeout(600);
  await page.keyboard.press("Delete");
  await page.waitForTimeout(900);

  const afterDelete = await read();
  const groupsAfter = await page.evaluate(
    () => document.querySelectorAll(".drawing-renderer g").length,
  );

  out.deleteCheck = {
    modelAnalysis: afterDelete.objects.filter(
      (o) => o.type === "analysis-diagram",
    ).length,
    modelBeams: afterDelete.objects.filter((o) => o.type === "beam").length,
    groupsBefore,
    groupsAfter,
    diagramId,
  };

  /* ==== PART 2: ESCAPE, THEN A DIFFERENT DIAGRAM ==== */

  await openStatics();
  await page.waitForTimeout(400);
  await pick("shear-force-diagram");
  await page.waitForTimeout(400);
  await chooseMode("Sketch");
  await page.waitForTimeout(600);

  const armed = await read();
  out.onArming = {
    phase: armed.phase,
    mode: armed.mode,
    sourceId: armed.sourceId,
    isOurBeam: armed.sourceId === beamId,
  };

  /* Pick a body, then Escape before placing. */
  await click(box.x + 160, box.y);
  await page.waitForTimeout(500);
  const midArm = await read();

  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);

  const afterEscape = await read();

  out.afterEscape = {
    phase: afterEscape.phase,
    mode: afterEscape.mode,
    sourceId: afterEscape.sourceId,
    analysis: afterEscape.objects.filter((o) => o.type === "analysis-diagram")
      .length,
  };

  /* A DIFFERENT diagram type and mode must start clean. */
  await openStatics();
  await page.waitForTimeout(400);
  await pick("bending-moment-diagram");
  await page.waitForTimeout(400);
  await chooseMode("Plot");
  await page.waitForTimeout(600);

  const bmdArmed = await read();

  out.bmdOnArming = {
    phase: bmdArmed.phase,
    mode: bmdArmed.mode,
    sourceId: bmdArmed.sourceId,
  };

  await click(box.x + 160, box.y + 150);
  await page.waitForTimeout(900);

  const bmdPlaced = await read();
  const bmd = bmdPlaced.objects.find(
    (o) => o.type === "analysis-diagram" && o.kind === "bmd",
  );

  out.bmdPlaced = {
    mode: bmd?.mode,
    kind: bmd?.kind,
    offset: bmd?.sourceOffset,
    analysisTotal: bmdPlaced.objects.filter(
      (o) => o.type === "analysis-diagram",
    ).length,
  };

  return out;
}
