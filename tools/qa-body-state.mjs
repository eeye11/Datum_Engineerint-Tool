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
  await page.waitForTimeout(500);

  out.toolState = await page.evaluate(() => {
    var b = document.querySelector('.drawing-tool[data-tool-id="particle"]');
    return {
      particleBtnExists: !!b,
      bodyPressed: document
        .querySelector('.drawing-tool[data-tool-id="body"]')
        .getAttribute("aria-pressed"),
      expanded: document
        .querySelector('.drawing-tool[data-tool-id="body"]')
        .getAttribute("aria-expanded"),
      menuStillOpen: document.querySelectorAll(".drawing-coordinate-submenu")
        .length,
    };
  });

  // What does setActiveTool think, and what is the state object?
  out.diag = await page.evaluate(() => {
    var s = window.enggDrawingState;
    if (!s) return { noStateGlobal: true };
    var st = s.getState ? s.getState() : null;
    return {
      activeTool: st && st.activeTool,
      keys: st ? Object.keys(st).slice(0, 40) : null,
    };
  });

  return out;
}
