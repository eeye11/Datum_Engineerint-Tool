/*
 * Reports every horizontally scrollable region and whether it is
 * actually overflowing, so "make the toolbar wider" is aimed at the
 * one that really scrolls. Verification aid.
 */
export default async function run(page, ui) {
  await page.waitForLoadState("load", { timeout: 30000 });

  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ [^\n]*Engineering Drawing[^\n]*/)?.[0];

  if (tab) {
    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(900);
  }

  return await page.evaluate(() => {
    const rows = [];

    document
      .querySelectorAll(
        ".drawing-app-toolbar, .drawing-app-toolbar-groups, .drawing-sheet-bar, .drawing-style-strip, .drawing-tool-list, .drawing-workspace, .drawing-toolset-nav",
      )
      .forEach((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();

        rows.push({
          cls: String(el.className).slice(0, 46),
          overflowX: cs.overflowX,
          clientW: el.clientWidth,
          scrollW: el.scrollWidth,
          overflows: el.scrollWidth > el.clientWidth + 1,
          viewW: Math.round(r.width),
          children: el.children.length,
        });
      });

    return {
      viewport: window.innerWidth,
      rows,
    };
  });
}
