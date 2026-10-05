/*
 * Reports every tool id the Statics and Geometry sections offer, so
 * the Fit test matrix exercises features that really exist.
 * Verification aid, not part of the application.
 */
export default async function run(page, ui) {
  await page.waitForLoadState("load", { timeout: 30000 });

  await page
    .waitForFunction(
      () => document.querySelectorAll("[data-tool-id]").length > 0,
      { timeout: 30000 },
    )
    .catch(() => null);

  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ [^\n]*Engineering Drawing[^\n]*/)?.[0];
  if (tab) {
    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(800);
  }

  const categories = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".drawing-category")).map(
      (el) => el.dataset.category,
    ),
  );

  const byCategory = {};

  for (const category of categories) {
    await page.evaluate((c) => {
      document
        .querySelector(`.drawing-category[data-category="${c}"]`)
        ?.click();
    }, category);
    await page.waitForTimeout(220);

    byCategory[category] = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-tool-id]")).map(
        (b) => b.dataset.toolId,
      ),
    );
  }

  return { categories, byCategory };
}
