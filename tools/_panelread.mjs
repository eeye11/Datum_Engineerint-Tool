/*
 * IS THE PROPERTIES PANEL READABLE?
 *
 * Measures geometry, not screenshots. For each Statics feature it opens the
 * real editing page and reports:
 *
 *   clipped  - a leaf whose text needs more width than its box gives it,
 *              with no ellipsis to say so. An ellipsis is a deliberate
 *              shortening; a hard clip is a layout failure.
 *   overlap  - two controls whose boxes intersect, i.e. one sitting on top
 *              of another and stealing its clicks.
 *
 * Plus the Vector Scale dropdown: how many there are, their order, default.
 *
 * THE GESTURE, read from the source rather than guessed: clicking a feature
 * SELECTS it and shows the feature TREE; clicking the SAME feature again
 * opens its editing page. A scan that clicks once measures the tree, which
 * has no property rows in it - and reports nothing clipped, which is a
 * false all-clear.
 */
export default async function run(page) {
  const out = { errors: [], panels: [] };
  page.on("pageerror", (e) => out.errors.push(String(e.message).slice(0, 160)));

  await page.setViewportSize({ width: 1400, height: 950 });
  await page.goto("http://localhost:3000/", { waitUntil: "load" });
  await page.waitForTimeout(1500);

  await page.evaluate(() =>
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click(),
  );
  await page.waitForTimeout(1000);

  const rect = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const P = (fx, fy) => ({
    x: rect.left + rect.width * fx,
    y: rect.top + rect.height * fy,
  });

  const click = async (x, y) => {
    await page.mouse.move(x, y);
    await page.waitForTimeout(180);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(600);
  };
  const cat = (c) =>
    page.evaluate((k) => {
      const b = document.querySelector(
        `.drawing-category[data-category="${k}"]`,
      );
      if (b) b.click();
    }, c);
  const tool = (t) =>
    page.evaluate((id) => {
      const b = document.querySelector(`.drawing-tool[data-tool-id="${id}"]`);
      if (b) b.click();
    }, t);
  const sub = (id) =>
    page.evaluate((s) => {
      const b = document.querySelector(
        `.drawing-coordinate-submenu-item[data-submenu-id="${s}"]`,
      );
      if (b) b.click();
    }, id);
  const esc = async () => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  };

  const scan = (label) =>
    page.evaluate((l) => {
      const panel = document.getElementById("drawingProperties");
      if (!panel) return { label: l, err: "no #drawingProperties" };

      const leaves = [...panel.querySelectorAll("*")].filter(
        (el) =>
          el.children.length === 0 && (el.textContent || "").trim().length >= 3,
      );

      const clipped = [];
      leaves.forEach((el) => {
        const t = (el.textContent || "").trim();
        if (/^[0-9.,\-+×°]*$/.test(t)) return;
        const s = getComputedStyle(el);
        if (
          el.scrollWidth > el.clientWidth + 1 &&
          el.clientWidth > 0 &&
          s.textOverflow !== "ellipsis" &&
          s.overflow !== "visible"
        )
          clipped.push({
            text: t.slice(0, 40),
            needs: el.scrollWidth,
            has: el.clientWidth,
          });
      });

      const ctrls = [
        ...panel.querySelectorAll("input, select, button, textarea"),
      ]
        .map((el) => ({
          tag: el.tagName,
          id: el.id || el.name || el.type || "",
          r: el.getBoundingClientRect(),
        }))
        .filter((c) => c.r.width > 0 && c.r.height > 0);

      const overlap = [];
      for (let i = 0; i < ctrls.length; i++)
        for (let j = i + 1; j < ctrls.length; j++) {
          const a = ctrls[i].r,
            b = ctrls[j].r;
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox > 2 && oy > 2)
            overlap.push(
              `${ctrls[i].tag}:${ctrls[i].id} / ${ctrls[j].tag}:${ctrls[j].id}`,
            );
        }

      const scales = [...panel.querySelectorAll("select")].filter((s) =>
        [...s.options].some((o) => /×/.test(o.textContent)),
      );

      const pr = panel.getBoundingClientRect();
      return {
        label: l,
        panelW: Math.round(pr.width),
        controls: ctrls.length,
        clipped,
        overlap,
        vectorScales: scales.length,
        scaleOptions: scales[0]
          ? [...scales[0].options].map((o) => o.textContent.trim())
          : null,
        scaleValue: scales[0] ? scales[0].value : null,
      };
    }, label);

  const openPanel = async (label, pt) => {
    await tool("select");
    await page.waitForTimeout(350);
    await click(pt.x, pt.y);
    await click(pt.x, pt.y);
    await page.waitForTimeout(500);
    const r = await scan(label);
    await esc();
    return r;
  };

  /* a beam to attach things to */
  await cat("STATICS");
  await page.waitForTimeout(300);
  await tool("body");
  await page.waitForTimeout(300);
  await sub("beam");
  await page.waitForTimeout(400);
  await click(P(0.3, 0.3).x, P(0.3, 0.3).y);
  await click(P(0.6, 0.3).x, P(0.6, 0.3).y);
  await esc();

  out.panels.push(await openPanel("beam", P(0.45, 0.3)));

  const steps = [
    {
      label: "pin support",
      tool: "support",
      sub: "pin-support",
      pts: [P(0.45, 0.315), P(0.45, 0.315)],
      at: P(0.45, 0.315),
    },
    {
      label: "point force",
      tool: "point-force",
      sub: null,
      pts: [P(0.45, 0.315), P(0.45, 0.2)],
      at: P(0.45, 0.2),
    },
    {
      label: "applied moment",
      tool: "moment",
      sub: "applied-moment",
      pts: [P(0.5, 0.315)],
      at: P(0.5, 0.315),
    },
  ];

  for (const s of steps) {
    await cat("STATICS");
    await page.waitForTimeout(300);
    await tool(s.tool);
    await page.waitForTimeout(300);
    if (s.sub) {
      await sub(s.sub);
      await page.waitForTimeout(400);
    }
    for (const p of s.pts) await click(p.x, p.y);
    await esc();
    out.panels.push(await openPanel(s.label, s.at));
  }

  return out;
}
