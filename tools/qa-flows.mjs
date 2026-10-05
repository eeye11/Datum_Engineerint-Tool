/*
 * Determines, for each tool, whether it is free-space or ATTACHING.
 * The Fit matrix depends on getting this right, and the two groups
 * need different click flows. Verification aid.
 */
export default async function run(page, ui) {
  await page.waitForLoadState("load", { timeout: 30000 });

  await page
    .waitForFunction(
      () => document.querySelectorAll("[data-tool-id]").length > 0,
      { timeout: 30000 },
    )
    .catch(() => null);

  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ [^\n]*Engineering Drawing[^\n]*/)?.[0];
  if (tab) {
    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(800);
  }

  const msg = () =>
    page.evaluate(
      () => document.getElementById("drawingToolMessage")?.innerText || "",
    );

  const shapes = () =>
    page.evaluate(() => {
      const svg = document.querySelector(".drawing-canvas svg");
      if (!svg) return 0;
      return Array.from(
        svg.querySelectorAll("path,line,rect,circle,polygon,polyline"),
      ).filter((el) => !el.classList.contains("drawing-engineering-grid"))
        .length;
    });

  const at = async (dx, dy) => {
    await page.evaluate(
      ({ x, y }) => {
        const c = document.querySelector(".drawing-canvas");
        const r = c.getBoundingClientRect();
        const o = {
          bubbles: true,
          cancelable: true,
          clientX: r.left + r.width * x,
          clientY: r.top + r.height * y,
          button: 0,
          detail: 1,
        };
        [
          "pointermove",
          "mousemove",
          "pointerdown",
          "mousedown",
          "click",
          "pointerup",
          "mouseup",
        ].forEach((t) => c.dispatchEvent(new MouseEvent(t, o)));
      },
      { x: dx, y: dy },
    );
    await page.waitForTimeout(260);
  };

  const clear = async () => {
    await page.evaluate(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    await page.waitForTimeout(200);

    for (let i = 0; i < 60; i += 1) {
      const more = await page.evaluate(() => {
        const rows = document.querySelectorAll(".drawing-component-row");
        if (!rows.length) return false;
        rows[0].dispatchEvent(
          new MouseEvent("click", { bubbles: true, detail: 1 }),
        );
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Delete",
            bubbles: true,
          }),
        );
        return true;
      });
      if (!more) break;
      await page.waitForTimeout(80);
    }
  };

  const arm = async (category, id) => {
    await page.evaluate(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    await page.waitForTimeout(200);
    await page.evaluate((c) => {
      document
        .querySelector(`.drawing-category[data-category="${c}"]`)
        ?.click();
    }, category);
    await page.waitForTimeout(420);
    await page.evaluate((i) => {
      document.querySelector(`[data-tool-id="${i}"]`)?.click();
    }, id);
    await page.waitForTimeout(250);
    return await msg();
  };

  const trials = [
    ["GEOMETRY", "arc"],
    ["STATICS", "truss"],
    ["STATICS", "cable"],
    ["STATICS", "shaft"],
    ["STATICS", "load"],
    ["STATICS", "varying-load"],
  ];

  const out = {};

  for (const [category, id] of trials) {
    /* FREE SPACE, two clicks. */
    await clear();
    const armed = await arm(category, id);
    await at(0.3, 0.4);
    await at(0.7, 0.4);
    out[`${id}:free`] = {
      armed,
      shapes: await shapes(),
      after: (await msg()).slice(0, 40),
    };

    /* OVER AN EXISTING LINE, two clicks. */
    await clear();
    await arm("GEOMETRY", "line");
    await at(0.2, 0.5);
    await at(0.8, 0.5);
    const armed2 = await arm(category, id);
    await at(0.5, 0.5);
    await at(0.5, 0.25);
    out[`${id}:onLine`] = {
      armed: armed2,
      shapes: await shapes(),
      after: (await msg()).slice(0, 40),
    };
  }

  return out;
}
