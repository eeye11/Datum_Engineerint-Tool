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

  // Ground truth for "is the particle tool armed":
  // renderToolButton sets aria-pressed on the PARENT when a child is active.
  out.armed = await page.evaluate(() => {
    const b = document.querySelector('.drawing-tool[data-tool-id="body"]');
    return {
      pressed: b.getAttribute("aria-pressed"),
      cls: b.className,
      canvasToolActive: document
        .querySelector(".drawing-canvas")
        .classList.contains("drawing-tool-active"),
    };
  });

  // Ground truth for "was anything created": the Features panel.
  const features = () =>
    page.evaluate(() => {
      const p = document.querySelector(".drawing-properties");
      return p ? p.textContent.replace(/\s+/g, " ").trim().slice(0, 200) : null;
    });

  out.featuresBefore = await features();

  // Try a synthetic click directly on the canvas element (no pointerdown
  // sequence), to remove any rubber-band/selection suppression.
  out.synthetic = await page.evaluate(() => {
    const c = document.querySelector(".drawing-canvas");
    const r = c.getBoundingClientRect();
    const x = r.left + r.width / 2,
      y = r.top + r.height / 2;
    c.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: x,
        clientY: y,
        detail: 1,
      }),
    );
    return true;
  });
  await page.waitForTimeout(700);
  out.featuresAfterSynthetic = await features();

  return out;
}
