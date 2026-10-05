/*
 * DOES A SUPPORT ATTACH WHERE IT WAS CLICKED?
 *
 * The same shape as the moment test, for the same reason: support
 * placement was reported as "always at the same end of the body", and
 * that claim was made from screenshots. It is checked here against the
 * model instead.
 *
 * A Pin Support may go anywhere along a body, so a pin placed at a third
 * of the beam should be AT a third of the beam. A Fixed Support may only
 * go on an endpoint, and that is the interesting contrast: if a fixed
 * support also lands at a third, the endpoint rule is not being applied
 * and the two supports are behaving identically when they must not.
 *
 * Every value is read from the live model, through the same bridge, so
 * nothing here depends on what a symbol happens to look like.
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

        window.__supportProbe = [];

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
            supportProbe: window.__supportProbe,
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

  const openStatics = () =>
    page.evaluate(() => {
      document
        .querySelector('.drawing-category[data-category="STATICS"]')
        .click();
    });

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

  /* A level beam, so a fraction along it is unambiguous. */
  await openStatics();
  await page.waitForTimeout(400);
  await pickTool("body");
  await page.waitForTimeout(300);
  await submenu("beam");
  await page.waitForTimeout(400);
  await click(box.x, box.y);
  await click(box.x + 300, box.y);

  const withBeam = await read();
  const beam = withBeam.objects.find((o) => o.type === "beam");

  const start = beam.geometry.start;
  const end = beam.geometry.end;

  /*
   * THE FRACTION ALONG THE BEAM, from the model's own world coordinates.
   * This is the number the whole file is about, and it comes from the
   * beam rather than from screen pixels.
   */
  const fractionOf = (point) => {
    if (!point) return null;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSq = dx * dx + dy * dy;
    if (!lengthSq) return null;
    return (
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq
    );
  };

  /*
   * PLACE A SUPPORT.
   *
   * The flow is the shared one: pick the support, click the body to
   * choose it, then click again to give the attachment point. Both
   * clicks are made, because a flow that commits on the first click
   * would be found here as well - the count would rise when it should
   * not.
   */
  const placeSupport = async (toolId, subId, fraction, label) => {
    const x = Math.round(box.x + 300 * fraction);

    await openStatics();
    await page.waitForTimeout(400);
    await pickTool(toolId);
    await page.waitForTimeout(300);
    await submenu(subId);
    await page.waitForTimeout(500);

    /* First click: choose the body. */
    await click(x, box.y);

    const afterBody = await read();
    out[`phaseAfterBody_${label}`] = afterBody.phase;
    out[`interactionAfterBody_${label}`] =
      afterBody.interaction
        ? {
            phase: afterBody.interaction.phase,
            staticsTarget: afterBody.interaction.staticsTarget,
            attachmentPoints:
              afterBody.interaction.attachmentPoints
          }
        : null;

    /* Second click: the attachment point. */
    await click(x, box.y);

    const after = await read();
    out[`phaseAfterAttach_${label}`] = after.phase;

    const supports = (after.objects || []).filter(
      (o) => o.type && /support/.test(o.type),
    );

    const support = supports[supports.length - 1];

    return {
      clickedFraction: fraction,
      count: supports.length,
      support: support
        ? {
            type: support.type,
            position: support.geometry.position,
            parentId: support.parentId,
            attachment: support.geometry.attachment,
            t: support.geometry.t
          }
        : null
    };
  };

  out.pinAtAThird = await placeSupport(
    "support",
    "pin-support",
    0.33,
    "pin33",
  );
  out.pinAtTwoThirds = await placeSupport(
    "support",
    "pin-support",
    0.67,
    "pin67",
  );
  out.rollerAtHalf = await placeSupport(
    "support",
    "roller-support",
    0.5,
    "roller50",
  );
  out.fixedAtThird = await placeSupport(
    "support",
    "fixed-support",
    0.33,
    "fixed33",
  );

  /* Recovered fractions, from the model. */
  out.recovered = {
    pinA: fractionOf(out.pinAtAThird.support?.position),
    pinB: fractionOf(out.pinAtTwoThirds.support?.position),
    roller: fractionOf(out.rollerAtHalf.support?.position),
    fixed: fractionOf(out.fixedAtThird.support?.position)
  };

  /*
   * A COMPACT RESULT, because a full model dump is truncated by the
   * reporter and a truncated report of the one number that matters is
   * useless.
   */
  out.FINDING = {
    supportProbe: (await read()).supportProbe,
    fixedRecovered: out.recovered.fixed,
    fixedCount: out.fixedAtThird.count,
    pinARecovered: out.recovered.pinA,
    pinBRecovered: out.recovered.pinB,
    rollerRecovered: out.recovered.roller,
    fixedParent: out.fixedAtThird.support?.parentId ?? null
  };

  return out;
}
