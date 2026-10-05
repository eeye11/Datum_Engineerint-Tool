export default async function run(page) {
  const out = {};
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.stack || e).slice(0, 500)));

  await page.evaluate(() => {
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    [...document.querySelectorAll(".drawing-category")]
      .find((b) => /STATICS/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(500);

  // Real trusted click on the Bodies button
  await page.locator('.drawing-tool[data-tool-id="body"]').click();
  await page.waitForTimeout(500);

  out.expanded = await page.evaluate(() => {
    var b = document.querySelector('.drawing-tool[data-tool-id="body"]');
    return b.getAttribute("aria-expanded");
  });

  out.submenuItems = await page.evaluate(() =>
    [...document.querySelectorAll(".drawing-coordinate-submenu-item")].map(
      (b) => b.textContent.trim(),
    ),
  );

  out.errs = errs;
  return out;
}
