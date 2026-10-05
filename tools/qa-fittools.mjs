/*
 * Reports which Fit tools are actually present in the UI.
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

  return await page.evaluate(() => {
    const sidebar = Array.from(document.querySelectorAll("[data-tool-id]")).map(
      (b) => b.dataset.toolId,
    );

    const global = Array.from(
      document.querySelectorAll("[data-global-tool]"),
    ).map((b) => b.dataset.globalTool);

    return {
      fitInSidebar: sidebar.filter((t) => /fit/i.test(t)),
      fitInGlobal: global.filter((t) => /fit/i.test(t)),
      sidebarCount: sidebar.length,
      globalCount: global.length,
    };
  });
}
