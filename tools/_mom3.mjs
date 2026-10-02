/*
 * DOES AN APPLIED MOMENT ATTACH WHERE IT WAS CLICKED?
 *
 * Earlier attempts to test this read the drawing through bounding boxes,
 * and the numbers from two different runs were compared against each
 * other - which is how a bug came to be reported that was not there.
 * So this file works from the MODEL, and compares the committed
 * application point against the world position of the click that chose
 * it.
 *
 * The test that matters: two moments on ONE beam, clicked at opposite
 * ends. If the application point follows the cursor they are far apart in
 * the model. If something snaps both to one place, they share a position
 * - and the model says so exactly, with no pixels involved.
 */
export default async function run(page) {
  const out = { errors: [] };

  page.on("pageerror", (e) =>
    out.errors.push(String(e.message || e).slice(0, 200)),
  );

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("http://localhost:3000/", { waitUntil: "load" });
  await page.waitForTimeout(1200);

  /* The bridge: capture the live state the app already passes around. */
  await page.evaluate(() => {
    const bridge = document.createElement("script");
    bridge.textContent = `
      (function () {
        var host = document.createElement("pre");
        host.id = "__model_dump";
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
            phase:
              captured.interaction && captured.interaction.phase,
            interaction: captured.interaction,
            objects: (captured.objects || []).map(function (o) {
              return {
                id: o.id,
                type: o.type,
                parentId: o.parentId,
                geometry: o.geometry
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
        'document.getElementById("__model_dump").textContent = window.__dump();';
      document.body.appendChild(bridge);
    });
    await page.waitForTimeout(150);
    const raw = await page.evaluate(
      () => document.getElementById("__model_dump").textContent,
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
  await page.waitForTimeout(800);

  const box = await page.evaluate(() => {
    const r = document
      .querySelector(".drawing-canvas")
      .getBoundingClientRect();
    return { x: r.left + r.width * 0.2, y: r.top + r.height * 0.45 };
  });

  const click = async (x, y) => {
    await page.mouse.move(x, y);
    await page.waitForTimeout(220);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(700);
  };

  const pickTool = (id) =>
    page.evaluate((t) => {
      document
        .querySelector(`.drawing-tool[data-tool-id="${t}"]`)
        .click();
    }, id);

  const submenu = (id) =>
    page.evaluate((t) => {
      document
        .querySelector(
          `.drawing-coordinate-submenu-item[data-submenu-id="${t}"]`,
        )
        .click();
    }, id);

  const openStatics = () =>
    page.evaluate(() => {
      document
        .querySelector('.drawing-category[data-category="STATICS"]')
        .click();
    });

  /* One beam, drawn level so a quarter along it is unambiguous. */
  await openStatics();
  await page.waitForTimeout(400);
  await pickTool("body");
  await page.waitForTimeout(300);
  await submenu("beam");
  await page.waitForTimeout(400);
  await click(box.x, box.y);
  await click(box.x + 300, box.y);

  const withBeam = await read();
  out.beam = withBeam.objects?.find((o) => o.type === "beam");

  /*
   * THE CRITICAL MEASUREMENT: the world position under a given screen
   * point. Taken from the beam's own endpoints, which are in the model,
   * rather than from pixels.
   */
  const beamStart = out.beam.geometry.start;
  const beamEnd = out.beam.geometry.end;

  /*
   * Screen x for a fraction along the beam, by comparing the two world
   * points to the two screen points the beam was drawn between. This is
   * a linear map and it is exact for a level beam.
   */
  const fractionAt = (f) =>
    Math.round(box.x + (box.x + 300 - box.x) * f);

  /*
   * PLACE A MOMENT AT A FRACTION ALONG THE BEAM.
   *
   * The documented flow: first click fixes the application point, the
   * pointer then sizes the arc, and a second click commits. So this
   * returns the click position AND what the model recorded, and the
   * comparison between them is the whole test.
   */
  const placeMoment = async (f, label) => {
    const x = fractionAt(f);

    await openStatics();
    await page.waitForTimeout(400);
    await pickTool("moment");
    await page.waitForTimeout(300);
    await submenu("applied-moment");
    await page.waitForTimeout(500);

    /* First click: the application point. */
    await click(x, box.y);

    const afterFirst = await read();
    out[`phase_${label}`] = afterFirst.phase;

    /* Move away to size the arc, then commit. */
    await page.mouse.move(x + 25, box.y + 30);
    await page.waitForTimeout(300);

    /*
     * COMMIT BY ENTER, NOT BY A SECOND CLICK.
     *
     * There are two documented ways out of this phase - a second click
     * (drawing.js:9859) and Enter (25977) - and both call the same
     * commit. If Enter works and the click does not, the commit is fine
     * and the CLICK ROUTING is broken, which is a completely different
     * bug in a completely different place.
     */
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);

    const after = await read();

    /*
     * THE PHASE AFTER THE COMMITTING CLICK. Without this the result is
     * just "no moment", which does not distinguish a commit that was
     * never reached from one that was reached and failed.
     */
    out[`phaseAfterCommit_${label}`] = after.phase;
    out[`interactionAfterFirst_${label}`] = afterFirst.interaction;
    out[`objectTypes_${label}`] = (after.objects || []).map(
      (o) => o.type,
    );

    const moments = (after.objects || []).filter(
      (o) => o.type === "moment",
    );

    const moment = moments[moments.length - 1];

    return {
      clickScreenX: x,
      fraction: f,
      momentCount: moments.length,
      moment: moment
        ? {
            position: moment.geometry.position,
            start: moment.geometry.start,
            parentId: moment.parentId
          }
        : null
    };
  };

  out.atQuarter = await placeMoment(0.25, "quarter");
  out.atThreeQuarter = await placeMoment(0.75, "threeQuarter");

  /*
   * WHAT THE MODEL SAYS. The fraction along the beam is recovered from
   * the world geometry, so a moment at the quarter is near 0.25 and a
   * moment at three quarters is near 0.75. Two moments sharing a
   * position is the failure this file exists to catch.
   */
  const fractionOf = (point) => {
    if (!point) return null;
    const dx = beamEnd.x - beamStart.x;
    const dy = beamEnd.y - beamStart.y;
    const lengthSq = dx * dx + dy * dy;
    if (!lengthSq) return null;
    return (
      ((point.x - beamStart.x) * dx + (point.y - beamStart.y) * dy) /
      lengthSq
    );
  };

  out.recovered = {
    quarter: fractionOf(
      out.atQuarter.moment?.position ||
        out.atQuarter.moment?.start,
    ),
    threeQuarter: fractionOf(
      out.atThreeQuarter.moment?.position ||
        out.atThreeQuarter.moment?.start,
    ),
  };

  out.beamWorld = { start: beamStart, end: beamEnd };

  /*
   * A COMPACT RESULT.
   *
   * The full model is large enough to be truncated by the reporter, and a
   * truncated report of the one number the test exists to produce is
   * useless - which is how the previous run came back uninformative. So
   * the finding is reduced to a few numbers, on its own, last.
   */
  out.FINDING = {
    quarterPhaseAfterFirst: out.phase_quarter,
    quarterPhaseAfterEnter: out.phaseAfterCommit_quarter,
    quarterTypesAfterEnter: out.objectTypes_quarter,
    quarterCountAfterEnter: out.atQuarter.momentCount,
    threeQuarterCountAfterEnter: out.atThreeQuarter.momentCount,
    quarterRecoveredFraction: out.recovered.quarter,
    threeQuarterRecoveredFraction: out.recovered.threeQuarter,
    quarterPosition: out.atQuarter.moment?.position ?? null,
    threeQuarterPosition: out.atThreeQuarter.moment?.position ?? null,
    quarterParent: out.atQuarter.moment?.parentId ?? null,
    threeQuarterParent: out.atThreeQuarter.moment?.parentId ?? null
  };

  return out;
}
