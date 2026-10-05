/*
 * PANEL LAYOUT, WITH NOTHING ASSUMED.
 *
 * Three runs of the earlier version died on the same line - the Statics
 * category button was null - and the survey shows the selector was RIGHT
 * all along: `drawing-category[data-category="STATICS"]` is there. The
 * panel simply had not rendered yet after the tab switch.
 *
 * So every wait here is a real wait for the thing to exist, and a run that
 * cannot reach a panel says so instead of silently measuring the tree.
 */
export default async function run(page) {
  const errors = [];
  page.on("pageerror", (e) =>
    errors.push(String(e.message || e).slice(0, 200)),
  );

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("http://localhost:3000/", { waitUntil: "load" });

  const waitFor = (selector, timeout = 25000) =>
    page.waitForFunction(
      (sel) => document.querySelector(sel) !== null,
      selector,
      { timeout },
    );

  /*
   * CLICK AN ELEMENT, via a real mouse click at its centre.
   *
   * Real clicks because a synthetic .click() did not navigate the panel in
   * earlier attempts, and waiting because an assumed element was null in
   * others. Both failures were the harness's, not the app's.
   */
  const clickEl = async (selector, timeout = 25000) => {
    await waitFor(selector, timeout);

    const box = await page.evaluate((sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();

      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, selector);

    await page.mouse.move(box.x, box.y);
    await page.waitForTimeout(180);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(650);
  };

  const clickAt = async (x, y) => {
    await page.mouse.move(x, y);
    await page.waitForTimeout(200);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(650);
  };

  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".tab")].some((b) =>
        /Engineering Drawing/i.test(b.textContent),
      ),
    null,
    { timeout: 25000 },
  );

  await clickEl(".tab");

  /* THE CATEGORY, once it exists. */
  await clickEl('.drawing-category[data-category="STATICS"]');

  const rect = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();

    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });

  const X = (f) => rect.left + rect.width * f;
  const Y = (f) => rect.top + rect.height * f;

  /* A beam. */
  await clickEl('.drawing-tool[data-tool-id="body"]');
  await clickEl('.drawing-coordinate-submenu-item[data-submenu-id="beam"]');
  await clickAt(X(0.25), Y(0.4));
  await clickAt(X(0.7), Y(0.4));

  /* A pin support on it. */
  await clickEl('.drawing-category[data-category="STATICS"]');
  await clickEl('.drawing-tool[data-tool-id="support"]');
  await clickEl(
    '.drawing-coordinate-submenu-item[data-submenu-id="pin-support"]',
  );
  await clickAt(X(0.3), Y(0.4));

  /* A distributed load over part of it. */
  await clickEl('.drawing-category[data-category="STATICS"]');
  await clickEl('.drawing-tool[data-tool-id="load"]');
  await clickEl(
    '.drawing-coordinate-submenu-item[data-submenu-id="distributed-load"]',
  );
  await clickAt(X(0.32), Y(0.4));
  await clickAt(X(0.55), Y(0.4));

  /* THE MEASUREMENT. `reached` guards it: a scan of the tree has no
   * inputs in it, and must not be reported as a clean panel. */
  const measure = () =>
    page.evaluate(() => {
      const panel = document.getElementById("drawingProperties");

      const inputs = panel.querySelectorAll("input, select, textarea").length;

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
              text: text.slice(0, 46),
              needs: el.scrollWidth,
              has: el.clientWidth,
            });
          }
        }
      });

      return {
        reached: inputs > 0,
        inputs,
        headline: panel.textContent.replace(/\s+/g, " ").trim().slice(0, 90),
        offenders,
      };
    });

  /*
   * OPEN A PANEL: click once to select, AGAIN to open the editor.
   * `featurePanelView` is explicit state and only the second click flips
   * it - that is the whole reason six earlier scans measured the tree.
   */
  const openPanel = async (x, y, label) => {
    await clickEl('.drawing-category[data-category="STATICS"]');
    await clickEl('.drawing-tool[data-tool-id="select"]');

    await clickAt(x, y);
    await clickAt(x, y);

    return { label, ...(await measure()) };
  };

  const panels = [];

  panels.push(await openPanel(X(0.45), Y(0.4), "beam"));
  panels.push(await openPanel(X(0.3), Y(0.4), "pin support"));
  panels.push(await openPanel(X(0.5), Y(0.4), "load"));
  panels.push(await openPanel(X(0.6), Y(0.4), "far end"));

  /* AND AT A NARROWER WINDOW: the failure is a width failure. */
  await page.setViewportSize({ width: 900, height: 800 });
  await page.waitForTimeout(900);

  panels.push(await openPanel(X(0.45), Y(0.4), "beam (narrow)"));

  const vectorScale = await page.evaluate(() => {
    const sel = [
      ...document.querySelectorAll("#drawingProperties select"),
    ].find((s) => [...s.options].some((o) => /×/.test(o.textContent)));

    return sel
      ? {
          options: [...sel.options].map((o) => o.textContent.trim()),
          value: sel.value,
        }
      : null;
  });

  return { errors, panels, vectorScale };
}
