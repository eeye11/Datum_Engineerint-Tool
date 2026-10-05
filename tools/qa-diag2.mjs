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

  // Record every canvas click plus the feature-tree row count.
  await page.evaluate(() => {
    window.__t = [];
    document.querySelector(".drawing-canvas").addEventListener(
      "click",
      () => {
        window.__t.push("click-seen");
      },
      true,
    );
  });

  var box = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return {
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
    };
  });

  // Move first (so a mousemove resolution exists), then click.
  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(300);
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(800);

  out.trace = await page.evaluate(() => window.__t);

  // Count rendered feature rows / svg feature groups as ground truth.
  out.rendered = await page.evaluate(() => {
    const svg = document.querySelector(".drawing-renderer");
    const tree = document.querySelector(
      ".drawing-feature-tree, .drawing-properties",
    );
    return {
      svgChildren: svg ? svg.children.length : -1,
      treeText: tree
        ? tree.textContent.replace(/\s+/g, " ").trim().slice(0, 180)
        : null,
    };
  });

  out.coords = await page.evaluate(() => {
    const el = document.querySelector("#drawingCoordinates");
    return el ? el.textContent.trim().slice(0, 60) : null;
  });

  return out;
}
