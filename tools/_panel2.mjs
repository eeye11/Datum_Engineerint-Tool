/*
 * Is the Features panel readable, and is Vector Scale present once?
 *
 * Measures GEOMETRY, not screenshots. Two things make an earlier scan
 * useless, and both are corrected here:
 *
 *   - The panel's default view is the feature TREE, not the properties
 *     page. `featurePanelView` is explicit state - "tree" or "edit" - and
 *     only a SECOND click on the same feature opens editing. A scan that
 *     clicks once measures a list, and a list has no property rows in it.
 *   - The properties live in #drawingProperties. #drawingFeaturesBack is
 *     the shell around them and can be collapsed to nothing, so measuring
 *     it reports a 51px panel with no controls in it.
 */
export default async function run(page) {
  const out = { errors: [], panels: [], vectorScale: null };
  page.on("pageerror", (e) => out.errors.push(String(e.message).slice(0, 160)));

  await page.setViewportSize({ width: 1400, height: 950 });
  await page.goto("http://localhost:3000/", { waitUntil: "load" });
  await page.waitForTimeout(1500);

  await page.evaluate(() =>
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click(),
  );
  await page.waitForTimeout(900);

  const r = await page.evaluate(() => {
    const b = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return { l: b.left, t: b.top, w: b.width, h: b.height };
  });

  const click = async (x, y) => {
    await page.mouse.move(x, y);
    await page.waitForTimeout(200);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(650);
  };
  const cat = (c) =>
    page.evaluate((k) => {
      const b = document.querySelector(
        `.drawing-category[data-category="${k}"]`,
      );
      if (b) b.click();
    }, c);
  const tool = (id) =>
    page.evaluate((t) => {
      const b = document.querySelector(`.drawing-tool[data-tool-id="${t}"]`);
      if (!b) throw new Error("no tool button: " + t);
      b.click();
    }, id);
  const sub = (id) =>
    page.evaluate((t) => {
      const i = document.querySelector(
        `.drawing-coordinate-submenu-item[data-submenu-id="${t}"]`,
      );
      if (i) i.click();
    }, id);

  /* Build one of each, then measure its panel. */
  const steps = [
    {
      n: "beam",
      make: async () => {
        await tool("body");
        await sub("beam");
        await click(r.l + r.w * 0.25, r.t + r.h * 0.4);
        await click(r.l + r.w * 0.55, r.t + r.h * 0.4);
      },
      at: [0.4, 0.4],
    },
    {
      n: "pin-support",
      make: async () => {
        await tool("support");
        await sub("pin-support");
        await click(r.l + r.w * 0.45, r.t + r.h * 0.4);
        await click(r.l + r.w * 0.45, r.t + r.h * 0.4);
      },
      at: [0.4, 0.47],
    },
    {
      n: "point-force",
      make: async () => {
        await tool("point-force");
        await click(r.l + r.w * 0.4, r.t + r.h * 0.4);
        await click(r.l + r.w * 0.4, r.t + r.h * 0.28);
      },
      at: [0.4, 0.34],
    },
    {
      n: "distributed-load",
      make: async () => {
        await tool("load");
        await sub("distributed-load");
        await click(r.l + r.w * 0.3, r.t + r.h * 0.4);
        await click(r.l + r.w * 0.5, r.t + r.h * 0.4);
        await page.mouse.move(r.l + r.w * 0.4, r.t + r.h * 0.28);
        await page.waitForTimeout(300);
        await page.mouse.down();
        await page.waitForTimeout(60);
        await page.mouse.up();
        await page.waitForTimeout(600);
      },
      at: [0.3, 0.33],
    },
    {
      n: "applied-moment",
      make: async () => {
        await tool("moment");
        await sub("applied-moment");
        await click(r.l + r.w * 0.35, r.t + r.h * 0.4);
      },
      at: [0.35, 0.4],
    },
  ];

  const scan = () =>
    page.evaluate(() => {
      const panel = document.getElementById("drawingProperties");
      if (!panel) return { err: "no #drawingProperties" };

      const pr = panel.getBoundingClientRect();
      const clipped = [];

      panel.querySelectorAll("*").forEach((el) => {
        const t = (el.textContent || "").trim();
        if (!t || el.children.length > 0 || t.length < 4) return;
        if (/^[0-9.,\-+×°]*$/.test(t)) return;

        const st = window.getComputedStyle(el);

        /* A hard clip is a layout failure; an ellipsis is a deliberate
         shortening. Only the first is a defect. */
        if (
          el.scrollWidth > el.clientWidth + 1 &&
          st.textOverflow !== "ellipsis" &&
          st.overflow !== "visible"
        ) {
          clipped.push({
            text: t.slice(0, 44),
            needs: el.scrollWidth,
            has: el.clientWidth,
            overflow: st.overflow,
          });
        }
        if (
          el.scrollHeight > el.clientHeight + 1 &&
          st.overflowY === "hidden"
        ) {
          clipped.push({
            text: t.slice(0, 44),
            v: true,
            needs: el.scrollHeight,
            has: el.clientHeight,
          });
        }
      });

      /* Do any two controls sit on top of each other? */
      const ctrls = [
        ...panel.querySelectorAll("input, select, button, textarea"),
      ]
        .map((el) => ({ el, b: el.getBoundingClientRect() }))
        .filter((c) => c.b.width > 0 && c.b.height > 0);
      const overlaps = [];
      for (let i = 0; i < ctrls.length; i++)
        for (let j = i + 1; j < ctrls.length; j++) {
          const a = ctrls[i].b,
            b = ctrls[j].b;
          if (
            a.left < b.right - 2 &&
            b.left < a.right - 2 &&
            a.top < b.bottom - 2 &&
            b.top < a.bottom - 2
          ) {
            const id = (c) =>
              c.el.tagName.toLowerCase() +
              (c.el.id ? "#" + c.el.id : "") +
              (c.el.className && typeof c.el.className === "string"
                ? "." + c.el.className.split(" ")[0]
                : "");
            overlaps.push(id(ctrls[i]) + "  ><  " + id(ctrls[j]));
          }
        }

      const scaleSel = [...panel.querySelectorAll("select")].find((s) =>
        [...s.options].some((o) => /×/.test(o.textContent)),
      );

      return {
        panelW: Math.round(pr.width),
        controls: ctrls.length,
        headline: panel.textContent.replace(/\s+/g, " ").trim().slice(0, 90),
        clipped,
        clippedCount: clipped.length,
        overlaps: overlaps.slice(0, 6),
        overlapCount: overlaps.length,
        vectorScaleCount: [...panel.querySelectorAll("select")].filter((s) =>
          [...s.options].some((o) => /×/.test(o.textContent)),
        ).length,
        vectorScaleOptions: scaleSel
          ? [...scaleSel.options].map((o) => o.textContent.trim())
          : null,
        vectorScaleValue: scaleSel ? scaleSel.value : null,
      };
    });

  for (const s of steps) {
    await cat("STATICS");
    await page.waitForTimeout(300);
    try {
      await s.make();
    } catch (e) {
      out.panels.push({
        name: s.n,
        built: false,
        why: String(e.message).slice(0, 90),
      });
      continue;
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    /* Select twice: once to pick, once to open the editor. */
    await cat("STATICS");
    await page.waitForTimeout(250);
    await tool("select");
    await page.waitForTimeout(350);
    const x = r.l + r.w * s.at[0],
      y = r.t + r.h * s.at[1];
    await click(x, y);
    await click(x, y);
    await page.waitForTimeout(500);

    out.panels.push({ name: s.n, ...(await scan()) });
  }
  return out;
}
