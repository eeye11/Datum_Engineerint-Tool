/*
 * Finds which descendant of the tool list is wider than the list, so
 * the element imposing a floor can be named rather than guessed.
 * Verification aid, not part of the application.
 */
export default async function run(page, ui) {
  await page.waitForLoadState("load", { timeout: 30000 });

  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ [^\n]*Engineering Drawing[^\n]*/)?.[0];

  if (tab) {
    await ui.click(tab.match(/@e\d+/)[0]);
    await page.waitForTimeout(800);
  }

  await page.setViewportSize({
    width: 600,
    height: 820,
  });
  await page.waitForTimeout(500);

  return await page.evaluate(() => {
    const list = document.querySelector(".drawing-tool-list");

    const listW = list.clientWidth;

    const offenders = [];

    list.querySelectorAll("*").forEach((el) => {
      const w = el.scrollWidth;

      if (w > listW + 1) {
        const cs = getComputedStyle(el);

        offenders.push({
          cls: String(el.className).slice(0, 40),
          tag: el.tagName,
          scrollW: w,
          minWidth: cs.minWidth,
          whiteSpace: cs.whiteSpace,
        });
      }
    });

    return {
      listW,
      listScrollW: list.scrollWidth,
      offenders: offenders.slice(0, 8),
    };
  });
}
