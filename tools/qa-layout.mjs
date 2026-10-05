export default async function run(page) {
  const out = { viewports: [], errors: [] };
  page.on("pageerror", (e) =>
    out.errors.push(String(e.message || e).slice(0, 200)),
  );

  await page.evaluate(() => {
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(900);

  await page.evaluate(() => {
    document
      .querySelector('.drawing-category[data-category="STATICS"]')
      .click();
  });
  await page.waitForTimeout(600);

  /*
   * Measure every visible control and look for real overlaps.
   *
   * An overlap is two boxes that genuinely intersect - not one merely
   * close to another - and only controls that are actually visible, so a
   * collapsed panel or a hidden submenu cannot be reported as covering
   * something.
   */
  const measure = () =>
    page.evaluate(() => {
      const controls = [
        ...document.querySelectorAll(
          ".drawing-tool, .drawing-category, .drawing-tool-panel-toggle, " +
            ".drawing-features-panel-toggle, .drawing-coordinate-submenu, " +
            ".drawing-coordinate-submenu-item, [data-global-tool]",
        ),
      ]
        .map((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);

          return {
            id:
              el.dataset.toolId ||
              el.dataset.globalTool ||
              el.dataset.submenuId ||
              el.className,
            label: el.textContent.replace(/\s+/g, " ").trim().slice(0, 24),
            x: Math.round(r.left),
            y: Math.round(r.top),
            w: Math.round(r.width),
            h: Math.round(r.height),
            visible:
              r.width > 0 &&
              r.height > 0 &&
              cs.visibility !== "hidden" &&
              cs.display !== "none" &&
              cs.opacity !== "0",
            position: cs.position,
            z: cs.zIndex,
          };
        })
        .filter((c) => c.visible);

      const overlaps = [];

      for (let i = 0; i < controls.length; i++) {
        for (let j = i + 1; j < controls.length; j++) {
          const a = controls[i];
          const b = controls[j];

          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);

          if (ox > 0 && oy > 0) {
            overlaps.push({
              a: a.id,
              b: b.id,
              overlapPx: `${ox}x${oy}`,
              aPos: a.position,
              bPos: b.position,
            });
          }
        }
      }

      const panel = document.querySelector(
        ".drawing-tool-list, .drawing-tools",
      );

      return {
        count: controls.length,
        controls: controls.map((c) => ({
          id: c.id,
          label: c.label,
          rect: `${c.x},${c.y} ${c.w}x${c.h}`,
          position: c.position,
          z: c.z,
        })),
        overlaps,
        panel: panel
          ? {
              scrollH: panel.scrollHeight,
              clientH: panel.clientHeight,
              overflows: panel.scrollHeight > panel.clientHeight + 1,
              overflowY: getComputedStyle(panel).overflowY,
            }
          : null,
      };
    });

  for (const size of [
    { w: 1600, h: 900 },
    { w: 1280, h: 720 },
    { w: 1024, h: 640 },
  ]) {
    await page.setViewportSize({ width: size.w, height: size.h });
    await page.waitForTimeout(500);

    const m = await measure();

    out.viewports.push({
      size: `${size.w}x${size.h}`,
      controlCount: m.count,
      overlaps: m.overlaps,
      panel: m.panel,
      controls: m.controls,
    });
  }

  return out;
}
