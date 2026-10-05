/*
 * OPEN A REAL PROPERTY PANEL, AND SEE WHETHER ANY OF IT IS CLIPPED.
 *
 * THE GESTURE, which took five attempts to establish from the source:
 *
 *   Clicking a feature SELECTS it and shows the feature TREE. Clicking the
 *   SAME feature again opens its editing page. `featurePanelView` is
 *   explicit state - "tree" or "edit" - and only the second click flips it.
 *
 * Every earlier scan clicked once, then clicked a tree row, and so measured
 * the tree. The tree has no property rows in it, which is why every scan
 * found nothing clipped and I reported that as "no cut-off text".
 *
 * So: click the feature TWICE on the canvas, and only then measure.
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

  /*
   * A label is clipped when the text needs more room than the box gives it,
   * and the box does not let it spill or shorten it. An ellipsis is a
   * deliberate shortening; a hard clip is a layout failure, and the two are
   * told apart by the computed overflow rather than by eye.
   */
  const scan = () =>
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
              text: text.slice(0, 46),
              needs: el.scrollWidth,
              has: el.clientWidth,
              overflow: style.overflow,
            });
          }
        }
      });

      return {
        headline: panel.textContent.replace(/\s+/g, " ").trim().slice(0, 110),
        offenders,
      };
    });

  /* SELECT TWICE: once to pick, once to open the editor. */
  const openPanel = async (x, y, label) => {
    await click(x, y);
    await click(x, y);

    const result = await scan();

    return { label, ...result };
  };

  const panels = [];

  /* A beam. */
  await openStatics();
  await page.waitForTimeout(400);
  await pick("body");
  await page.waitForTimeout(300);
  await sub("beam");
  await page.waitForTimeout(400);
  await click(rect.left + rect.width * 0.3, rect.top + rect.height * 0.4);
  await click(rect.left + rect.width * 0.6, rect.top + rect.height * 0.4);
  await page.waitForTimeout(500);

  await openStatics();
  await page.waitForTimeout(400);
  await pick("select");
  await page.waitForTimeout(400);
  panels.push(
    await openPanel(
      rect.left + rect.width * 0.45,
      rect.top + rect.height * 0.4,
      "beam",
    ),
  );

  /* A pin support - one of the longer property labels. */
  await openStatics();
  await page.waitForTimeout(400);
  await pick("support");
  await page.waitForTimeout(300);
  await sub("pin-support");
  await page.waitForTimeout(500);
  await click(rect.left + rect.width * 0.45, rect.top + rect.height * 0.47);
  await page.waitForTimeout(800);

  await openStatics();
  await page.waitForTimeout(400);
  await pick("select");
  await page.waitForTimeout(400);
  panels.push(
    await openPanel(
      rect.left + rect.width * 0.45,
      rect.top + rect.height * 0.47,
      "pin support",
    ),
  );

  /* The Vector Scale control, wherever it lives in the edit view. */
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
