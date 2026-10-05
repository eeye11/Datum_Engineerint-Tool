/*
 * A shared QA bridge helper.
 *
 * The driver runs in an isolated world, so it can neither read the
 * app's globals nor call anything defined in the main world. The
 * request is handed over through the DOM: a <script> tag added to
 * the PAGE (whose loader evaluates it in the main world) watches a
 * request node, and the JSON answer is read back out of a response
 * node.
 */

export async function ensureBridge(page) {
  const installed = await page.evaluate(() => {
    if (document.getElementById("__qa_req")) return true;
    for (const id of ["__qa_req", "__qa_res"]) {
      const d = document.createElement("div");
      d.id = id;
      d.style.display = "none";
      document.body.appendChild(d);
    }
    if (!document.getElementById("__qa_bridge")) {
      const s = document.createElement("script");
      s.id = "__qa_bridge";
      s.src = "/tools/qa-bridge.js";
      document.body.appendChild(s);
    }
    return false;
  });

  if (!installed) {
    await page.waitForTimeout(400);
  }
}

/** Run `fn` inside the page's main world, optionally with a JSON arg. */
export async function mainWorld(page, fn, arg) {
  await ensureBridge(page);

  const request = JSON.stringify({ src: `(${fn.toString()})`, arg: arg ?? null });

  await page.locator("#__qa_req").evaluate(
    (el, src) => {
      el.textContent = src;
    },
    request
  );

  await page.waitForFunction(
    () => (document.getElementById("__qa_res")?.textContent || "").length > 0,
    null,
    { timeout: 5000 }
  );

  const raw = await page
    .locator("#__qa_res")
    .evaluate(el => el.textContent);

  const parsed = JSON.parse(raw);

  if (!parsed.ok) {
    throw new Error(`page threw: ${parsed.error}`);
  }

  return parsed.out;
}

/**
 * The drawing's document state, as plain JSON.
 *
 * World units are NOT screen pixels: the canvas has its own camera,
 * so a length is only meaningful once it has been run through the
 * document scale. Everything below reports each feature's size in
 * MILLIMETRES, which is the quantity the student actually typed.
 */
export function readState(page) {
  return mainWorld(page, () => {
    const s = window.enggDrawing.state;
    const scale = window.enggDimensions.readScale(s);

    const mm = world =>
      window.enggDimensions.toEngineering(s, world).value;

    return {
      calibrated: window.enggDimensions.isCalibrated(s),
      mmPerUnit: scale ? scale.mmPerUnit : null,
      unit: scale ? scale.unit : null,
      objects: s.objects.map(o => {
        const g = o.geometry || {};

        const span =
          g.start && g.end
            ? Math.hypot(
                g.end.x - g.start.x,
                g.end.y - g.start.y
              )
            : null;

        return {
          type: o.type,
          id: o.id,
          /*
           * A Statics tool may reuse an ordinary geometry
           * primitive - a Point Force is stored as a "force" and
           * records which tool made it - so the creating tool is
           * reported alongside the primitive type.
           */
          staticsType: o.engineering?.staticsType ?? null,
          spanMm: span === null ? null : mm(span),
          slope:
            g.start && g.end && g.end.x !== g.start.x
              ? (g.end.y - g.start.y) / (g.end.x - g.start.x)
              : null,
          widthMm: g.width === undefined ? null : mm(g.width),
          heightMm: g.height === undefined ? null : mm(g.height),
          diameterMm:
            g.radius === undefined ? null : mm(g.radius * 2),
          radiusMm: g.radius === undefined ? null : mm(g.radius)
        };
      })
    };
  });
}

/** Switch to the Engineering Drawing tab. */
export async function openDrawingTab(page) {
  await page.getByRole("button", { name: "Engineering Drawing" }).click();
  await page.waitForTimeout(1200);
}

/** Switch the rail to a discipline (GEOMETRY / STATICS / ...). */
export async function selectDiscipline(page, category) {
  await page.locator(`[data-category="${category}"]`).first().click();
  await page.waitForTimeout(400);
}

/*
 * Click a tool by its tool id.
 *
 * Geometry tools are rail buttons; Statics tools live inside category
 * submenus. Both disciplines are searched, so a caller never has to
 * know which is which.
 *
 * Every attempt is CONFIRMED against the application's own active
 * tool rather than assumed from the click succeeding. A click that
 * lands on nothing usable reports no error at all, so without that
 * check a failed activation looks identical to a successful one.
 */
export async function activate(page, toolId) {
  const isActive = () =>
    mainWorld(page, () => window.enggDrawing.state.activeTool);

  /*
   * EVERY discipline is searched, not just the two that hold geometry:
   * the Dimension tools live under ANNOTATE, and a caller should not
   * have to know which rail a tool happens to sit on.
   */
  for (const category of ["GEOMETRY", "ANNOTATE", "STATICS"]) {
    await selectDiscipline(page, category);

    if ((await isActive()) === toolId) {
      return;
    }

    const direct = page.locator(`[data-tool-id="${toolId}"]`).first();

    if (await direct.count()) {
      const opensMenu =
        (await direct.getAttribute("aria-haspopup")) === "menu";

      await direct.click();
      await page.waitForTimeout(300);

      if (!opensMenu && (await isActive()) === toolId) {
        return;
      }

      /*
       * The button opened a SUBMENU rather than starting the tool -
       * that is what the Arc button does. Its first item is the
       * tool's standard creation method, which is the one to take
       * when the caller only wants the tool running.
       */
      const firstItem = page.locator(
        ".drawing-coordinate-submenu-item"
      );

      if (await firstItem.count()) {
        await firstItem.first().click();
        await page.waitForTimeout(300);

        if ((await isActive()) === toolId) {
          return;
        }

        throw new Error(
          `submenu for "${toolId}" ran but the active tool is ` +
            `"${await isActive()}"`
        );
      }

      }

    /*
     * Not in the rail, so it must be a submenu item. Each submenu
     * parent is opened in turn - the same path a student takes.
     */
    for (const parent of await page
      .locator('[data-tool-id][aria-haspopup="menu"]')
      .all()) {
      await parent.click();
      await page.waitForTimeout(250);

      const item = page.locator(`[data-submenu-id="${toolId}"]`).first();

      if (await item.count()) {
        await item.click();
        await page.waitForTimeout(300);

        if ((await isActive()) === toolId) {
          return;
        }
      }

      await page.keyboard.press("Escape");
      await page.waitForTimeout(120);
    }
  }

  throw new Error(`could not activate tool "${toolId}"`);
}

export async function activateStrict(page, toolId) {
  await activate(page, toolId);

  const info = await mainWorld(page, () => ({
    active: window.enggDrawing.state.activeTool,
    phase: window.enggDrawing.state.interaction?.phase ?? null
  }));

  if (info.active !== toolId) {
    throw new Error(
      `wanted tool "${toolId}" active, but "${info.active}" is ` +
        `(phase=${info.phase})`
    );
  }
}

const POPUP = ".drawing-creation-dimension";

export function popup(page) {
  return page.locator(POPUP);
}

/**
 * Click a point on the canvas, in canvas-local pixels.
 *
 * The canvas is not square and its size depends on the window, so
 * the click is expressed as a FRACTION of the canvas rather than a
 * pixel. That keeps the point on the drawing no matter how the page
 * is laid out.
 */
export async function clickWorld(page, fx, fy) {
  const box = await page.locator(".drawing-canvas").first().boundingBox();
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(200);
}

/** Type a value into the popup's current field and press Enter. */
export async function answer(page, value) {
  const input = page.locator(".drawing-creation-dimension-input");
  await input.waitFor({ state: "visible", timeout: 4000 });
  await input.fill(String(value));
  await input.press("Enter");
  await page.waitForTimeout(200);
}

/*
 * Read a popup's optional text. The step and unit nodes are always
 * rendered, but a popup that has already closed has none, so a
 * missing node reads as "" rather than timing out the whole run.
 */
async function popupText(page, selector) {
  const node = page.locator(selector);
  if (!(await node.count())) return "";
  return (await node.first().textContent()) ?? "";
}

export function labelOf(page) {
  return popupText(page, ".drawing-creation-dimension-label");
}

export function stepOf(page) {
  return popupText(page, ".drawing-creation-dimension-step");
}

export function unitOf(page) {
  return popupText(page, ".drawing-creation-dimension-unit");
}
