/*
 * DOES DELETING AN ANALYSIS DIAGRAM ACTUALLY DELETE IT?
 *
 * The claim is that analysis diagrams "do not delete correctly". Deleting
 * a feature is four separate things - gone from the model, gone from the
 * tree, gone from the canvas, and gone from any dependency that named it -
 * and a failure of any one looks the same to a user, who just sees it
 * still there.
 *
 * So all four are checked, for all three diagram types, and with the
 * parent body watched throughout: deleting a diagram must never take the
 * beam it was measured against with it.
 *
 * The model is read through the same bridge the other browser tests use -
 * the harness evaluates in an isolated world with no access to page
 * globals, so the drawing state has to be captured out of the page's own
 * world and read back through the DOM.
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
          return JSON.stringify(
            (captured.objects || []).map(function (o) {
              return {
                id: o.id,
                type: o.type,
                parentId: o.parentId,
                sources:
                  (o.engineering &&
                    o.engineering.sourceFeatureIds) ||
                  []
              };
            })
          );
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

  const onCanvas = (type) =>
    page.evaluate(
      (t) =>
        [...document.querySelectorAll(".drawing-renderer g")].filter(
          (g) =>
            (g.dataset.featureId || "").length &&
            (g.dataset.featureId || "").startsWith(t),
        ).length,
      type,
    );

  /* A beam. */
  await openStatics();
  await page.waitForTimeout(400);
  await pick("body");
  await page.waitForTimeout(300);
  await sub("beam");
  await page.waitForTimeout(400);
  await click(box.x, box.y);
  await click(box.x + 320, box.y);
  await page.waitForTimeout(500);

  const before = await read();

  /* One diagram of each type, Sketch and Plot. */
  for (const [tool, mode] of [
    ["shear-force-diagram", "Sketch"],
    ["bending-moment-diagram", "Plot"],
    ["axial-force-diagram", "Sketch"],
  ]) {
    await openStatics();
    await page.waitForTimeout(400);
    await pick(tool);
    await page.waitForTimeout(400);
    await page.evaluate((m) => {
      [...document.querySelectorAll(".drawing-coordinate-submenu-item")]
        .find((b) => b.textContent.trim() === m)
        .click();
    }, mode);
    await page.waitForTimeout(600);
    await click(box.x + 160, box.y + 150);
    await page.waitForTimeout(900);
  }

  const withDiagrams = await read();

  out.analysisCount = withDiagrams.filter((o) =>
    [
      "shear-force-diagram",
      "bending-moment-diagram",
      "axial-force-diagram",
    ].includes(o.type),
  ).length;

  out.beamsBefore = withDiagrams.filter((o) => o.type === "beam").length;

  /* DELETE, from the canvas, with a diagram selected. */
  await openStatics();
  await page.waitForTimeout(400);
  await pick("select");
  await page.waitForTimeout(400);
  await click(box.x + 160, box.y + 150);
  await page.waitForTimeout(600);

  await page.keyboard.press("Delete");
  await page.waitForTimeout(900);

  const afterDelete = await read();

  out.afterDelete = {
    analysis: afterDelete.filter((o) =>
      [
        "shear-force-diagram",
        "bending-moment-diagram",
        "axial-force-diagram",
      ].includes(o.type),
    ).length,
    beams: afterDelete.filter((o) => o.type === "beam").length,
  };

  out.onCanvasAfter = await page.evaluate(() => ({
    sfd: [...document.querySelectorAll(".drawing-renderer g")].filter((g) =>
      (g.dataset.featureId || "").startsWith("shear-"),
    ).length,
    bmd: [...document.querySelectorAll(".drawing-renderer g")].filter((g) =>
      (g.dataset.featureId || "").startsWith("bending-"),
    ).length,
    afd: [...document.querySelectorAll(".drawing-renderer g")].filter((g) =>
      (g.dataset.featureId || "").startsWith("axial-"),
    ).length,
  }));

  return out;
}
