/*
 * THE TWO THINGS I COULD NOT PROVE BEFORE, TRIED PROPERLY.
 *
 * Both previous attempts failed the same way: the diagram was left
 * SELECTED when the next tool was armed, so the tool adopted the body and
 * the click I meant as "pick a body" actually committed a diagram. Escape
 * then ran on finished work and correctly did nothing.
 *
 * So this clears the selection FIRST, through the app, and checks it took
 * before arming anything - a precondition that is verified rather than
 * assumed, because assuming it is what made the last two runs useless.
 *
 * The panel scan opens REAL property panels by clicking the tree row with
 * a real mouse click. Calling .click() on the row did nothing, which is
 * why every earlier scan silently measured the feature TREE instead of a
 * panel and reported "no cut-off text" about the wrong element.
 */
export default async function run(page) {
  const errors = [];
  page.on("pageerror", (e) =>
    errors.push(String(e.message || e).slice(0, 200)),
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

  const rect = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();

    return {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
    };
  });

  const click = async (x, y) => {
    await page.mouse.move(x, y);
    await page.waitForTimeout(200);
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

  /* A beam, with its middle well inside the canvas. */
  const b0 = {
    x: rect.left + rect.width * 0.3,
    y: rect.top + rect.height * 0.45,
  };
  const b1 = {
    x: rect.left + rect.width * 0.65,
    y: rect.top + rect.height * 0.45,
  };

  await openStatics();
  await page.waitForTimeout(400);
  await pick("body");
  await page.waitForTimeout(300);
  await sub("beam");
  await page.waitForTimeout(400);
  await click(b0.x, b0.y);
  await click(b1.x, b0.y);
  await page.waitForTimeout(600);

  /* ==== 1. CLEAR THE SELECTION, AND CHECK IT TOOK ==== */

  await openStatics();
  await page.waitForTimeout(400);
  await pick("select");
  await page.waitForTimeout(400);

  /* A measured point on the canvas that is not on the beam. */
  await click(rect.left + rect.width * 0.12, rect.top + rect.height * 0.8);

  const cleared = await read();

  /* If this is not empty, everything below is measuring the wrong thing. */
  if (cleared.selected && cleared.selected.length) {
    return {
      errors,
      aborted: "selection did not clear; precondition failed",
      selected: cleared.selected,
    };
  }

  /* ==== 2. ARM WITH NOTHING SELECTED, PICK A BODY, THEN ESCAPE ==== */

  await openStatics();
  await page.waitForTimeout(400);
  await pick("shear-force-diagram");
  await page.waitForTimeout(400);
  await chooseMode("Sketch");
  await page.waitForTimeout(700);

  const armed = await read();
  const analysisBefore = armed.objects.filter(
    (o) => o.type === "analysis-diagram",
  ).length;

  /* This click picks the BODY - the tool has nothing to commit onto yet. */
  await click((b0.x + b1.x) / 2, b0.y);
  await page.waitForTimeout(600);

  const afterPick = await read();

  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);

  const afterEscape = await read();

  /* ==== 3. REAL PROPERTY PANELS, SCANNED FOR CUT-OFF TEXT ==== */

  /*
   * OPENS THE PROPERTIES, and reports whether it actually got there.
   *
   * Every earlier scan read the feature tree and found nothing clipped,
   * because the properties are a level deeper and .click() on the row did
   * not navigate. A real mouse click at the row's own coordinates does.
   */
  const openRow = async (label) => {
    const row = await page.evaluate((text) => {
      const el = [
        ...document.querySelectorAll(
          "#drawingProperties button, #drawingProperties li, #drawingProperties [role=button], #drawingProperties a",
        ),
      ].find((n) => n.textContent.trim() === text);

      if (!el) return null;

      const r = el.getBoundingClientRect();

      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, label);

    if (!row) return false;

    await click(row.x, row.y);

    return true;
  };

  const scanPanel = () =>
    page.evaluate(() => {
      const panel = document.getElementById("drawingProperties");

      const offenders = [];

      panel.querySelectorAll("*").forEach((el) => {
        const text = (el.textContent || "").trim();

        if (
          !text ||
          el.children.length > 0 ||
          text.length < 4 ||
          /^[0-9.,\-+×°]*$/.test(text)
        ) {
          return;
        }

        if (el.scrollWidth > el.clientWidth + 1) {
          const style = window.getComputedStyle(el);

          if (
            style.textOverflow !== "ellipsis" &&
            style.overflow !== "visible"
          ) {
            offenders.push({
              text: text.slice(0, 44),
              needs: el.scrollWidth,
              has: el.clientWidth,
              overflow: style.overflow,
            });
          }
        }
      });

      return {
        opened: /Distance|Length|Anchor|Direction|Magnitude/i.test(
          panel.textContent,
        ),
        headline: panel.textContent.replace(/\s+/g, " ").trim().slice(0, 90),
        offenders,
      };
    });

  const panels = {};

  /* The beam's own properties. */
  if (await openRow("Beam")) {
    panels.beam = await scanPanel();
  }

  /* A support, whose panel is the longest of the simple ones. */
  await openStatics();
  await page.waitForTimeout(400);
  await pick("support");
  await page.waitForTimeout(300);
  await sub("pin-support");
  await page.waitForTimeout(500);
  await click((b0.x + b1.x) / 2, b0.y + 40);
  await page.waitForTimeout(900);

  if (await openRow("Pin Support")) {
    panels.pinSupport = await scanPanel();
  }

  /* The Vector Scale control itself. */
  await openStatics();
  await page.waitForTimeout(400);
  await pick("select");
  await page.waitForTimeout(400);

  panels.vectorScale = await page.evaluate(() => {
    const sel = [
      ...document.querySelectorAll("#drawingProperties select"),
    ].find((s) => [...s.options].some((o) => /×/.test(o.textContent)));

    if (!sel) return null;

    return {
      options: [...sel.options].map((o) => o.textContent.trim()),
      value: sel.value,
    };
  });

  return {
    errors,
    escapeTest: {
      clearedSelection: cleared.selected,
      analysisBefore,
      analysisAfterPick: afterPick.objects.filter(
        (o) => o.type === "analysis-diagram",
      ).length,
      analysisAfterEscape: afterEscape.objects.filter(
        (o) => o.type === "analysis-diagram",
      ).length,
    },
    panels,
  };
}
