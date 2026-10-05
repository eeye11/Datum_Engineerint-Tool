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
  await page.waitForTimeout(700);

  // Does the TOOLBAR re-render list a particle tool button at all?
  out.toolIds = await page.evaluate(() =>
    [...document.querySelectorAll(".drawing-tool")].map(
      (b) => b.dataset.toolId,
    ),
  );

  out.statusNow = await page.evaluate(() => {
    var el = document.querySelector(".drawing-tool-message");
    return el ? el.textContent.trim() : null;
  });

  // Compare against a tool that is known to work: Point Force (direct button).
  await page.evaluate(() => {
    var b = document.querySelector('.drawing-tool[data-tool-id="point-force"]');
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  out.statusAfterPointForce = await page.evaluate(() => {
    var el = document.querySelector(".drawing-tool-message");
    return el ? el.textContent.trim() : null;
  });

  return out;
}
