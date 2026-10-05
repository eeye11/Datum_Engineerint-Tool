/*
 * A Truss and a Support created the way they are actually used:
 * each ATTACHES to existing geometry, so a body must exist first and
 * the first click lands ON it.
 * Verification aid, not part of the application.
 */
export default async function run(page, ui) {
  await page.waitForLoadState("load", { timeout: 30000 });

  await page
    .waitForFunction(
      () => document.querySelectorAll("[data-tool-id]").length > 0,
      { timeout: 30000 }
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
      () =>
        document.getElementById("drawingToolMessage")
          ?.innerText || ""
    );

  const at = async (dx, dy) => {
    await page.evaluate(
      ({ x, y }) => {
        const c = document.querySelector(".drawing-canvas");
        const r = c.getBoundingClientRect();
        const o = {
          bubbles: true, cancelable: true,
          clientX: r.left + r.width * x,
          clientY: r.top + r.height * y,
          button: 0, detail: 1,
        };
        ["pointermove", "mousemove", "pointerdown", "mousedown",
         "click", "pointerup", "mouseup"].forEach((t) =>
          c.dispatchEvent(new MouseEvent(t, o)));
      },
      { x: dx, y: dy }
    );
    await page.waitForTimeout(280);
    return (await msg()).slice(0, 44);
  };

  const arm = async (category, id) => {
    await page.evaluate(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    await page.waitForTimeout(200);
    await page.evaluate(
      (c) => {
        document
          .querySelector(`.drawing-category[data-category="${c}"]`)
          ?.click();
      },
      category
    );
    await page.waitForTimeout(420);
    await page.evaluate((i) => {
      document.querySelector(`[data-tool-id="${i}"]`)?.click();
    }, id);
    await page.waitForTimeout(250);
    return (await msg()).slice(0, 44);
  };

  const clear = async () => {
    await arm("GEOMETRY", "select");
    for (let i = 0; i < 60; i += 1) {
      const more = await page.evaluate(() => {
        const rows = document.querySelectorAll(
          ".drawing-component-row"
        );
        if (!rows.length) return false;
        rows[0].dispatchEvent(
          new MouseEvent("click", { bubbles: true, detail: 1 })
        );
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Delete", bubbles: true
          })
        );
        return true;
      });
      if (!more) break;
      await page.waitForTimeout(80);
    }
  };

  const rows = () =>
    page.evaluate(() =>
      Array.from(
        document.getElementById("drawingProperties")
          ?.querySelectorAll(".drawing-component-row") || []
      ).map((r) => r.innerText.replace(/\s+/g, " ").trim().slice(0, 28))
    );

  const out = {};

  /* --- SUPPORT on a line --- */
  await clear();
  await arm("GEOMETRY", "line");
  await at(0.15, 0.55);
  await at(0.85, 0.55);
  out.supportArmed = await arm("STATICS", "support");
  out.s1 = await at(0.5, 0.55);
  out.supportRows = await rows();

  /* --- TRUSS attached to that line --- */
  out.trussArmed = await arm("STATICS", "truss");
  out.tr1 = await at(0.5, 0.55);
  out.tr2 = await at(0.25, 0.8);
  out.tr3 = await at(0.75, 0.8);
  out.trussRows = await rows();

  await page.evaluate(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
  });
  await page.waitForTimeout(400);
  out.trussAfterEnter = await rows();

  /* --- Fit Whole Page, then each one selected --- */
  await page.evaluate(() => {
    document.querySelector('[data-global-tool="fit"]')?.click();
  });
  await page.waitForTimeout(500);
  out.pageZoom = await page.evaluate(
    () => document.getElementById("drawingZoomValue")?.value
  );

  const selectByName = async (needle) =>
    page.evaluate((n) => {
      const list = Array.from(
        document.querySelectorAll(".drawing-component-row")
      );
      const hit = list.find((r) =>
        r.innerText.toLowerCase().includes(n.toLowerCase())
      );
      hit?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 })
      );
      return hit ? hit.innerText.trim().slice(0, 24) : null;
    }, needle);

  await arm("GEOMETRY", "select");

  out.trussPicked = await selectByName("truss");
  await page.evaluate(() => {
    document.querySelector('[data-global-tool="fit"]')?.click();
  });
  await page.waitForTimeout(500);
  out.trussSelectedZoom = await page.evaluate(
    () => document.getElementById("drawingZoomValue")?.value
  );

  await arm("GEOMETRY", "select");
  out.supportPicked = await selectByName("support");
  await page.evaluate(() => {
    document.querySelector('[data-global-tool="fit"]')?.click();
  });
  await page.waitForTimeout(500);
  out.supportSelectedZoom = await page.evaluate(
    () => document.getElementById("drawingZoomValue")?.value
  );

  return out;
}
