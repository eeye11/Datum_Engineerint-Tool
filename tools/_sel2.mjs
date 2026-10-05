/*
 * THREE THINGS THE BROWSER CAN ANSWER AND NODE CANNOT.
 *
 * 1. SELECTION. Every part of a diagram - axes, curve, frame, labels -
 *    must resolve to the one analysis feature. Clicking an arrowhead and
 *    selecting a different object is the failure, and it is invisible to a
 *    model test because the model has no idea what was clicked.
 *
 * 2. ESCAPE. The earlier probe armed the tool with a body already
 *    selected, so its next click COMMITTED rather than selecting. Armed
 *    with nothing selected, the first click picks the body and Escape
 *    must then leave no feature behind.
 *
 * 3. CUT-OFF TEXT. A label truncated mid-word is a layout fact - measured
 *    by comparing the text's own width with the width of the box holding
 *    it - and not something a screenshot reliably shows at small sizes.
 */
export default async function run(page) {
  const out = { errors: [] };

  page.on("pageerror", (e) =>
    out.errors.push(String(e.message || e).slice(0, 200)),
  );

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("http://localhost:3000/", { waitUntil: "load" });
  await page.waitForTimeout(1200);

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
            selected: captured.selection.selectedObjectIds,
            objects: (captured.objects || []).map(function (o) {
              return { id: o.id, type: o.type };
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
    await page.waitForTimeout(650);
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

  /* A beam, then a PLOT diagram with a real curve on it. */
  await openStatics();
  await page.waitForTimeout(400);
  await pick("body");
  await page.waitForTimeout(300);
  await sub("beam");
  await page.waitForTimeout(400);
  await click(box.x, box.y);
  await click(box.x + 320, box.y);
  await page.waitForTimeout(500);

  await openStatics();
  await page.waitForTimeout(400);
  await pick("shear-force-diagram");
  await page.waitForTimeout(400);
  await chooseMode("Plot");
  await page.waitForTimeout(600);
  await click(box.x + 160, box.y + 150);
  await page.waitForTimeout(900);

  /* ==== 1. SELECTION, PART BY PART ==== */

  /*
   * WHERE THE DIAGRAM ACTUALLY IS, read from the drawn group so the
   * clicks land on real parts of it rather than on guessed coordinates.
   */
  const parts = await page.evaluate(() => {
    const g = [...document.querySelectorAll(".drawing-renderer g")].find((x) =>
      (x.dataset.featureId || "").startsWith("analysis-diagram"),
    );

    if (!g) return null;

    const r = document
      .querySelector(".drawing-renderer")
      .getBoundingClientRect();

    const at = (el) => {
      const b = el.getBBox();

      return {
        x: r.left + b.x + b.width / 2,
        y: r.top + b.y + b.height / 2,
      };
    };

    const lines = [...g.querySelectorAll("line")];
    const axis = lines.sort(
      (a, b) =>
        Math.abs(+b.getAttribute("x2") - +b.getAttribute("x1")) -
        Math.abs(+a.getAttribute("x2") - +a.getAttribute("x1")),
    )[0];

    const curve = [...g.querySelectorAll("path")].find((p) =>
      (p.getAttribute("d") || "").startsWith("M"),
    );

    const label = [...g.querySelectorAll("text")].find(
      (t) => t.textContent === "x (m)",
    );

    const rb = g.getBoundingClientRect();

    return {
      id: g.dataset.featureId,
      axis: axis ? at(axis) : null,
      curve: curve ? at(curve) : null,
      label: label ? at(label) : null,
      /* Somewhere inside the frame but not on anything drawn. */
      inside: {
        x: rb.left + rb.width / 2,
        y: rb.top + rb.height * 0.85,
      },
    };
  });

  out.parts = parts
    ? {
        id: parts.id,
        hasAxis: Boolean(parts.axis),
        hasCurve: Boolean(parts.curve),
        hasLabel: Boolean(parts.label),
      }
    : "no diagram";

  await openStatics();
  await page.waitForTimeout(400);
  await pick("select");
  await page.waitForTimeout(500);

  const selections = {};

  for (const part of ["axis", "curve", "label", "inside"]) {
    if (!parts || !parts[part]) continue;

    await click(parts[part].x, parts[part].y);

    const model = await read();

    selections[part] = model.selected;
  }

  out.selections = selections;

  /* ==== 2. ESCAPE, WITH NOTHING ALREADY SELECTED ==== */

  /*
   * Start from a CLEAN selection. The earlier probe armed the tool while
   * the beam was still selected, so the tool adopted it and the next
   * click committed a diagram rather than picking a body - which is what
   * made that run unable to test Escape at all.
   */
  await page.evaluate(() => {
    const api = document.getElementById("__model");
    void api;
  });

  await click(box.x - 400, box.y - 300); /* empty sheet, deselects */
  await page.waitForTimeout(500);

  const cleared = await read();
  out.selectionBeforeEscapeTest = cleared.selected;

  await openStatics();
  await page.waitForTimeout(400);
  await pick("shear-force-diagram");
  await page.waitForTimeout(400);
  await chooseMode("Sketch");
  await page.waitForTimeout(600);

  await click(box.x + 160, box.y); /* picks the BODY, does not commit */
  await page.waitForTimeout(600);

  const armedWithBody = await read();
  out.analysisBeforeEscape = armedWithBody.objects.filter(
    (o) => o.type === "analysis-diagram",
  ).length;

  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);

  const afterEscape = await read();
  out.afterEscape = {
    analysis: afterEscape.objects.filter((o) => o.type === "analysis-diagram")
      .length,
  };

  /* ==== 3. CUT-OFF TEXT IN THE PANEL ==== */

  out.cutOff = await page.evaluate(() => {
    const panel = document.getElementById("drawingProperties");

    if (!panel) return "no panel";

    /*
     * A label is cut off when the text needs more room than it has been
     * given AND there is no ellipsis - because an ellipsis is a deliberate
     * shortening and a hard clip is a layout failure.
     */
    const offenders = [];

    panel.querySelectorAll("*").forEach((el) => {
      const text = (el.textContent || "").trim();

      if (
        !text ||
        el.children.length > 0 ||
        text.length < 4 ||
        /^[0-9.\-+]*$/.test(text)
      ) {
        return;
      }

      if (el.scrollWidth > el.clientWidth + 1) {
        const style = window.getComputedStyle(el);

        const clipped =
          style.textOverflow === "ellipsis" || style.overflow === "visible";

        if (!clipped) {
          offenders.push({
            text: text.slice(0, 40),
            scroll: el.scrollWidth,
            client: el.clientWidth,
            overflow: style.overflow,
          });
        }
      }
    });

    return offenders;
  });

  return out;
}
