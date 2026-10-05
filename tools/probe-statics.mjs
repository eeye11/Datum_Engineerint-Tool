export default async function run(page, ui) {
  await page
    .getByRole("button", { name: "Engineering Drawing" })
    .first()
    .click();
  await page.waitForTimeout(600);

  const statics = page.getByRole("button", { name: "STATICS" }).first();

  const before = await statics.count();
  const attrs = await statics.evaluate((n) => ({
    id: n.id,
    cls: n.className,
    parent: n.parentElement?.className,
    ariaExpanded: n.getAttribute("aria-expanded"),
    ariaHaspopup: n.getAttribute("aria-haspopup"),
  }));

  await statics.click();
  await page.waitForTimeout(500);

  const after = await statics.evaluate((n) => ({
    ariaExpanded: n.getAttribute("aria-expanded"),
    cls: n.className,
  }));

  const buttons = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button"))
      .map((b) => b.textContent.trim())
      .filter(Boolean),
  );

  return { before, attrs, after, buttons };
}
