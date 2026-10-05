/*
 * Confirm the drawing modules mount, then exercise Smart Dimension live.
 */
export default async function run(page, ui) {
  const out = {};

  const tab = (await ui.snapshot()).match(
    /@(e\d+) button "Engineering Drawing"/,
  )?.[1];
  if (tab) {
    await ui.click(tab);
    await page.waitForTimeout(1200);
  }

  out.globals = await page.evaluate(() =>
    Object.keys(window)
      .filter((k) => /engg|Drawing/i.test(k))
      .slice(0, 80),
  );

  out.workspace = await page.evaluate(() => ({
    active: document.getElementById("drawing")?.classList.contains("active"),
    enggDrawing: typeof window.enggDrawing,
    state: Boolean(window.enggDrawing?.state),
    objects: window.enggDrawing?.state?.objects?.length ?? null,
  }));

  return out;
}
