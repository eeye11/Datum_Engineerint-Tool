/*
 * Reports the workspace class list and the matching CSS rule, to
 * find why a collapsed panel's track is not shrinking.
 * Verification aid, not part of the application.
 */
export default async function run(page, ui) {
  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ button "Engineering Drawing"/)?.[0];

  if (!tab) return { error: "no drawing tab", snap };

  await ui.click(tab.match(/@e\d+/)[0]);
  await page.waitForTimeout(700);

  await page.click("#drawingToolPanelToggle");
  await page.click("#drawingFeaturesPanelToggle");
  await page.waitForTimeout(500);

  return await page.evaluate(() => {
    const w = document.querySelector(".drawing-workspace");

    const railClasses = {
      left: document.querySelector(".drawing-panel-rail-left")?.className,
      right: document.querySelector(".drawing-panel-rail-right")?.className,
    };

    /*
     * Walk the stylesheet for every rule that sets a column
     * template, and report which one the browser currently
     * considers to apply.
     */
    const rules = [];

    for (const sheet of document.styleSheets) {
      let list;

      try {
        list = sheet.cssRules;
      } catch {
        continue;
      }

      for (const rule of list) {
        if (rule.selectorText && rule.style && rule.style.gridTemplateColumns) {
          rules.push({
            sel: rule.selectorText,
            cols: rule.style.gridTemplateColumns,
          });
        }
      }
    }

    return {
      workspaceClass: w.className,
      railClasses,
      computedTemplate: getComputedStyle(w).gridTemplateColumns,
      columnRules: rules,
    };
  });
}
