/*
 * Lists what the fit measurement actually sees, so a failing margin
 * check can be attributed to a specific element. Verification aid.
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

  await page.evaluate(() => {
    document.querySelector('[data-global-tool="fit"]')?.click();
  });
  await page.waitForTimeout(600);

  return await page.evaluate(() => {
    const canvas = document.querySelector(".drawing-canvas");
    const cr = canvas.getBoundingClientRect();
    const svg = canvas.querySelector("svg");

    return {
      canvas: { w: Math.round(cr.width), h: Math.round(cr.height) },
      hasSvg: Boolean(svg),
      everything: Array.from(
        svg?.querySelectorAll("*") || []
      ).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          cls: String(el.className?.baseVal ?? el.className ?? "").slice(0, 30),
          w: Math.round(r.width),
          h: Math.round(r.height),
          left: Math.round(r.left - cr.left),
          top: Math.round(r.top - cr.top),
          stroke: el.getAttribute?.("stroke-width"),
          strokeOpacity: el.getAttribute?.("stroke-opacity"),
        };
      }),
    };
  });
}
