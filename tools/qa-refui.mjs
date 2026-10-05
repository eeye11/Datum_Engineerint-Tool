/*
 * Reports the reference controls and whether the drawing globals
 * exist, immediately after load and again after clicking the tab.
 * Verification aid, not part of the application.
 */
export default async function run(page, ui) {
  await page.waitForLoadState("load", { timeout: 20000 });

  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ [^\n]*Engineering Drawing[^\n]*/)?.[0];

  if (tab) {
    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(1200);
  }

  return await page.evaluate(() => {
    const g = (n) => typeof window[n];

    return {
      globals: {
        sheets: g("enggDrawingSheets"),
        reference: g("enggDrawingReference"),
        state: g("enggDrawingState"),
        export: g("enggDrawingExport"),
        written: g("enggWrittenReferences"),
      },
      controls: {
        input: Boolean(document.getElementById("writingInput")),
        output: Boolean(document.getElementById("writingOutput")),
        sheetSelect: Boolean(document.getElementById("referenceSheetSelect")),
        caption: Boolean(document.getElementById("referenceCaption")),
        insert: Boolean(document.getElementById("referenceInsert")),
      },
      /* How many drawing scripts actually executed. */
      sheetList: window.enggDrawingSheets
        ? window.enggDrawingSheets.all().length
        : null,
    };
  });
}
