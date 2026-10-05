/*
 * Opens the Statics section for a screenshot, so the wrapping tool
 * names can be looked at. Verification aid, not part of the app.
 */
export default async function run(page, ui) {
  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ button "Engineering Drawing"/)?.[0];

  if (!tab) return { error: "no drawing tab", snap };

  await ui.click(tab.match(/@e\d+/)[0]);
  await page.waitForTimeout(700);

  await page.evaluate(() => {
    document
      .querySelector('.drawing-category[data-category="STATICS"]')
      ?.click();
  });
  await page.waitForTimeout(500);

  return { staticsOpen: true };
}
