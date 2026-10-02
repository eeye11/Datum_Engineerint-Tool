/*
 * Is the Features panel readable, for every Statics feature?
 *
 * MEASURES GEOMETRY. No screenshots, no "it looked fine". For each feature
 * it opens the real editing page and asks the live DOM three questions:
 *
 *   1. Is any text CLIPPED?  (scrollWidth > clientWidth on a leaf, with a
 *      hard overflow rather than a deliberate ellipsis)
 *   2. Do any two CONTROLS OVERLAP?  (bounding boxes intersecting)
 *   3. Is VECTOR SCALE present, once, ascending, default 1.0x?
 *
 * THE GESTURE, which is the part that is easy to get wrong:
 *   Clicking a feature SELECTS it and shows the feature TREE. Clicking the
 *   SAME feature AGAIN opens its editing page. `featurePanelView` is
 *   explicit "tree"/"edit" state and only the second click flips it.
 *   Measuring after one click measures the tree, which has no property
 *   rows in it - and a tree with nothing in it reports as "no cut-off
 *   text" for every feature, which is how a scan can clear the panel
 *   without ever having looked at it.
 */
export default async function run(page) {
  const out = { errors: [], panels: [] };
  page.on("pageerror", e => out.errors.push(String(e.message).slice(0, 160)));

  await page.setViewportSize({ width: 1400, height: 950 });
  await page.goto("http://localhost:3000/", { waitUntil: "load" });
  await page.waitForTimeout(1500);

  await page.evaluate(() =>
    [...document.querySelectorAll(".tab")]
      .find(b => /Engineering Drawing/i.test(b.textContent)).click());
  await page.waitForTimeout(900);

  const rect = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const P = (fx, fy) => ({ x: rect.x + rect.w * fx, y: rect.y + rect.h * fy });

  const click = async (x, y) => {
    await page.mouse.move(x, y); await page.waitForTimeout(180);
    await page.mouse.down(); await page.waitForTimeout(60);
    await page.mouse.up(); await page.waitForTimeout(600);
  };
  const cat = c => page.evaluate(k => {
    const b = document.querySelector(`.drawing-category[data-category="${k}"]`);
    if (b) b.click();
  }, c);
  const tool = id => page.evaluate(t => {
    const b = document.querySelector(`.drawing-tool[data-tool-id="${t}"]`);
    if (!b) throw new Error("no tool " + t);
    b.click();
  }, id);
  const sub = id => page.evaluate(t => {
    const i = document.querySelector(`.drawing-coordinate-submenu-item[data-submenu-id="${t}"]`);
    if (i) i.click();
  }, id);

  const scan = name => page.evaluate(n => {
    const panel = document.getElementById("drawingProperties");
    if (!panel) return { name: n, panel: "NO #drawingProperties" };

    const clipped = [];
    panel.querySelectorAll("*").forEach(el => {
      const t = (el.textContent || "").trim();
      if (!t || el.children.length > 0 || t.length < 3) return;
      if (/^[0-9.,\-+×°]*$/.test(t)) return;
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
        const s = getComputedStyle(el);
        if (s.textOverflow !== "ellipsis" && s.overflow !== "visible")
          clipped.push({ t: t.slice(0, 40), needs: el.scrollWidth, has: el.clientWidth });
      }
      if (el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 0) {
        const s = getComputedStyle(el);
        if (s.overflowY === "hidden")
          clipped.push({ t: t.slice(0, 40), vert: true, needs: el.scrollHeight, has: el.clientHeight });
      }
    });

    const ctrls = [...panel.querySelectorAll("input, select, button, textarea")]
      .map(el => ({ el, r: el.getBoundingClientRect() }))
      .filter(c => c.r.width > 2 && c.r.height > 2);
    const overlaps = [];
    for (let i = 0; i < ctrls.length; i++)
      for (let j = i + 1; j < ctrls.length; j++) {
        const a = ctrls[i].r, b = ctrls[j].r;
        if (a.left < b.right - 2 && b.left < a.right - 2 &&
            a.top < b.bottom - 2 && b.top < a.bottom - 2)
          overlaps.push([ctrls[i].el.tagName, ctrls[j].el.tagName]);
      }

    const scales = [...panel.querySelectorAll("select")]
      .filter(s => [...s.options].some(o => /×/.test(o.textContent)));
    const sel = scales[0];

    return {
      name: n,
      headline: (panel.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
      controls: ctrls.length,
      clippedCount: clipped.length,
      clipped: clipped.slice(0, 5),
      overlapCount: overlaps.length,
      overlaps: overlaps.slice(0, 4),
      vectorScale: sel
        ? { options: [...sel.options].map(o => o.textContent.trim()), value: sel.value }
        : null,
      scaleCount: scales.length
    };
  }, name);

  const build = [
    { name: "Beam", f: 0.30, g: async () => {
        await cat("STATICS"); await page.waitForTimeout(250);
        await tool("body"); await page.waitForTimeout(250);
        await sub("beam"); await page.waitForTimeout(350);
        const a = P(0.15, 0.40), b = P(0.45, 0.40);
        await click(a.x, a.y); await click(b.x, b.y); } },
    { name: "Pin Support", f: 0.42, g: async () => {
        await cat("STATICS"); await page.waitForTimeout(250);
        await tool("support"); await page.waitForTimeout(250);
        await sub("pin-support"); await page.waitForTimeout(400);
        const a = P(0.45, 0.42);
        await click(a.x, a.y); await click(a.x, a.y); } },
    { name: "Point Force", f: 0.35, g: async () => {
        await cat("STATICS"); await page.waitForTimeout(250);
        await tool("point-force"); await page.waitForTimeout(400);
        const a = P(0.30, 0.40), b = P(0.30, 0.28);
        await click(a.x, a.y); await click(b.x, b.y); } },
    { name: "Distributed Load", f: 0.30, g: async () => {
        await cat("STATICS"); await page.waitForTimeout(250);
        await tool("load"); await page.waitForTimeout(250);
        await sub("distributed-load"); await page.waitForTimeout(400);
        const a = P(0.18, 0.40), b = P(0.42, 0.40), c = P(0.30, 0.26);
        await click(a.x, a.y); await click(b.x, b.y);
        await page.mouse.move(c.x, c.y); await page.waitForTimeout(250);
        await page.mouse.down(); await page.waitForTimeout(60);
        await page.mouse.up(); await page.waitForTimeout(600); } },
    { name: "Applied Moment", f: 0.32, g: async () => {
        await cat("STATICS"); await page.waitForTimeout(250);
        await tool("moment"); await page.waitForTimeout(250);
        await sub("applied-moment"); await page.waitForTimeout(400);
        const a = P(0.25, 0.40);
        await click(a.x, a.y); } }
  ];

  for (const item of build) {
    try { await item.g(); }
    catch (e) { out.panels.push({ name: item.name, built: false, why: String(e.message).slice(0, 80) }); continue; }
  }

  /*
   * OPEN EACH EDITING PAGE FROM ITS TREE ROW.
   *
   * Clicking the feature on the canvas twice did not reach the editing page
   * for four of the five features: their panel came back holding the TREE
   * (headline was a list of feature names, and the Distributed Load - the
   * one that did work - had 35 controls against their 1 to 6).
   *
   * The row is the reliable route, and it is the gesture the Statics suite
   * already established: click the row once to pick it, click it AGAIN to
   * open editing. `featurePanelView` is explicit state and only the second
   * click flips it from "tree" to "edit".
   */
  for (const item of build) {
    const opened = await page.evaluate(name => {
      const rows = [...document.querySelectorAll("[data-object-id]")];
      const row = rows.find(r =>
        new RegExp("^" + name.split(" ")[0], "i").test((r.textContent || "").trim()));
      if (!row) return { ok: false, have: rows.map(x => (x.textContent || "").trim()) };
      row.click(); row.click();
      return { ok: true, row: (r.textContent || "").trim() };
    }, item.name);
    await page.waitForTimeout(500);

    if (!opened.ok) { out.panels.push({ name: item.name, panel: "NO ROW", have: opened.have }); continue; }
    out.panels.push(await scan(item.name));
  }

  return out;
}
