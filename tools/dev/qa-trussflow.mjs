/*
 * Traces a Truss and a Support from arming through to commit, so the
 * last two Fit cases can use a flow that actually creates them.
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

    return await msg();
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
    return await msg();
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

  const state = () =>
    page.evaluate(() => {
      const panel = document.getElementById("drawingProperties");
      return {
        rows: Array.from(
          panel?.querySelectorAll(".drawing-component-row") || []
        ).map((r) => r.innerText.replace(/\s+/g, " ").trim().slice(0, 30))
      };
    });

  const out = {};

  /* --- TRUSS: members, then Enter --- */
  await clear();
  await arm("STATICS", "truss");
  out.trussArmed = (await msg()).slice(0, 60);
  out.t1 = (await at(0.2, 0.3)).slice(0, 40);
  out.t2 = (await at(0.8, 0.3)).slice(0, 40);
  out.t3 = (await at(0.2, 0.7)).slice(0, 40);
  out.t4 = (await at(0.8, 0.7)).slice(0, 40);
  out.trussBeforeEnter = await state();
  await page.evaluate(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
  });
  await page.waitForTimeout(400);
  out.trussAfterEnter = await state();
  out.trussMessage = (await msg()).slice(0, 50);

  /* --- SUPPORT: click on a body --- */
  await clear();
  await arm("GEOMETRY", "line");
  await at(0.2, 0.5);
  await at(0.8, 0.5);
  out.supportArmed = (await arm("STATICS", "support")).slice(0, 60);
  out.s1 = await at(0.5, 0.5);
  out.supportAfterClick = await state();
  out.supportMessage = (await msg()).slice(0, 50);

  return out;
}
