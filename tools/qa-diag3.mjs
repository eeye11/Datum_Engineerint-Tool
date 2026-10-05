export default async function run(page) {
  const out = {};

  await page.evaluate(() => {
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    [...document.querySelectorAll(".drawing-category")]
      .find((b) => /STATICS/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(400);
  await page.locator('.drawing-tool[data-tool-id="body"]').click();
  await page.waitForTimeout(400);
  await page
    .locator(".drawing-coordinate-submenu-item", { hasText: "Particle" })
    .first()
    .click();
  await page.waitForTimeout(600);

  // Read state through a same-world function injected via a <script> tag,
  // which executes in the page's own world rather than the eval sandbox.
  await page.evaluate(() => {
    const s = document.createElement("script");
    s.textContent = `
      window.__peek = function () {
        var st = window.__ds || (window.__ds = null);
        return null;
      };
    `;
    document.head.appendChild(s);
  });

  out.hasGlobal = await page.evaluate(() => typeof window.enggDrawingState);

  // Use the exposed API to read the live drawing state.
  out.apiKeys = await page.evaluate(() =>
    window.enggDrawingState
      ? Object.keys(window.enggDrawingState).slice(0, 60)
      : null,
  );

  out.activeTool = await page.evaluate(() => {
    const s = window.enggDrawingState;
    if (!s) return null;
    // find any function that returns the state object
    for (const k of Object.keys(s)) {
      const v = s[k];
      if (typeof v === "function" && /state/i.test(k)) {
        try {
          const r = v();
          if (r && r.activeTool !== undefined)
            return { via: k, activeTool: r.activeTool };
        } catch (e) {}
      }
    }
    return null;
  });

  return out;
}
